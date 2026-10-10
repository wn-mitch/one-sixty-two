import { appSettings } from '../game/settings.svelte.ts';
import { EASE_SLIDE, MOTION } from '../motion-timing.ts';

const ITEM = '.roster-item[data-season-id]';

/** Records where each roster card's artwork sits on screen, keyed by season. */
export function captureField(root: HTMLElement): Map<string, DOMRect> {
	const rects = new Map<string, DOMRect>();
	for (const item of root.querySelectorAll<HTMLElement>(ITEM)) {
		const art = item.querySelector<HTMLElement>('.miniature') ?? item;
		const rect = art.getBoundingClientRect();
		if (rect.width) rects.set(item.dataset.seasonId!, rect);
	}
	return rects;
}

/** A card that just arrived on the field flies in from its candidate card when one is on screen. */
function candidateRect(seasonId: string): DOMRect | null {
	const card = document.querySelector<HTMLElement>(`[data-candidate-card] [data-season-id="${CSS.escape(seasonId)}"] .front .card`);
	const rect = card?.getBoundingClientRect();
	return rect && rect.width ? rect : null;
}

/** Slides roster cards from their captured positions to their new slots instead of jumping. */
export function slideField(root: HTMLElement, before: Map<string, DOMRect>): void {
	if (!appSettings.animateCards) return;
	const speed = appSettings.snapshot.cardSpeed || 1;
	for (const item of root.querySelectorAll<HTMLElement>(ITEM)) {
		const art = item.querySelector<HTMLElement>('.miniature') ?? item;
		const to = art.getBoundingClientRect();
		const from = before.get(item.dataset.seasonId!) ?? candidateRect(item.dataset.seasonId!);
		if (!from || !to.width) continue;
		const dx = from.left + from.width / 2 - (to.left + to.width / 2);
		const dy = from.top - to.top;
		const scale = from.width / to.width;
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < .01) continue;
		const slot = item.closest<HTMLElement>('.field-slot, .staff-slot');
		if (slot) slot.style.zIndex = '4';
		const travel = Math.hypot(dx, dy);
		const animation = item.animate([
			{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: '50% 0' },
			{ transform: `translate(${dx * .35}px, ${dy * .35}px) scale(${1 + (scale - 1) * .2 + .06})`, transformOrigin: '50% 0', offset: .45 },
			{ transform: 'none', transformOrigin: '50% 0' }
		], { duration: Math.min(MOTION.fieldSlide.max, MOTION.fieldSlide.base + travel * MOTION.fieldSlide.perPixel) / speed, easing: EASE_SLIDE });
		const reset = () => { if (slot) slot.style.zIndex = ''; };
		animation.finished.then(reset, reset);
	}
}
