import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Manifest, Profile, Slot } from '../lib/game/types.ts';
import { selectPhoto } from '../lib/media/client.ts';
import type { CaptureDate, MediaManifest, MediaPointer } from '../lib/media/types.ts';
import { photoLabel } from '../lib/media/photo-policy.ts';
import type { WarRankings, WarRankingsPointer } from '../lib/rankings/types.ts';
import { isHitter } from '../lib/components/candidate-ranking.ts';
import type { CompactPixelClip } from './compact-test-harness.ts';
import { imagePixelDigest } from './image-test-helpers.ts';

const ERAS = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
const WIDTHS = [240, 320, 330, 410] as const;

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
	return !!selectPhoto(media, profile.playerId, profile.year, profile.franchiseId);
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
import CardFlip from ${JSON.stringify(resolve('src/lib/cards/CardFlip.svelte'))};
import { createCardViewModel } from ${JSON.stringify(modelPath)};
import { contrast, mix } from ${JSON.stringify(tokensPath)};
import { compactNameClips as readCompactNameClips, inspectCompact as inspectCompactModels, previewCompact as renderCompact, disposeCompact } from ${JSON.stringify(resolve('src/routes/compact-test-harness.ts'))};

let models = [];

export function prepare(input) {
	models = input.specimens.map(({ label, profile, slot }) => ({
		label,
		model: createCardViewModel({ profile, slot, media: input.media, manifest: input.manifest, rankings: input.rankings })
	}));
}

export function inspectCompact({ eras, widths }) {
	return inspectCompactModels(models.map(entry => entry.model), eras, widths);
}

export function previewCompact(era) {
	return renderCompact(models[0].model, era);
}

