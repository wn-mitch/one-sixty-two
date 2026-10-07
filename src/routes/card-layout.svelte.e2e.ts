import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Manifest, Profile, Slot } from '../lib/game/types.ts';
import { selectPhoto } from '../lib/media/client.ts';
import type { MediaManifest, MediaPointer } from '../lib/media/types.ts';
import type { WarRankings, WarRankingsPointer } from '../lib/rankings/types.ts';
import { isHitter } from '../lib/components/candidate-ranking.ts';

const ERAS = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
const WIDTHS = [240, 320] as const;

test.setTimeout(180000);

interface Specimen {
	label: string;
	profile: Profile;
	slot: Slot | null;
}

interface HarnessAssets {
	js: string;
	css: string;
}

let harnessAssets: HarnessAssets | undefined;
let harnessDirectory: string | undefined;

async function getJson<T>(request: APIRequestContext, url: string): Promise<T> {
	const response = await request.get(url);
	expect(response.ok(), `GET ${url}`).toBe(true);
	return response.json() as Promise<T>;
}

async function currentManifest(request: APIRequestContext): Promise<Manifest> {
	const pointer = await getJson<{ manifestUrl: string }>(request, '/data/current.json');
	return getJson<Manifest>(request, pointer.manifestUrl);
}

async function currentMedia(request: APIRequestContext): Promise<MediaManifest> {
	const pointer = await getJson<MediaPointer>(request, '/media/current.json');
	return getJson<MediaManifest>(request, pointer.manifestUrl);
}

async function currentRankings(request: APIRequestContext): Promise<WarRankings> {
	const pointer = await getJson<WarRankingsPointer>(request, '/rankings/current.json');
	return getJson<WarRankings>(request, pointer.manifestUrl);
}

function slotFor(profile: Profile): Slot | null {
	return profile.eligibleSlots.find(isHitter)
		?? profile.eligibleSlots.find(slot => !isHitter(slot))
		?? null;
}

function isTwoWay(profile: Profile): boolean {
	return !!profile.batting && !!profile.pitching
		&& profile.eligibleSlots.some(isHitter)
		&& profile.eligibleSlots.some(slot => !isHitter(slot));
}

function selectedPhoto(media: MediaManifest, profile: Profile): boolean {
	return !!selectPhoto(media, profile.playerId, profile.year);
}

async function selectSpecimens(
	request: APIRequestContext,
	manifest: Manifest,
	media: MediaManifest
): Promise<Specimen[]> {
	const predicates: Array<[string, (profile: Profile) => boolean, (profile: Profile) => Slot | null]> = [
		['player-with-photo', profile => !profile.bullpen && profile.eligibleSlots.some(isHitter) && selectedPhoto(media, profile), slotFor],
		['pitcher', profile => !profile.bullpen && !!profile.pitching && profile.eligibleSlots.some(slot => !isHitter(slot)) && !isTwoWay(profile), profile => profile.eligibleSlots.find(slot => !isHitter(slot)) ?? null],
		['two-way', isTwoWay, profile => profile.eligibleSlots.find(isHitter) ?? null],
		['bullpen', profile => !!profile.bullpen && profile.eligibleSlots.includes('BP'), () => 'BP'],
		['long-name', profile => profile.displayName.length >= 24, slotFor],
		['compound-hyphen', profile => /\S-\S/.test(profile.displayName), slotFor],
		['long-team', profile => profile.historicalTeam.length >= 26, slotFor],
		['no-photo', profile => !profile.bullpen && !selectedPhoto(media, profile), slotFor]
	];
	const selected = new Map<string, Specimen>();

	for (const chunkUrl of Object.values(manifest.chunks)) {
		const profiles = await getJson<Profile[]>(request, chunkUrl);
		for (const profile of profiles) {
			for (const [label, matches, chooseSlot] of predicates) {
				if (selected.has(label) || !matches(profile)) continue;
				const slot = chooseSlot(profile);
				if (slot) selected.set(label, { label, profile, slot });
			}
		}
		if (selected.size === predicates.length) break;
	}

	const missing = predicates.map(([label]) => label).filter(label => !selected.has(label));
	expect(missing, 'The live manifest must supply every card-layout specimen').toEqual([]);
	return predicates.map(([label]) => selected.get(label)!);
}

