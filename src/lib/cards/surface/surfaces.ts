import type { Finish } from '../finish.ts';
import type { CardEra } from '../view-model.ts';

/**
 * What a tagged card element is made of. Templates declare the kind with `data-surface`; the finish
 * tier and era decide how it is pressed and coated, so one template serves every tier.
 *
 * - `stamp`: an area printed with the tier's foil stamp; the template prints its ink as the `var(--stamp)` fallback.
 * - `name`: the player's name lettering.
 * - `mark`: the team mark.
 * - `frame`: bands, keylines and borders pressed into the stock.
 * - `photo`: the photo window.
 * - `ring`: the card's edge: a finish frame from the material layer, or a Gem photo ring.
 * - `sticker`: a die-cut vinyl sticker.
 * - `team`: the club name lettering.
 * - `brand`: the 162-0 mark, foil-stamped on every card in the card's foil (silver on Base).
 * - `ink`: plain print on the stock. Untagged lettering is ink too.
 */
export type SurfaceKind = 'stamp' | 'name' | 'mark' | 'frame' | 'photo' | 'ring' | 'sticker' | 'team' | 'brand' | 'ink';

export const SURFACE_KINDS: readonly SurfaceKind[] = ['stamp', 'name', 'mark', 'frame', 'photo', 'ring', 'sticker', 'team', 'brand', 'ink'];

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
	/** Foil that reflects silver whatever the tier's own foil tint, such as silver lettering on a gold card. */
	silver?: number;
}

/**
 * How raised lettering is shaped: `pillow` is a soft emboss; `groove` engraves the letters into the
 * card; `etched` raises them and cuts fine lines across the face that catch light in streaks.
 */
export type ReliefProfile = 'pillow' | 'groove' | 'etched';
export const RELIEF_PROFILES: readonly ReliefProfile[] = ['pillow', 'groove', 'etched'];

/** The relief range one map channel spans, in card units. */
export const RELIEF_RANGE = 2;

const TIER_RANK: Record<Finish, number> = { base: 0, foil: 1, emboss: 2, gem: 3 };

/** Adjustable treatment strengths, so a workshop can tune finishes live; `DEFAULT_TUNING` is the shipped look. */
export interface SurfaceTuning {
	/** The lowest tier whose team mark is foil-stamped; `off` keeps it printed. */
	markFoil: Finish | 'off';
	/** How much the foiled mark reflects; above about 0.5 it takes the foil's colour, below only its highlights. */
	markMetal: number;
	/** Scales how deep printed lettering is pressed into the stock; 0 prints it flat. */
	inkDepth: number;
	/** Scales the raised name's height. */
	nameHeight: number;
	/** Softens the raised name's shoulders, in card pixels. */
	nameSoftness: number;
	/** Scales the finish ring's relief. */
	ringHeight: number;
	/** How much the finish ring reflects. */
	ringMetal: number;
	/** Holo across the finish ring on Gem. */
	ringHolo: number;
	/** How much the Gem ring reflects; from about 0.5 up it shows the shader's holo foil instead of only highlights. */
	gemRingMetal: number;
}

export const DEFAULT_TUNING: Readonly<SurfaceTuning> = {
	markFoil: 'emboss', markMetal: 0.4, inkDepth: 1,
	nameHeight: 1, nameSoftness: 0,
	ringHeight: 0.3, ringMetal: 1, ringHolo: 1, gemRingMetal: 1
};

/** The card stock an era was printed on: uncoated fiber, then matte, glossy UV, and chrome. */
export type Stock = 'uncoated' | 'matte' | 'glossy' | 'chrome';
export const STOCKS: Readonly<Record<Stock, Readonly<Surface>>> = {
	uncoated: { height: 0, metal: 0, gloss: 0.08, iridescence: 0 },
	matte: { height: 0, metal: 0, gloss: 0.3, iridescence: 0 },
	glossy: { height: 0, metal: 0, gloss: 0.8, iridescence: 0 },
	chrome: { height: 0, metal: 0.3, gloss: 0.95, iridescence: 0 }
};

export function stockFor(era: CardEra): Surface {
	switch (era) {
		case '1950s':
		case '1960s':
			return { ...STOCKS.uncoated };
		case '1970s':
		case '1980s':
			return { ...STOCKS.matte };
		case '1990s':
			return { ...STOCKS.glossy };
		default:
			return { ...STOCKS.chrome };
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
export function surfaceFor(kind: SurfaceKind, tier: Finish, stock: Surface, tuning: Readonly<SurfaceTuning> = DEFAULT_TUNING): Surface {
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
			if (raised) return { height: tuning.nameHeight, metal: 1, gloss: 0.9, iridescence: holo };
			if (foil) return { height: -0.15, metal: 1, gloss: 0.85, iridescence: 0 };
			return { ...stock };
		case 'mark': {
			const metal = tuning.markFoil !== 'off' && rank >= TIER_RANK[tuning.markFoil] ? tuning.markMetal : stock.metal;
			if (raised) return { height: 0.8, metal, gloss: 0.8, iridescence: holo * 0.6 };
			return metal > stock.metal ? { height: -0.15, metal, gloss: 0.85, iridescence: 0 } : { ...stock };
		}
		// The edge takes the card's foil plate, like the name and stamps.
		case 'ring':
			return { height: (raised ? 0.7 : 0.35) * tuning.ringHeight, metal: holo ? tuning.gemRingMetal : tuning.ringMetal, gloss: 0.9, iridescence: holo * tuning.ringHolo };
		case 'sticker':
			return { height: 0.6, metal: 0, gloss: 0.9, iridescence: 0 };
		// The game's own mark is always foil: the card's foil, and silver where the card has none.
		case 'brand':
			return { height: -0.15, metal: 1, gloss: 0.9, iridescence: holo, silver: foil ? 0 : 1 };
		// The club name is foil-stamped from Foil up, in the card's foil coloured by its ink.
		case 'team':
			return foil ? { height: -0.15, metal: 1, gloss: 0.85, iridescence: holo } : { ...stock, height: inkImpression(stock) * tuning.inkDepth };
		case 'ink':
			return { ...stock, height: inkImpression(stock) * tuning.inkDepth };
	}
}

export function isSurfaceKind(value: string | undefined): value is SurfaceKind {
	return value !== undefined && (SURFACE_KINDS as readonly string[]).includes(value);
}