export { disposeCompact, readCompactNameClips as compactNameClips };

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
		for (const era of eras) for (const { label, model } of models) for (const width of [330, 410]) {
			host.style.width = width + 'px';
			const instance = mount(CardFlip, { target: host, props: { s: { ...model, era }, turned: true, onDetails: () => {} } });
			await afterLayout();
			const back = host.querySelector('.back [data-card]');
			const front = host.querySelector('.front');
			const rect = { width: back.offsetWidth, height: back.offsetHeight };
			const problems = problemsFor(back);
			if (back.dataset.card !== era || back.dataset.face !== 'back' || !front.inert || front.getAttribute('aria-hidden') !== 'true'
				|| Math.abs(rect.width - width) > 1 || Math.abs(rect.width / rect.height - 5 / 7) > .01) {
				problems.push({ kind: 'designed-flip-geometry', width: rect.width, height: rect.height });
			}
			reports.push({ era, label, width, face: 'flipped-back', problems });
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

export async function preview() {
	const host = document.createElement('div');
	host.id = 'portrait-policy-preview';
	host.style.cssText = 'position:absolute;left:0;top:0;z-index:10000;display:grid;grid-template-columns:repeat(4,320px);gap:16px;padding:16px;background:#121419;';
	document.body.append(host);
	for (const { model } of models) {
		const frame = document.createElement('div'); frame.style.width = '320px'; host.append(frame);
		mount(Card, { target: frame, props: { s: model, face: 'front', onDetails: () => {} } });
	}
	await afterLayout();
	await Promise.all([...host.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
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

	expect(result.failures).toEqual([]);
	expect(result.duplicateArcIds).toEqual([]);
	expect(result.brokenArcRefs).toEqual([]);
});

test('shows reviewed uncertain dates and uniform contexts across all eight eras', async ({ page, request }, testInfo) => {
	const [manifest, current, rankings] = await Promise.all([currentManifest(request), currentMedia(request), currentRankings(request)]);
	const base = (await selectSpecimens(request, manifest, current))[0];
	const approved = Object.values(current.players).flatMap(player => player.photos).filter(photo => photo.review === 'approved');
	expect(approved.length).toBeGreaterThan(0);
	const media: MediaManifest = { ...current, schemaVersion: 3, players: {} };
	const expected: string[] = [];
	const specimens = ERAS.map((era, i) => {
		const year = Number(era.slice(0, 4)) + 5;
		const id = `synthetic-media-${i}`;
		const dates: CaptureDate[] = [{ kind: 'exact', year }, { kind: 'approximate', year: year - 1 }, { kind: 'range', firstYear: year - 3, lastYear: year + 1 }, { kind: 'unknown' }];
		const captureDate = dates[i % dates.length];
		const selected = approved[i % approved.length];
		const photo = { ...selected, year: captureDate.kind === 'exact' ? captureDate.year : undefined, captureDate,
			uniform: i === 4 ? 'minor' as const : i === 5 ? 'other' as const : 'mlb' as const,
			context: i >= 6 ? 'later' as const : 'playing' as const };
		media.players[id] = { name: 'Example Athlete', firstYear: 1950, lastYear: 2025, photos: [photo] };
		expected.push(photoLabel(photo, year));
		return { ...base, label: id, profile: { ...base.profile, playerId: id, displayName: 'Example Athlete', year, seasonId: `${id}:${year}:AL:${base.profile.franchiseId}` } };
	});
	await installHarness(page);
	const result = await page.evaluate(async input => {
		const harness = (window as typeof window & { CardLayoutHarness: { prepare(input: unknown): void; inspect(input: unknown): Promise<{ failures: unknown[] }>; preview(): Promise<void> } }).CardLayoutHarness;
		harness.prepare(input); const result = await harness.inspect({ eras: input.eras, widths: [240, 320] }); await harness.preview(); return result;
	}, { specimens, media, manifest, rankings, eras: ERAS });
	expect(result.failures).toEqual([]);
	const host = page.locator('#portrait-policy-preview');
	// Use the actual rendered image alt text: the photo year must not be replaced with the card year.
	for (const label of expected) await expect(host.getByRole('img', { name: `Example Athlete · ${label}`, exact: true })).toHaveCount(1);
	await expect(host.locator('[data-card][data-face="front"]')).toHaveCount(8);
	await host.screenshot({ path: testInfo.outputPath('portrait-policy-eight-eras.png') });
});

test('keeps compact text readable above every era finish at its minimum width', async ({ page, request }, testInfo) => {
	const [manifest, media, rankings] = await Promise.all([
		currentManifest(request), currentMedia(request), currentRankings(request)
	]);
	const specimens = await selectSpecimens(request, manifest, media);
	await installHarness(page);
	const failures = await page.evaluate(async input => {
		const harness = (window as typeof window & { CardLayoutHarness: {
			prepare(input: unknown): void;
			inspectCompact(input: unknown): Promise<unknown[]>;
		} }).CardLayoutHarness;
		harness.prepare(input);
		return harness.inspectCompact({ eras: input.eras, widths: [64, 72, 96] });
	}, { specimens, media, manifest, rankings, eras: ERAS });
	expect(failures).toEqual([]);
	try {
		for (const era of ERAS) {
			await page.evaluate(era => (window as typeof window & {
				CardLayoutHarness: { previewCompact(era: string): Promise<void> };
			}).CardLayoutHarness.previewCompact(era), era);
			const preview = page.locator('#compact-card-preview');
			await preview.screenshot({ path: testInfo.outputPath(`compact-${era}.png`) });
			const clips = await page.evaluate(() => (window as typeof window & {
				CardLayoutHarness: { compactNameClips(): CompactPixelClip[] };
			}).CardLayoutHarness.compactNameClips());
			expect(clips.length, `${era} compact name must expose rendered glyph bounds`).toBeGreaterThan(0);
			const withFinish = await Promise.all(clips.map(clip => page.screenshot({ clip, type: 'png' })));
			await preview.locator('[data-layer="material"]').evaluate(node => {
				(node as HTMLElement).style.visibility = 'hidden';
			});
			const withoutFinish = await Promise.all(clips.map(clip => page.screenshot({ clip, type: 'png' })));
			for (const [index, image] of withoutFinish.entries()) {
				const visiblePixels = await imagePixelDigest(page, { base64: withFinish[index].toString('base64') });
				const hiddenPixels = await imagePixelDigest(page, { base64: image.toString('base64') });
				if (hiddenPixels.sha256 !== visiblePixels.sha256) {
					const visiblePath = testInfo.outputPath(`${era}-name-${index + 1}-with-finish.png`);
					const hiddenPath = testInfo.outputPath(`${era}-name-${index + 1}-without-finish.png`);
					await Promise.all([writeFile(visiblePath, withFinish[index]), writeFile(hiddenPath, image)]);
					await testInfo.attach(`${era}-name-${index + 1}-with-finish.png`, { path: visiblePath, contentType: 'image/png' });
					await testInfo.attach(`${era}-name-${index + 1}-without-finish.png`, { path: hiddenPath, contentType: 'image/png' });
				}
				expect(hiddenPixels, `${era} finish must not change compact name glyph or backing pixels`).toEqual(visiblePixels);
			}
		}
	} finally {
		await page.evaluate(() => (window as typeof window & {
			CardLayoutHarness: { disposeCompact(): Promise<void> };
		}).CardLayoutHarness.disposeCompact());
	}
});
