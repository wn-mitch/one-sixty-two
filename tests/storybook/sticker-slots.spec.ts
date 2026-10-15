import type { Page } from '@playwright/test';
import type { CardEra } from '../../src/lib/cards/view-model.ts';
import { ERA_STICKER_SLOTS, onPhoto, PROTECTED_LAYER_SELECTOR, STICKER_LAYOUT, STICKER_MARGIN } from '../../src/lib/collection/sticker-slots.ts';
import { test, expect, openStory } from './workshop-test';

const ERAS = Object.keys(ERA_STICKER_SLOTS) as CardEra[];
/** Pixel slack for subpixel rounding between a sticker and a layer or the frame. */
const TOLERANCE = 1.5;

interface Rect { left: number; top: number; right: number; bottom: number }
interface CardGeometry {
	variant: string;
	card: Rect;
	spots: { cx: number; cy: number; r: number }[];
	layers: (Rect & { layer: string })[];
	photo: Rect | null;
	radii: [number, number][];
	ring: Rect | null;
}

/** Opens a sticker slots story and sets its args over the preview channel, then waits for every card. */
async function openSlots(page: Page, story: 'one-era' | 'every-era', args: Record<string, unknown>, count: number): Promise<void> {
	const id = `cards-sticker-slots--${story}`;
	await openStory(page, id);
	await page.evaluate(({ id, args }) => (window as unknown as { __STORYBOOK_PREVIEW__: { channel: { emit(event: string, data: unknown): void } } }).__STORYBOOK_PREVIEW__.channel.emit('updateStoryArgs', { storyId: id, updatedArgs: args }), { id, args });
	await page.waitForFunction(({ args, count }) => {
		const figures = [...document.querySelectorAll<HTMLElement>('[data-variant]')];
		const host = document.querySelector<HTMLElement>('[data-sticker-slots-mode]');
		return figures.length === count && host?.dataset.stickerSlotsMode === args.mode && (!args.era || figures.every(figure => figure.dataset.era === args.era)) && (!args.width || host.style.getPropertyValue('--w') === `${args.width}px`);
	}, { args, count });
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.images].map(image => image.complete ? null : new Promise(done => { image.onload = image.onerror = done; })));
	});
}

