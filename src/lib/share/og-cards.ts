import type { ShareRenderCard } from './types.ts';

/** How many cards the link preview fans out. */
export const PREVIEW_CARD_COUNT = 5;

/**
 * The roster's best cards for the link preview, in fan order with the best in the middle. Cards rank by
 * WAR/162 in their role; without rankings, or on a tie, the earlier draft pick ranks first.
 */
export function previewCards(cards: readonly ShareRenderCard[]): ShareRenderCard[] {
	const ranked = [...cards].sort((a, b) => (b.war ?? -Infinity) - (a.war ?? -Infinity) || a.pickNumber - b.pickNumber).slice(0, PREVIEW_CARD_COUNT);
	// Alternate the next-best cards outward from the center: 4th, 2nd, 1st, 3rd, 5th.
	const fan: ShareRenderCard[] = [];
	ranked.forEach((card, index) => { if (index % 2) fan.unshift(card); else fan.push(card); });
	return fan;
}