async function buildHarness(): Promise<HarnessAssets> {
	await mkdir(resolve('node_modules/.cache'), { recursive: true });
	harnessDirectory = await mkdtemp(resolve('node_modules/.cache/card-layout-'));
	const directory = harnessDirectory;
	const entry = join(directory, 'card-layout-entry.ts');
	const cardPath = resolve('src/lib/cards/Card.svelte');
	const modelPath = resolve('src/lib/cards/view-model.ts');
	const tokensPath = resolve('src/lib/cards/tokens.ts');
	await writeFile(entry, `
import { mount, tick, unmount } from 'svelte';
import Card from ${JSON.stringify(cardPath)};
import { createCardViewModel } from ${JSON.stringify(modelPath)};
import { contrast, mix } from ${JSON.stringify(tokensPath)};

let models = [];

export function prepare(input) {
	models = input.specimens.map(({ label, profile, slot }) => ({
		label,
		model: createCardViewModel({ profile, slot, media: input.media, manifest: input.manifest, rankings: input.rankings })
	}));
}

function afterLayout() {
	return tick()
		.then(() => document.fonts.ready)
		.then(() => {
			const { promise, resolve } = Promise.withResolvers();
			requestAnimationFrame(() => requestAnimationFrame(resolve));
			return promise;
		});
}

function colorHex(cssColor) {
	return '#' + cssColor.match(/[0-9.]+/g).slice(0, 3)
		.map(value => Math.round(Number(value)).toString(16).padStart(2, '0')).join('');
}

function inkProblems(host) {
	const problems = [];
	for (const node of host.querySelectorAll('[data-layer="photo.empty"] > span, [data-layer="family.title"] > span:not([aria-hidden])')) {
		let ground = node.parentElement;
		let background;
		while (ground) {
			background = getComputedStyle(ground);
			const channels = background.backgroundColor.match(/[0-9.]+/g);
			if (channels && (channels.length === 3 || Number(channels[3]) === 1)) break;
			ground = ground.parentElement;
		}
		if (!ground) throw new Error('Card text has no opaque ground');
		const ink = colorHex(getComputedStyle(node).color);
		const solid = colorHex(background.backgroundColor);
		const stripe = Number(background.backgroundImage.match(/rgba[(]255,[ ]*255,[ ]*255,[ ]*([0-9.]+)[)]/)?.[1] ?? 0);
		const minimum = Math.min(contrast(ink, solid), contrast(ink, mix(solid, '#ffffff', stripe)));
		if (minimum < 4.5) problems.push({ kind: 'text-contrast', layer: node.parentElement.dataset.layer, text: node.textContent, minimum });
	}
	return problems;
}

function problemsFor(host) {
	const problems = inkProblems(host);
	for (const node of host.querySelectorAll('[data-overflow]')) {
		problems.push({ kind: 'fit', layer: node.dataset.layer, text: node.textContent, fitted: node.dataset.fitted });
	}
	for (const node of host.querySelectorAll('[data-rt], [data-layer="family.key.value"], [data-layer="family.count.value"]')) {
		if (node instanceof SVGTextElement) {
			const target = Number(node.dataset.fitArc);
			if (target && node.getComputedTextLength() > target + .5) {
				problems.push({ kind: 'arc-length', layer: node.dataset.layer, length: node.getComputedTextLength(), target });
			}
			continue;
		}
		const css = getComputedStyle(node);
		if (css.whiteSpace === 'nowrap' && node.clientWidth && node.scrollWidth > node.clientWidth + 1) {
			problems.push({ kind: 'nowrap', layer: node.dataset.layer, text: node.textContent, width: node.clientWidth, scroll: node.scrollWidth });
		}
		if (node.dataset.layer?.endsWith('.value') && node.parentElement
			&& node.getBoundingClientRect().width > node.parentElement.getBoundingClientRect().width + 1) {
			problems.push({ kind: 'stat-width', layer: node.dataset.layer, text: node.textContent });
		}
	}
	for (const node of host.querySelectorAll('[data-layer="families"], [data-layer="back.flow"], [data-layer="back.panel"]')) {
		if (node.scrollHeight > node.clientHeight + 1) {
			problems.push({ kind: 'panel-height', layer: node.dataset.layer, height: node.clientHeight, scroll: node.scrollHeight });
		}
		if (node.scrollWidth > node.clientWidth + 1) {
			problems.push({ kind: 'panel-width', layer: node.dataset.layer, width: node.clientWidth, scroll: node.scrollWidth });
		}
	}
	return problems;
}

export async function inspect({ eras, widths }) {
	const host = document.createElement('div');
	host.style.cssText = 'position:fixed;left:0;top:0;z-index:10000;width:240px;background:#121419;font-family:"Barlow Condensed",sans-serif;';
	document.body.append(host);
	const reports = [];
	try {
		for (const era of eras) for (const { label, model } of models) for (const width of widths) for (const face of ['front', 'back']) {
			host.style.width = width + 'px';
			const instance = mount(Card, { target: host, props: { s: { ...model, era }, face, onDetails: () => {} } });
			await afterLayout();
			reports.push({ era, label, width, face, problems: problemsFor(host) });
			await unmount(instance);
			host.replaceChildren();
		}
		const cards = models.slice(0, 2).map(({ model }) => mount(Card, { target: host, props: { s: { ...model, era: '1970s' }, face: 'front', onDetails: () => {} } }));
		await afterLayout();
		const paths = [...host.querySelectorAll('svg path[id]')].map(path => path.id);
		const hrefs = [...host.querySelectorAll('textPath')].map(path => path.getAttribute('href'));
		const duplicateArcIds = paths.length === new Set(paths).size ? [] : paths;
		const brokenArcRefs = hrefs.filter(href => !href || !host.querySelector(href));
		await Promise.all(cards.map(unmount));
		return { cases: reports.length, failures: reports.filter(report => report.problems.length), duplicateArcIds, brokenArcRefs };
	} finally {
		host.remove();
	}
}
`, 'utf8');
	const output = join(directory, 'dist');
	await build({
		configFile: false,
		plugins: [svelte()],
		build: {
			outDir: output,
			copyPublicDir: false,
			lib: {
				entry,
				name: 'CardLayoutHarness',
				formats: ['iife'],
				fileName: 'card-layout',
				cssFileName: 'card-layout'
			}
		}
	});
	const assets = await readdir(output);
	const js = assets.find(asset => asset.endsWith('.js'));
	const css = assets.find(asset => asset.endsWith('.css'));
	if (!js || !css) throw new Error(`Card layout harness build did not produce JS and CSS: ${assets.join(', ')}`);
	return { js: join(output, js), css: join(output, css) };
}

