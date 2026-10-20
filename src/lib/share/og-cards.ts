import type { ShareRenderCard } from './types.ts';

/** The most cards the link preview's collage shows: two rows of four. */
export const PREVIEW_CARD_COUNT = 8;
/** The fewest it shows, even when fewer cards clear the bar. */
export const PREVIEW_CARD_MIN = 4;
/** WAR/162 in the card's role a card needs to earn a place beyond the minimum. */
export const PREVIEW_MIN_WAR = 2;

/**
 * The roster's best cards for the link preview collage, best first. Cards rank by WAR/162 in their
 * role; without rankings, or on a tie, the earlier draft pick ranks first. Cards below
 * `PREVIEW_MIN_WAR` are left out once `PREVIEW_CARD_MIN` stronger cards fill the collage.
 */
export function previewCards(cards: readonly ShareRenderCard[]): ShareRenderCard[] {
	const ranked = [...cards].sort((a, b) => (b.war ?? -Infinity) - (a.war ?? -Infinity) || a.pickNumber - b.pickNumber);
	return ranked.slice(0, PREVIEW_CARD_COUNT).filter((card, index) => index < PREVIEW_CARD_MIN || (card.war ?? -Infinity) >= PREVIEW_MIN_WAR);
}