async function geometry(page: Page): Promise<CardGeometry[]> {
	return page.evaluate(selector => [...document.querySelectorAll<HTMLElement>('[data-variant]')].map(figure => {
		const card = figure.querySelector<HTMLElement>('.card')!;
		const rect = (node: Element) => { const { left, top, right, bottom } = node.getBoundingClientRect(); return { left, top, right, bottom }; };
		const mask = card.querySelector('[data-layer="photo.mask"]');
		const style = mask ? getComputedStyle(mask) : null;
		const frame = card.getBoundingClientRect();
		return {
			variant: figure.dataset.variant!,
			card: rect(card),
			spots: [...card.querySelectorAll('.stickers .spot')].map(spot => { const box = spot.getBoundingClientRect(); return { cx: box.left + box.width / 2, cy: box.top + box.height / 2, r: box.width / 2 }; }),
			layers: [...card.querySelectorAll<HTMLElement>(selector)]
				.filter(node => !(node instanceof SVGSVGElement && node.querySelector(selector)))
				.map(node => ({ ...rect(node), layer: node.dataset.layer! }))
				.filter(box => box.right > box.left && box.bottom > box.top),
			photo: mask ? rect(mask) : null,
			radii: style ? [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(value => {
				const [across, down = across] = value.split(' ').map(part => parseFloat(part) || 0);
				return [across / frame.width, down / frame.height] as [number, number];
			}) : [],
			ring: card.querySelector('[data-layer="material.gem-ring"]') ? rect(card.querySelector('[data-layer="material.gem-ring"]')!) : null
		};
	}), PROTECTED_LAYER_SELECTOR);
}

const gap = (cx: number, cy: number, box: Rect) => Math.hypot(Math.max(box.left - cx, 0, cx - box.right), Math.max(box.top - cy, 0, cy - box.bottom));

/** Every way a card's stickers break the placement rules, one line each. */
function violations(card: CardGeometry, era: CardEra): string[] {
	const found: string[] = [];
	const width = card.card.right - card.card.left;
	const height = card.card.bottom - card.card.top;
	const margin = STICKER_MARGIN * width;
	const rim = STICKER_LAYOUT.rim * width + margin;
	for (const [index, spot] of card.spots.entries()) {
		const reach = spot.r + margin - TOLERANCE;
		for (const layer of card.layers) {
			if (gap(spot.cx, spot.cy, layer) < reach) found.push(`${card.variant} sticker ${index} is within its margin of ${layer.layer}`);
		}
		const frame = { left: card.card.left + rim, top: card.card.top + rim, right: card.card.right - rim, bottom: card.card.bottom - rim };
		if (spot.cx - spot.r < frame.left - TOLERANCE || spot.cx + spot.r > frame.right + TOLERANCE || spot.cy - spot.r < frame.top - TOLERANCE || spot.cy + spot.r > frame.bottom + TOLERANCE) found.push(`${card.variant} sticker ${index} is within its margin of the inner frame`);
		if (card.photo) {
			// Wholly on the photo or wholly off it (and off the gem ring), a margin from the edge either way.
			const photo = { x: (card.photo.left - card.card.left) / width, y: (card.photo.top - card.card.top) / height, w: (card.photo.right - card.photo.left) / width, h: (card.photo.bottom - card.photo.top) / height };
			const centre = { x: (spot.cx - card.card.left) / width, y: (spot.cy - card.card.top) / height };
			const sizes = { aspect: height / width, radius: (spot.r - TOLERANCE) / width };
			if (!onPhoto(centre, { photo, photoRadii: card.radii }, sizes) && gap(spot.cx, spot.cy, card.ring ?? card.photo) < reach) found.push(`${card.variant} sticker ${index} straddles the photo edge${card.ring ? ' or gem ring' : ''}`);
		}
		const next = card.spots[index + 1];
		if (next && Math.hypot(next.cx - spot.cx, next.cy - spot.cy) < spot.r + next.r + margin - TOLERANCE) found.push(`${card.variant} stickers ${index} and ${index + 1} are closer than their margin`);
	}
	// The set lines up: one shared edge and even spacing in the era's shape.
	const shape = ERA_STICKER_SLOTS[era].shape;
	const off = (values: number[]) => Math.max(...values) - Math.min(...values) > 1;
	if (card.spots.length === 4 && (shape === 'split' || shape === 'split-stacked')) {
		// Two pairs mirrored across the card's centre line: grade and the rarest on the left, the other two on the right.
		const [a, b, c, d] = card.spots;
		const axis = (card.card.left + card.card.right) / 2;
		const tops = shape === 'split' ? [a.cy, b.cy, c.cy, d.cy] : [a.cy, c.cy];
		if (off(tops)) found.push(`${card.variant} split pairs do not share a top edge`);
		const gaps = shape === 'split' ? [b.cx - a.cx, d.cx - c.cx] : [b.cy - a.cy, d.cy - c.cy];
		if (off(gaps)) found.push(`${card.variant} split pair gaps are uneven: ${gaps.map(step => step.toFixed(1)).join(', ')}`);
		if (Math.abs(a.cx + d.cx - 2 * axis) > 1 || Math.abs(b.cx + c.cx - 2 * axis) > 1) found.push(`${card.variant} split pairs are not mirrored`);
		if (!(a.cx < axis && d.cx > axis)) found.push(`${card.variant} grade is not on the left`);
	} else if (card.spots.length > 1 && shape !== 'grid') {
		const along = shape === 'column' ? 'cy' : 'cx';
		const across = shape === 'column' ? 'cx' : 'cy';
		if (off(card.spots.map(spot => spot[across]))) found.push(`${card.variant} stickers do not share an edge`);
		const steps = card.spots.slice(1).map((spot, index) => spot[along] - card.spots[index][along]);
		if (off(steps)) found.push(`${card.variant} sticker gaps are uneven: ${steps.map(step => step.toFixed(1)).join(', ')}`);
	}
	return found;
}

for (const era of ERAS) {
	test(`${era} stickers line up and keep their margin on every variant`, async ({ page }) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width: 1800, height: 1200 });
		for (const width of [300, 150]) {
			await openSlots(page, 'one-era', { era, mode: 'era', width, overlay: false }, 54);
			const cards = await geometry(page);
			for (const card of cards) expect(card.spots, `${card.variant} at ${width}px carries the grade and three face stickers`).toHaveLength(4);
			expect(cards.flatMap(card => violations(card, era)), `${era} at ${width}px`).toEqual([]);
		}
	});
}

test('mirrored vertical pairs and the right column survive the feedback viewport', async ({ page }) => {
	await page.setViewportSize({ width: 1212, height: 788 });
	await openSlots(page, 'every-era', { mode: 'era', width: 300, overlay: true }, ERAS.length);
	const cards = await geometry(page);
	const arch = cards.find(card => card.variant.startsWith('1970s-'))!;
	const modern = cards.find(card => card.variant.startsWith('2020s-'))!;
	expect(arch.spots).toHaveLength(4);
	expect(modern.spots).toHaveLength(4);
	expect(arch.spots[0].cx).toBeCloseTo(arch.spots[1].cx, 0);
	expect(arch.spots[2].cx).toBeCloseTo(arch.spots[3].cx, 0);
	expect(arch.spots[1].cy).toBeGreaterThan(arch.spots[0].cy);
	for (const layer of arch.layers.filter(box => ['season.roundel', 'logo.roundel'].includes(box.layer))) {
		for (const spot of arch.spots) expect(spot.cy + spot.r).toBeLessThan(layer.top);
	}
	expect(arch.spots[0].cx).toBeLessThan(arch.spots[2].cx);
	expect(arch.spots[0].cy).toBeCloseTo(arch.spots[2].cy, 0);
	expect(arch.spots[1].cy).toBeCloseTo(arch.spots[3].cy, 0);
	for (const spot of modern.spots) expect(spot.cx).toBeGreaterThan((modern.card.left + modern.card.right) / 2);
	expect(violations(arch, '1970s')).toEqual([]);
	expect(violations(modern, '2020s')).toEqual([]);
});

test('the old shared spots fail the same checks, covering the 1990s family name', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1800, height: 1200 });
	await openSlots(page, 'one-era', { era: '1990s', mode: 'legacy', width: 300, overlay: false }, 54);
	const found = (await geometry(page)).flatMap(card => violations(card, '1990s'));
	expect(found).toContain('1990s-hitter-foil-typical-photo sticker 1 is within its margin of name.family');
	expect(found).toContain('1990s-hitter-foil-typical-photo stickers do not share an edge');
	expect(found.some(line => line.includes('inner frame') || line.includes('photo edge'))).toBe(true);
});
