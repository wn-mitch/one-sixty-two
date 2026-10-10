import { appSettings } from '../game/settings.svelte.ts';
import { EASE_SLIDE, MOTION } from '../motion-timing.ts';

const ITEM = '.roster-item[data-season-id]';

/** Arrival flights still in the air, keyed by season, so a newer placement replaces the old flight. */
const arrivals = new Map<string, Animation>();

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

function duration(travel: number, speed: number): number {
	return Math.min(MOTION.fieldSlide.max, MOTION.fieldSlide.base + travel * MOTION.fieldSlide.perPixel) / speed;
}

/**
 * Flies a fixed-position copy of the arriving card from its candidate card to its slot.
 * The field panel clips its own contents, so animating the slot's card in place would hide
 * most of the flight behind the panel edge.
 */
function flyIn(item: HTMLElement, from: DOMRect, speed: number): void {
	const seasonId = item.dataset.seasonId!;
	arrivals.get(seasonId)?.cancel();
	const card = item.querySelector<HTMLElement>('.miniature .card');
	const to = card?.getBoundingClientRect();
	if (!card || !to?.width) return;
	const ghost = card.cloneNode(true) as HTMLElement;
	ghost.setAttribute('aria-hidden', 'true');
	ghost.setAttribute('inert', '');
	for (const element of [ghost, ...ghost.querySelectorAll('[id]')]) {
		if (!(element instanceof SVGElement)) element.removeAttribute('id');
	}
	Object.assign(ghost.style, {
		position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`,
		minWidth: '0', maxWidth: 'none', margin: '0', zIndex: '30', pointerEvents: 'none', transformOrigin: '0 0'
	});
	// Inside a modal sheet the copy must share the dialog's top layer to be seen.
	(item.closest('dialog[open]') ?? document.body).append(ghost);
	const visibility = item.style.visibility;
	item.style.visibility = 'hidden';
	const dx = from.left - to.left;
	const dy = from.top - to.top;
	const scale = from.width / to.width;
	const animation = ghost.animate([
		{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
		{ transform: `translate(${dx * .35}px, ${dy * .35}px) scale(${1 + (scale - 1) * .2 + .06})`, offset: .45 },
		{ transform: 'none' }
	], { duration: duration(Math.hypot(dx, dy), speed), easing: EASE_SLIDE });
	arrivals.set(seasonId, animation);
	const land = () => {
		ghost.remove();
		item.style.visibility = visibility;
		// The copy carries only the card, so the caption fades in under it instead of popping.
		item.querySelector<HTMLElement>('.identity')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 / speed, easing: 'ease-out' });
		if (arrivals.get(seasonId) === animation) arrivals.delete(seasonId);
	};
	animation.finished.then(land, land);
}

/** Slides roster cards from their captured positions to their new slots instead of jumping. */
export function slideField(root: HTMLElement, before: Map<string, DOMRect>): void {
	if (!appSettings.animateCards) return;
	const speed = appSettings.snapshot.cardSpeed || 1;
	for (const item of root.querySelectorAll<HTMLElement>(ITEM)) {
		const art = item.querySelector<HTMLElement>('.miniature') ?? item;
		const to = art.getBoundingClientRect();
		const captured = before.get(item.dataset.seasonId!);
		if (captured) arrivals.get(item.dataset.seasonId!)?.cancel();
		if (!captured) {
			const from = candidateRect(item.dataset.seasonId!);
			if (from && to.width) flyIn(item, from, speed);
			continue;
		}
		if (!to.width) continue;
		const dx = captured.left + captured.width / 2 - (to.left + to.width / 2);
		const dy = captured.top - to.top;
		const scale = captured.width / to.width;
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < .01) continue;
		const slot = item.closest<HTMLElement>('.field-slot, .staff-slot');
		if (slot) slot.style.zIndex = '4';
		const animation = item.animate([
			{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, transformOrigin: '50% 0' },
			{ transform: `translate(${dx * .35}px, ${dy * .35}px) scale(${1 + (scale - 1) * .2 + .06})`, transformOrigin: '50% 0', offset: .45 },
			{ transform: 'none', transformOrigin: '50% 0' }
		], { duration: duration(Math.hypot(dx, dy), speed), easing: EASE_SLIDE });
		const reset = () => { if (slot) slot.style.zIndex = ''; };
		animation.finished.then(reset, reset);
	}
}
