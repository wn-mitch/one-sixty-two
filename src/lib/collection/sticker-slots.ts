import type { CardEra } from '../cards/view-model.ts';
import layout from './sticker-layout.json' with { type: 'json' };
import slots from './sticker-slots.json' with { type: 'json' };

/**
 * Where an era's face stickers sit. Every era front lays out its name, logo, badges, photo and stat
 * row differently, so each era gets its own grade spot and three face slots, chosen by `just
 * sticker-slots` from the boxes of the layers a sticker must never cover. The measured boxes live in
 * sticker-layout.json and the chosen slots in sticker-slots.json; `solveStickerSlots` turns the first
 * into the second deterministically.
 */

/** Layers that carry text or identity: a sticker never covers any part of them. */
export const PROTECTED_LAYER_SELECTOR = [
	'[data-layer^="name."]', '[data-layer="nameplate"]', '[data-layer^="team."]', '[data-layer^="logo."]', '[data-layer^="season."]',
	'[data-layer^="stat"]', '[data-layer="footer"]', '[data-layer="brand"]', '[data-layer="photo.caption"]', '[data-layer^="identity"]'
].join(', ');

export interface SlotPoint { x: number; y: number }
/**
 * How a card's four stickers line up: one column, one row, a 2×2 block, or a split set of two pairs
 * mirrored across the photo's centre line, side by side (`split`) or stacked (`split-stacked`).
 */
export type StickerSetShape = 'column' | 'row' | 'grid' | 'split' | 'split-stacked';
export interface EraStickerSlots { shape: StickerSetShape; grade: SlotPoint; face: readonly [SlotPoint, SlotPoint, SlotPoint] }
/** A card-normalized box: x and y from the card's top left, as fractions of its width and height. */
export interface LayoutBox { x: number; y: number; w: number; h: number; layer?: string }
export interface EraLayout {
	/** Every protected layer's box across the era's variants: long and short names, finishes, roles, missing photos. */
	protected: readonly LayoutBox[];
	/** The photo window every variant shares. */
	photo: LayoutBox;
	/** The photo window's corner radii, top left, top right, bottom right, bottom left, each [across, down] as fractions of the card width and height. */
	photoRadii: readonly (readonly [number, number])[];
	/** The gem finish's ring around the photo, when the era has one: a sticker sits wholly on the photo or wholly off the ring. */
	ring?: LayoutBox;
}
export interface StickerLayout {
	/** Card height over width. */
	aspect: number;
	/** Sticker radius, die cut and white ring included, as a fraction of the card width. */
	radius: number;
	/** The widest finish rim (the gem ring), as a fraction of the card width; stickers stay inside it. */
	rim: number;
	eras: Readonly<Record<CardEra, EraLayout>>;
}

export const STICKER_LAYOUT: StickerLayout = layout as unknown as StickerLayout;
export const ERA_STICKER_SLOTS: Readonly<Record<CardEra, EraStickerSlots>> = slots as unknown as Record<CardEra, EraStickerSlots>;

/**
 * A sticker's margin, as a fraction of the card width (2cqw): the least space between a sticker and
 * any protected layer, the inner frame, the photo edge, or its neighbour in the set. Card-relative,
 * so it holds at every card size.
 */
export const STICKER_MARGIN = 0.02;
const STEP = 0.0025;

/** Distance from a point to a box, both in card-width units (u across, v down). */
function distanceToBox(u: number, v: number, box: { u0: number; v0: number; u1: number; v1: number }): number {
	const du = Math.max(box.u0 - u, 0, u - box.u1);
	const dv = Math.max(box.v0 - v, 0, v - box.v1);
	return Math.hypot(du, dv);
}

function scaled(box: LayoutBox, aspect: number): { u0: number; v0: number; u1: number; v1: number } {
	return { u0: box.x, v0: box.y * aspect, u1: box.x + box.w, v1: (box.y + box.h) * aspect };
}

