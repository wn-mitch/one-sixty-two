/**
 * Measures every era front in Storybook and chooses its sticker slots.
 *
 *   just sticker-slots [--storybook http://127.0.0.1:6409] [--solve]
 *
 * Loads the `Cards/Sticker slots` story once per era with every finish, name length, role and
 * missing photo, records the union of each protected layer's box, the photo window they all share
 * and the gem ring, and writes src/lib/collection/sticker-layout.json. It then solves each era's
 * grade spot and face slots into sticker-slots.json. `--solve` skips the browser and re-solves the
 * committed layout. Storybook must already be running.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { CardEra } from '../src/lib/cards/view-model.ts';
import { ERA_PLACEMENT, ERA_SET_SHAPES, PROTECTED_LAYER_SELECTOR, solveStickerSlots, type EraLayout, type EraStickerSlots, type LayoutBox, type StickerLayout } from '../src/lib/collection/sticker-slots.ts';

const ERAS: readonly CardEra[] = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
const LAYOUT_PATH = new URL('../src/lib/collection/sticker-layout.json', import.meta.url);
const SLOTS_PATH = new URL('../src/lib/collection/sticker-slots.json', import.meta.url);
const ASPECT = 1.4;
/** The widest finish rim (the 1960s, see Card.svelte), as a fraction of the card width. */
const RIM = 0.032;

const args = process.argv.slice(2);
const storybook = args.includes('--storybook') ? args[args.indexOf('--storybook') + 1] : 'http://127.0.0.1:6409';

interface Edges { x0: number; y0: number; x1: number; y1: number }
const toBox = (edges: Edges, layer?: string): LayoutBox => ({
	x: Math.floor(edges.x0 * 1e4) / 1e4, y: Math.floor(edges.y0 * 1e4) / 1e4,
	w: Math.ceil((edges.x1 - edges.x0) * 1e4) / 1e4, h: Math.ceil((edges.y1 - edges.y0) * 1e4) / 1e4,
	...(layer ? { layer } : {})
});

/** Opens a sticker slots story and sets its args over the preview channel; string args in the URL do not reach this Storybook's stories. */
async function load(page: Page, story: string, storyArgs: Record<string, unknown>, count: number): Promise<void> {
	const id = `cards-sticker-slots--${story}`;
	await page.goto(`${storybook}/iframe.html?id=${id}&viewMode=story`);
	await page.waitForSelector('[data-variant]', { timeout: 60_000 });
	await page.evaluate(({ id, storyArgs }) => (window as unknown as { __STORYBOOK_PREVIEW__: { channel: { emit(event: string, data: unknown): void } } }).__STORYBOOK_PREVIEW__.channel.emit('updateStoryArgs', { storyId: id, updatedArgs: storyArgs }), { id, storyArgs });
	await page.waitForFunction(({ storyArgs, count }) => {
		const figures = [...document.querySelectorAll<HTMLElement>('[data-variant]')];
		const mode = document.querySelector<HTMLElement>('[data-sticker-slots-mode]')?.dataset.stickerSlotsMode;
		const width = document.querySelector<HTMLElement>('[data-sticker-slots-mode]')?.style.getPropertyValue('--w');
		return figures.length === count && mode === storyArgs.mode && (!storyArgs.era || figures.every(figure => figure.dataset.era === storyArgs.era)) && (!storyArgs.width || width === `${storyArgs.width}px`);
	}, { storyArgs, count });
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.images].map(image => image.complete ? null : new Promise(done => { image.onload = image.onerror = done; })));
	});
	await page.waitForTimeout(300);
}

/** Card widths measured: the collection detail and the narrowest pool and binder cards, where fitted text stops scaling. */
const WIDTHS = [300, 150];

type Measured = { layers: Record<string, Edges>; photo: Edges | null; ring: Edges | null; radii: [number, number][] };
const union = (a: Edges | null | undefined, b: Edges): Edges => a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b;
const overlap = (a: Edges | null, b: Edges): Edges => a ? { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) } : b;

async function measureEra(page: Page, era: CardEra): Promise<EraLayout> {
	let merged: Measured = { layers: {}, photo: null, ring: null, radii: [[0, 0], [0, 0], [0, 0], [0, 0]] };
	for (const width of WIDTHS) {
		await load(page, 'one-era', { era, mode: 'none', width }, 54);
		const next = await measureLoaded(page);
		const layers = { ...merged.layers };
		for (const [key, edges] of Object.entries(next.layers)) layers[key] = union(layers[key], edges);
		merged = {
			layers,
			photo: next.photo ? overlap(merged.photo, next.photo) : merged.photo,
			ring: next.ring ? union(merged.ring, next.ring) : merged.ring,
			radii: merged.radii.map(([across, down], index) => [Math.max(across, next.radii[index][0]), Math.max(down, next.radii[index][1])])
		};
	}
	const measured = merged;
	if (!measured.photo) throw new Error(`${era} fronts have no photo.mask layer`);
	return {
		protected: Object.entries(measured.layers).sort(([a], [b]) => a.localeCompare(b)).map(([layer, edges]) => toBox(edges, layer)),
		photo: toBox(measured.photo),
		photoRadii: measured.radii.map(([across, down]) => [Math.ceil(across * 1e4) / 1e4, Math.ceil(down * 1e4) / 1e4] as const),
		...(measured.ring ? { ring: toBox(measured.ring) } : {})
	};
}