async function installHarness(page: Page): Promise<void> {
	const assets = harnessAssets;
	if (!assets) throw new Error('Card layout harness was not built');
	await page.route('**/__card-layout.js', route => route.fulfill({ path: assets.js }));
	await page.route('**/__card-layout.css', route => route.fulfill({ path: assets.css }));
	await page.goto('/about');
	await page.addStyleTag({ url: '/__card-layout.css' });
	await page.addScriptTag({ url: '/__card-layout.js' });
}

test.beforeAll(async () => {
	harnessAssets = await buildHarness();
});

test.afterAll(async () => {
	if (harnessDirectory) await rm(harnessDirectory, { recursive: true, force: true });
});

test('keeps every era composition within its live card geometry', async ({ page, request }) => {
	const [manifest, media, rankings] = await Promise.all([
		currentManifest(request),
		currentMedia(request),
		currentRankings(request)
	]);
	const specimens = await selectSpecimens(request, manifest, media);
	await installHarness(page);
	const result = await page.evaluate(async input => {
		const harness = (window as typeof window & { CardLayoutHarness: { prepare(input: unknown): void; inspect(input: unknown): Promise<unknown> } }).CardLayoutHarness;
		harness.prepare(input);
		return harness.inspect({ eras: input.eras, widths: input.widths });
	}, { specimens, media, manifest, rankings, eras: ERAS, widths: WIDTHS }) as {
		cases: number;
		failures: unknown[];
		duplicateArcIds: string[];
		brokenArcRefs: string[];
	};

	expect(result.cases).toBe(ERAS.length * specimens.length * WIDTHS.length * 2);
	expect(result.failures).toEqual([]);
	expect(result.duplicateArcIds).toEqual([]);
	expect(result.brokenArcRefs).toEqual([]);
});