function insideBox(u: number, v: number, radius: number, box: { u0: number; v0: number; u1: number; v1: number }): boolean {
	return u - radius >= box.u0 && u + radius <= box.u1 && v - radius >= box.v0 && v + radius <= box.v1;
}

/** True when a sticker lies wholly on the photo window with `margin` to spare, rounded corners (the 1970s arch) included. */
export function onPhoto(point: SlotPoint, era: Pick<EraLayout, 'photo' | 'photoRadii'>, sizes: Pick<StickerLayout, 'aspect' | 'radius'>, margin = STICKER_MARGIN): boolean {
	const { aspect } = sizes;
	const radius = sizes.radius + margin;
	const u = point.x;
	const v = point.y * aspect;
	const box = scaled(era.photo, aspect);
	if (!insideBox(u, v, radius, box)) return false;
	const corners = [[box.u0, box.v0, 1, 1], [box.u1, box.v0, -1, 1], [box.u1, box.v1, -1, -1], [box.u0, box.v1, 1, -1]] as const;
	return corners.every(([cu, cv, su, sv], index) => {
		const [rx, ry] = era.photoRadii[index] ?? [0, 0];
		const ru = rx;
		const rv = ry * aspect;
		const centreU = cu + su * ru;
		const centreV = cv + sv * rv;
		// Only the quarter-ellipse beyond the corner's centre bounds the window there.
		if ((u - centreU) * su >= 0 || (v - centreV) * sv >= 0) return true;
		if (ru <= radius || rv <= radius) return Math.hypot(u - centreU, v - centreV) <= Math.max(Math.min(ru, rv) - radius, 0);
		return ((u - centreU) / (ru - radius)) ** 2 + ((v - centreV) / (rv - radius)) ** 2 <= 1;
	});
}

/** True when a sticker centred at (x, y) keeps its margin from every protected box, the rim, the photo edge and the given neighbours. */
export function stickerFits(point: SlotPoint, era: EraLayout, sizes: Pick<StickerLayout, 'aspect' | 'radius' | 'rim'>, neighbours: readonly SlotPoint[] = []): boolean {
	const { aspect, radius, rim } = sizes;
	const u = point.x;
	const v = point.y * aspect;
	const edge = rim + radius + STICKER_MARGIN;
	if (u < edge || u > 1 - edge || v < edge || v > aspect - edge) return false;
	// A sticker sits wholly on the photo or wholly off it, and off the gem ring, a margin from either edge.
	if (!onPhoto(point, era, sizes) && distanceToBox(u, v, scaled(era.ring ?? era.photo, aspect)) < radius + STICKER_MARGIN) return false;
	for (const box of era.protected) {
		if (distanceToBox(u, v, scaled(box, aspect)) < radius + STICKER_MARGIN) return false;
	}
	return neighbours.every(other => Math.hypot(u - other.x, v - other.y * aspect) >= 2 * radius + STICKER_MARGIN);
}

/**
 * Centres of a set's four stickers, grade first, in card-width units, for the set's top-left sticker
 * at (u, v). A split set mirrors its left pair across `axis`: grade and the rarest on the left, outer
 * first, then the right pair inner first, so the four read left to right.
 */
export function setPoints(shape: StickerSetShape, pitch: number, u: number, v: number, axis: number): readonly (readonly [number, number])[] {
	if (shape === 'column') return [[u, v], [u, v + pitch], [u, v + 2 * pitch], [u, v + 3 * pitch]];
	if (shape === 'row') return [[u, v], [u + pitch, v], [u + 2 * pitch, v], [u + 3 * pitch, v]];
	if (shape === 'grid') return [[u, v], [u + pitch, v], [u, v + pitch], [u + pitch, v + pitch]];
	if (shape === 'split') return [[u, v], [u + pitch, v], [2 * axis - u - pitch, v], [2 * axis - u, v]];
	return [[u, v], [u, v + pitch], [2 * axis - u, v], [2 * axis - u, v + pitch]];
}

