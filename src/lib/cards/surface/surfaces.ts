import type { Finish } from '../finish.ts';
import type { CardEra } from '../view-model.ts';

/**
 * What a tagged card element is made of. Templates declare the kind with `data-surface`; the finish
 * tier and era decide how it is pressed and coated, so one template serves every tier.
 *
 * - `stamp`: an area printed with the tier's foil stamp (`var(--stamp)`).
 * - `name`: the player's name lettering.
 * - `mark`: the team mark.
 * - `frame`: bands, keylines and borders pressed into the stock.
 * - `photo`: the photo window.
 * - `ring`: a finish frame from the material layer (silver, gold or gem ring).
 * - `sticker`: a die-cut vinyl sticker.
 * - `ink`: plain print on the stock. Untagged lettering is ink too.
 */
export type SurfaceKind = 'stamp' | 'name' | 'mark' | 'frame' | 'photo' | 'ring' | 'sticker' | 'ink';

export const SURFACE_KINDS: readonly SurfaceKind[] = ['stamp', 'name', 'mark', 'frame', 'photo', 'ring', 'sticker', 'ink'];

/**
 * Per-pixel surface description. Every channel blends meaningfully at antialiased edges, so the
 * maps hold continuous properties rather than material ids.
 */
export interface Surface {
	/** Relief in card units, where 0 is the stock plane; negative is pressed in. */
	height: number;
	/** 0 is a dielectric print; 1 reflects in the tier's foil tint. */
	metal: number;
	/** 0 is uncoated fiber; 1 is a mirror coat. */
	gloss: number;
	/** Rainbow interference that shifts with the light. */
	iridescence: number;
}

/**
 * How raised lettering is shaped: `pillow` is a soft emboss; `ridge` raises a rim around each letter
 * over a lower face; `groove` engraves the letters into the card; `etched` raises them and cuts fine
 * lines across the face that catch light in streaks.
 */
export type ReliefProfile = 'pillow' | 'ridge' | 'groove' | 'etched';
export const RELIEF_PROFILES: readonly ReliefProfile[] = ['pillow', 'ridge', 'groove', 'etched'];

/** The relief range one map channel spans, in card units. */
export const RELIEF_RANGE = 2;

const TIER_RANK: Record<Finish, number> = { base: 0, foil: 1, emboss: 2, gem: 3 };

/** The card stock an era was printed on: uncoated fiber, then matte, glossy UV, and chrome. */
export function stockFor(era: CardEra): Surface {
	switch (era) {
		case '1950s':
		case '1960s':
			return { height: 0, metal: 0, gloss: 0.08, iridescence: 0 };
		case '1970s':
		case '1980s':
			return { height: 0, metal: 0, gloss: 0.3, iridescence: 0 };
		case '1990s':
			return { height: 0, metal: 0, gloss: 0.8, iridescence: 0 };
		default:
			return { height: 0, metal: 0.3, gloss: 0.95, iridescence: 0 };
	}
}

/**
 * How far printed ink sits into the stock: letterpress bites into uncoated card, while a gloss or
 * chrome coat fills the impression almost flat.
 */
export function inkImpression(stock: Surface): number {
	return -(0.08 + (1 - stock.gloss) * 0.32);
}

/**
 * How a tagged element is pressed and coated on a card of this tier. Base cards get only debossed
 * frames; Foil adds foil-stamped lettering; Foil + emboss raises the name and mark; Gem adds holo.
 */
export function surfaceFor(kind: SurfaceKind, tier: Finish, stock: Surface): Surface {
	const rank = TIER_RANK[tier];
	const foil = rank >= 1;
	const raised = rank >= 2;
	const holo = rank >= 3 ? 1 : 0;
	switch (kind) {
		case 'frame':
			return { ...stock, height: -0.45 };
		case 'photo':
			return { height: -0.25, metal: 0, gloss: Math.max(stock.gloss, 0.7), iridescence: 0 };
		case 'stamp':
			return foil
				? { height: raised ? 0.5 : -0.2, metal: 1, gloss: 0.9, iridescence: holo }
				: { ...stock };
		case 'name':
			if (raised) return { height: 1, metal: 1, gloss: 0.9, iridescence: holo };
			if (foil) return { height: -0.15, metal: 1, gloss: 0.85, iridescence: 0 };
			return { ...stock };
		case 'mark':
			return raised ? { height: 0.8, metal: 0.4, gloss: 0.8, iridescence: holo * 0.6 } : { ...stock };
		// Ring frames already print their foil or holo colour, so they take highlights but no foil wash.
		case 'ring':
			return { height: raised ? 0.7 : 0.35, metal: 0.45, gloss: 0.9, iridescence: holo };
		case 'sticker':
			return { height: 0.6, metal: 0, gloss: 0.9, iridescence: 0 };
		case 'ink':
			return { ...stock, height: inkImpression(stock) };
	}
}

export function isSurfaceKind(value: string | undefined): value is SurfaceKind {
	return value !== undefined && (SURFACE_KINDS as readonly string[]).includes(value);
}
