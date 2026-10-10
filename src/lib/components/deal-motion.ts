import { appSettings } from '../game/settings.svelte.ts';
import { EASE_OUT, MOTION } from '../motion-timing.ts';

const CARD = '[data-candidate-group]';

/**
 * Deals the candidate grid out of the dealt team card: each card on screen flies from `origin`
 * to its slot in reading order, small and tilted at first, then settles flat. Off-screen cards
 * and cards past `MOTION.dealMaxCards` appear in place.
 */
export function dealIntoGrid(root: HTMLElement, origin: DOMRect | null): Animation[] {
	if (!origin || !origin.width || !appSettings.animateCards) return [];
	const speed = appSettings.snapshot.cardSpeed || 1;
	const fromX = origin.left + origin.width / 2;
	const fromY = origin.top + origin.height / 2;
	const visible = [...root.querySelectorAll<HTMLElement>(CARD)]
		.map(node => ({ node, rect: node.getBoundingClientRect() }))
		.filter(({ rect }) => rect.width && rect.bottom > 0 && rect.top < innerHeight)
		.sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left)
		.slice(0, MOTION.dealMaxCards);
	return visible.map(({ node, rect }, index) => {
		const dx = fromX - (rect.left + rect.width / 2);
		const dy = fromY - (rect.top + rect.height / 2);
		const scale = Math.max(.18, Math.min(.6, origin.width / rect.width));
		// Alternate the lean so the spread reads as dealt by hand rather than stamped.
		const lean = (index % 2 ? 1 : -1) * (6 + (index % 3) * 3);
		return node.animate([
			{ transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${lean}deg)`, opacity: 0 },
			{ opacity: 1, offset: .18 },
			{ transform: 'none', opacity: 1 }
		], { duration: MOTION.dealOut / speed, delay: index * MOTION.dealStagger / speed, easing: EASE_OUT, fill: 'backwards' });
	});
}