/** Set shapes an era tries, in order, unless it overrides them; each later shape costs a little more. */
export const DEFAULT_SET_SHAPES: readonly StickerSetShape[] = ['column', 'row', 'grid'];
/** Eras whose fronts suit another set. The 1970s arch leaves its top corners free beside the arched team name. */
export const ERA_SET_SHAPES: Readonly<Partial<Record<CardEra, readonly StickerSetShape[]>>> = { '1970s': ['split', 'split-stacked'] };

/**
 * Picks an era's sticker set: the grade and three face stickers evenly spaced and sharing an edge,
 * grade first. A column hugs the photo's left or right edge and its top or bottom, whichever clears
 * every protected layer with the least drift, preferring stickers wholly on the photo and off its
 * central subject; with no room for a column it takes a row, then a 2×2 block. A split set sits as
 * high and as far out as it can, its pairs mirrored across the photo's centre line. Every shape uses
 * the same spacing. Returns null when none fits.
 */
export function solveStickerSlots(era: EraLayout, sizes: Pick<StickerLayout, 'aspect' | 'radius' | 'rim'>, shapes: readonly StickerSetShape[] = DEFAULT_SET_SHAPES): EraStickerSlots | null {
	const { aspect, radius } = sizes;
	const photo = scaled(era.photo, aspect);
	const inset = radius + STICKER_MARGIN;
	const pitch = 2 * radius + STICKER_MARGIN;
	const axis = (photo.u0 + photo.u1) / 2;
	const subject = { u0: photo.u0 + (photo.u1 - photo.u0) * 0.3, u1: photo.u1 - (photo.u1 - photo.u0) * 0.3, v0: photo.v0 + (photo.v1 - photo.v0) * 0.08, v1: photo.v0 + (photo.v1 - photo.v0) * 0.6 };
	const round = (value: number): number => Math.round(value * 1e4) / 1e4;
	let best: { shape: StickerSetShape; points: SlotPoint[]; cost: number } | null = null;
	for (const [rank, shape] of shapes.entries()) {
		const split = shape === 'split' || shape === 'split-stacked';
		for (let i = 0; i * STEP <= (split ? axis : 1); i++) {
			const u = i * STEP;
			for (let j = 0; j * STEP <= aspect; j++) {
				const v = j * STEP;
				// Rounded before checking, so the committed table is exactly what was checked; a split set mirrors after rounding.
				const centres = setPoints(shape, pitch, round(u), v, round(axis));
				const right = Math.max(...centres.map(([cu]) => cu));
				const bottom = Math.max(...centres.map(([, cv]) => cv));
				let cost = rank * 0.03;
				if (split) {
					// As high as it goes, then as far out: the top corners.
					cost += v + 0.5 * u;
				} else {
					// Hug a photo side and its top or bottom.
					cost += Math.min(Math.abs(u - (photo.u0 + inset)), Math.abs(right - (photo.u1 - inset)));
					cost += Math.min(Math.abs(v - (photo.v0 + inset)), Math.abs(bottom - (photo.v1 - inset)));
				}
				if (right > 1 || bottom > aspect || (best && cost >= best.cost)) continue;
				const points = centres.map(([cu, cv]) => ({ x: round(cu), y: round(cv / aspect) }));
				if (!points.every(point => stickerFits(point, era, sizes)) || !points.every((point, index) => points.slice(index + 1).every(other => Math.hypot(point.x - other.x, (point.y - other.y) * aspect) >= 2 * radius + STICKER_MARGIN - 1e-4))) continue;
				for (const point of points) {
					if (!split && !onPhoto(point, era, sizes)) cost += 0.06;
					if (distanceToBox(point.x, point.y * aspect, subject) < radius) cost += 0.2;
				}
				if (!best || cost < best.cost - 1e-9) best = { shape, points, cost };
			}
		}
	}
	if (!best) return null;
	const [grade, first, second, third] = best.points;
	return { shape: best.shape, grade, face: [first, second, third] };
}