/** Every protected layer's box, the shared photo window, the gem ring and the photo's corner radii across the loaded cards. */
async function measureLoaded(page: Page): Promise<Measured> {
	return page.evaluate(selector => {
		const layers: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {};
		let photo: { x0: number; y0: number; x1: number; y1: number } | null = null;
		let ring: { x0: number; y0: number; x1: number; y1: number } | null = null;
		let radii: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
		for (const figure of document.querySelectorAll<HTMLElement>('[data-variant]')) {
			const card = figure.querySelector<HTMLElement>('.card')!;
			const frame = card.getBoundingClientRect();
			const edges = (node: Element) => {
				const rect = node.getBoundingClientRect();
				return { x0: (rect.left - frame.left) / frame.width, y0: (rect.top - frame.top) / frame.height, x1: (rect.right - frame.left) / frame.width, y1: (rect.bottom - frame.top) / frame.height, empty: rect.width === 0 || rect.height === 0 };
			};
			for (const node of card.querySelectorAll<HTMLElement>(selector)) {
				const box = edges(node);
				// An svg that only frames protected text (the 1970s arc) is measured by that text.
				if (box.empty || (node instanceof SVGSVGElement && node.querySelector(selector))) continue;
				const key = node.dataset.layer!;
				const seen = layers[key];
				layers[key] = seen ? { x0: Math.min(seen.x0, box.x0), y0: Math.min(seen.y0, box.y0), x1: Math.max(seen.x1, box.x1), y1: Math.max(seen.y1, box.y1) } : box;
			}
			const mask = card.querySelector('[data-layer="photo.mask"]');
			if (mask) {
				const box = edges(mask);
				photo = photo ? { x0: Math.max(photo.x0, box.x0), y0: Math.max(photo.y0, box.y0), x1: Math.min(photo.x1, box.x1), y1: Math.min(photo.y1, box.y1) } : box;
				const style = getComputedStyle(mask);
				radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map((value, index) => {
					const [across, down = across] = value.split(' ').map(part => parseFloat(part) || 0);
					return [Math.max(radii[index][0], across / frame.width), Math.max(radii[index][1], down / frame.height)];
				});
			}
			const gem = card.querySelector('[data-layer="material.gem-ring"]');
			if (gem) {
				const box = edges(gem);
				ring = ring ? { x0: Math.min(ring.x0, box.x0), y0: Math.min(ring.y0, box.y0), x1: Math.max(ring.x1, box.x1), y1: Math.max(ring.y1, box.y1) } : box;
			}
		}
		return { layers, photo, ring, radii };
	}, PROTECTED_LAYER_SELECTOR);
}

async function measure(): Promise<StickerLayout> {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
		page.on('pageerror', error => { throw error; });
		// The sticker's drawn size, die cut and ring included, from the heaviest face.
		await load(page, 'every-era', { mode: 'era', overlay: false }, ERAS.length);
		const radius = await page.evaluate(() => {
			let widest = 0;
			for (const card of document.querySelectorAll<HTMLElement>('[data-variant] .card')) {
				const width = card.getBoundingClientRect().width;
				for (const spot of card.querySelectorAll('.spot')) widest = Math.max(widest, spot.getBoundingClientRect().width / width, spot.getBoundingClientRect().height / width);
			}
			return widest / 2;
		});
		if (!radius) throw new Error('No stickers rendered to measure');
		const eras = {} as Record<CardEra, EraLayout>;
		for (const era of ERAS) {
			eras[era] = await measureEra(page, era);
			console.log(`measured ${era}: ${eras[era].protected.length} protected layers`);
		}
		return { aspect: ASPECT, radius: Math.ceil(radius * 1e4) / 1e4, rim: RIM, eras };
	} finally {
		await browser.close();
	}
}

const layout: StickerLayout = args.includes('--solve') ? JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')) : await measure();
if (!args.includes('--solve')) writeFileSync(LAYOUT_PATH, `${JSON.stringify(layout, null, '\t')}\n`);
const slots = {} as Record<CardEra, EraStickerSlots>;
const unplaced: string[] = [];
for (const era of ERAS) {
	const solved = solveStickerSlots(layout.eras[era], layout, ERA_SET_SHAPES[era], ERA_PLACEMENT[era]);
	if (!solved) { unplaced.push(era); continue; }
	slots[era] = solved;
	console.log(`${era}: ${solved.shape}, grade ${solved.grade.x},${solved.grade.y}  face ${solved.face.map(point => `${point.x},${point.y}`).join('  ')}`);
}
if (unplaced.length) {
	console.error(`No room for the grade and three face stickers on: ${unplaced.join(', ')}`);
	process.exit(1);
}
writeFileSync(SLOTS_PATH, `${JSON.stringify(slots, null, '\t')}\n`);
