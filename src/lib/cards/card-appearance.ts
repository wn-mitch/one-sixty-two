import type { CardAppearance } from '../cosmetics/catalogue.ts';
import type { Finish } from './finish.ts';
import type { FoilPlate } from './surface/foil-plates.ts';
import type { HoloPattern } from './surface/holo-films.ts';

/**
 * Resolves one card's cosmetic inputs without changing its earned finish tier.
 *
 * `undefined` appearance uses the deck-wide equipped choice, `null` restores the shipped era
 * defaults, and an object is an isolated preview. Workshop film/plate props are final overrides;
 * when no preview was supplied they deliberately opt out of the player's equipped choice so a
 * lab card cannot accidentally combine two configurations.
 */
export function resolveCardAppearance(
	tier: Finish,
	equipped: CardAppearance,
	appearance: CardAppearance | null | undefined,
	film?: HoloPattern,
	plate?: FoilPlate
): CardAppearance {
	const workshopOverride = film !== undefined || plate !== undefined;
	const selected = appearance === undefined
		? (workshopOverride ? {} : equipped)
		: appearance ?? {};
	let resolved: CardAppearance;
	if (tier === 'gem') resolved = { film: selected.film, palette: selected.palette };
	else if (tier === 'foil' || tier === 'emboss') resolved = { plate: selected.plate };
	else resolved = {};

	// Explicit workshop controls are allowed to exercise combinations outside the shop's tier menu.
	if (film !== undefined) resolved.film = film;
	if (plate !== undefined) resolved.plate = plate;
	return resolved;
}
