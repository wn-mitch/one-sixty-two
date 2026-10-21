import { appSettings } from '../game/settings.svelte.ts';
import { EASE_IN_OUT, EASE_OUT, MOTION } from '../motion-timing.ts';

/**
 * Hand-offs between the game's screens. The departing screen clears its stage and records where its
 * cards sat; the incoming screen, which mounts after the phase changes, picks those positions up and
 * flies its own copies from them. Nothing here runs with Motion off or reduced motion.
 */

export type HandoffKey = 'stadium' | 'field' | 'lineup' | 'record';

interface Handoff {
	rects: Map<string, DOMRect>;
	/** Detached copies of departing elements, for hand-offs whose source has no counterpart on the next screen. */
	clones: Map<string, HTMLElement>;
	at: number;
}

const handoffs = new Map<HandoffKey, Handoff>();

const speed = () => appSettings.snapshot.cardSpeed || 1;

/** Records departing positions for the next screen. Stale or motion-off hand-offs are never stored. */
export function stash(key: HandoffKey, rects = new Map<string, DOMRect>(), clones = new Map<string, HTMLElement>()): void {
	if (!appSettings.effectiveEnabled) { handoffs.delete(key); return; }
	handoffs.set(key, { rects, clones, at: performance.now() });
}

/** Claims a hand-off once; returns null when none is pending, it has gone stale, or motion is off. */
export function take(key: HandoffKey): Handoff | null {
	const handoff = handoffs.get(key);
	handoffs.delete(key);
	if (!handoff || !appSettings.effectiveEnabled || performance.now() - handoff.at > MOTION.handoffTtl) return null;
	return handoff;
}

function onScreen(rect: DOMRect): boolean {
	return rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
}

/** A detached copy that keeps its computed look after the source unmounts. */
export function freeze(source: HTMLElement): HTMLElement {
	const clone = source.cloneNode(true) as HTMLElement;
	const sources = [source, ...source.querySelectorAll<HTMLElement>('*')];
	const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
	sources.forEach((node, index) => {
		const style = getComputedStyle(node);
		const copy = copies[index];
		for (const property of ['color', 'font', 'letter-spacing', 'line-height', 'display', 'gap', 'align-items', 'margin', 'padding', 'white-space']) {
			copy.style.setProperty(property, style.getPropertyValue(property));
		}
	});
	return clone;
}

/**
 * A viewport-sized, clipped layer for page-level ghosts. A ghost scaled past the screen edge would otherwise
 * widen the page, and iOS Safari zooms the whole page out until the ghost is removed.
 */
function ghostLayer(): HTMLElement {
	const existing = document.body.querySelector<HTMLElement>(':scope > [data-motion-layer]');
	if (existing) return existing;
	const layer = document.createElement('div');
	layer.dataset.motionLayer = '';
	layer.setAttribute('aria-hidden', 'true');
	Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '30', overflow: 'clip', pointerEvents: 'none' });
	document.body.append(layer);
	return layer;
}

function ghostAt(node: HTMLElement, rect: DOMRect, host: Element): HTMLElement {
	node.setAttribute('aria-hidden', 'true');
	node.setAttribute('inert', '');
	for (const element of [node, ...node.querySelectorAll('[id]')]) {
		if (!(element instanceof SVGElement)) element.removeAttribute('id');
	}
	Object.assign(node.style, {
		position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
		minWidth: '0', maxWidth: 'none', margin: '0', zIndex: '30', pointerEvents: 'none', transformOrigin: '0 0', boxSizing: 'border-box'
	});
	(host === document.body ? ghostLayer() : host).append(node);
	return node;
}

/**
 * Clears a screen before its phase changes: visible items drop out the bottom in reading order
 * while `chrome` and any items that do not drop fade. Resolves when everything has left. The animations hold their end state;
 * cancel them to bring the screen back if the phase does not change.
 */
export async function clearStage(items: Iterable<HTMLElement>, chrome: Iterable<HTMLElement> = []): Promise<Animation[]> {
	if (!appSettings.effectiveEnabled) return [];
	const all = [...items];
	const visible = all
		.map(node => ({ node, rect: node.getBoundingClientRect() }))
		.filter(({ rect }) => onScreen(rect))
		.sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left)
		.slice(0, MOTION.dealMaxCards);
	const duration = MOTION.gridDrop / speed();
	const stagger = MOTION.gridDropStagger / speed();
	const dropped = visible.map(({ node, rect }, index) => node.animate([
		{ transform: 'none', opacity: 1 },
		{ transform: `translateY(${Math.max(innerHeight - rect.top, rect.height) * .6}px) rotate(${index % 2 ? 2 : -2}deg)`, opacity: 0 }
	], { duration, delay: index * stagger, easing: EASE_IN_OUT, fill: 'forwards' }));
	const total = duration + Math.max(0, visible.length - 1) * stagger;
	// Items that do not drop (off screen or past the cap) fade with the chrome.
	const dropping = new Set(visible.map(({ node }) => node));
	const faded = [...chrome, ...all.filter(node => !dropping.has(node))].map(node => node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: total, easing: EASE_IN_OUT, fill: 'forwards' }));
	const animations = [...dropped, ...faded];
	await Promise.allSettled(animations.map(animation => animation.finished));
	return animations;
}

/**
 * Starts an arriving screen at the top. Departing positions were recorded in viewport terms,
 * so the page scroll left over from the previous screen would otherwise misplace every target.
 */
export function arriveAtTop(): void {
	if (scrollY) scrollTo(0, 0);
}

/** Raises a new screen's sections into place, top to bottom. */
export function riseIn(sections: Iterable<HTMLElement>, delay = 0, stagger: number = MOTION.screenRiseStagger): Animation[] {
	if (!appSettings.effectiveEnabled) return [];
	return [...sections].map((node, index) => node.animate([
		{ transform: 'translateY(1.5rem)', opacity: 0 },
		{ transform: 'none', opacity: 1 }
	], { duration: MOTION.screenRise, delay: delay + index * stagger, easing: EASE_OUT, fill: 'backwards' }));
}

/**
 * Flies a copy of `target` from a departing screen's position into place. The target stays
 * hidden until the copy lands. Both are cards drawn at 5:7, so scaling by width keeps the shape.
 */
export function flyInto(target: HTMLElement, from: DOMRect, delay = 0): Animation | null {
	const to = target.getBoundingClientRect();
	if (!to.width || !from.width || !appSettings.animateCards) return null;
	const ghost = ghostAt(target.cloneNode(true) as HTMLElement, to, target.closest('dialog[open]') ?? document.body);
	const visibility = target.style.visibility;
	target.style.visibility = 'hidden';
	const dx = from.left - to.left;
	const dy = from.top - to.top;
	const animation = ghost.animate([
		{ transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})` },
		{ transform: 'none' }
	], { duration: MOTION.handoff / speed(), delay, easing: EASE_OUT, fill: 'backwards' });
	const land = () => { ghost.remove(); target.style.visibility = visibility; };
	animation.finished.then(land, land);
	return animation;
}

/**
 * Carries a departing element (`clone`, last seen at `from`) onto a different element on the new
 * screen: the copy travels and fades out over the second half while the target grows in from the
 * copy's position. Scaling follows height so a line of type lands on a line of type.
 */
export function morphInto(clone: HTMLElement, from: DOMRect, target: HTMLElement): Animation[] {
	const to = target.getBoundingClientRect();
	if (!to.height || !from.height || !appSettings.effectiveEnabled) return [];
	const ghost = ghostAt(clone, from, document.body);
	// The source may be a full-width row; only its content travels, so the scaled copy stays near the target's width.
	ghost.style.width = 'max-content';
	const scale = to.height / from.height;
	const dx = to.left - from.left;
	const dy = to.top - from.top;
	const duration = MOTION.handoff / speed();
	// Travel eases out; the crossfade runs on linear time so it cannot start early in the fast first stretch.
	const fade = { duration: duration * .45, delay: duration * .5, easing: 'linear' };
	const animations = [
		ghost.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], { duration, easing: EASE_OUT, fill: 'forwards' }),
		ghost.animate([{ opacity: 1 }, { opacity: 0 }], { ...fade, fill: 'forwards' }),
		target.animate([
			{ transform: `translate(${-dx}px, ${-dy}px) scale(${1 / scale})`, transformOrigin: '0 0' },
			{ transform: 'none', transformOrigin: '0 0' }
		], { duration, easing: EASE_OUT, fill: 'backwards' }),
		target.animate([{ opacity: 0 }, { opacity: 1 }], { ...fade, fill: 'backwards' })
	];
	const done = () => ghost.remove();
	Promise.allSettled(animations.slice(0, 2).map(animation => animation.finished)).then(done);
	return animations;
}

/** Presses a card into place: a quick swell and settle that reads as a stamp. */
export function stamp(target: HTMLElement): Promise<void> {
	if (!appSettings.animateCards) return Promise.resolve();
	const animation = target.animate([
		{ transform: 'none' },
		{ transform: 'scale(1.12)', offset: .35 },
		{ transform: 'none' }
	], { duration: MOTION.pickStamp / speed(), easing: EASE_OUT });
	return animation.finished.then(() => {}, () => {});
}

/**
 * Drops a departing card (`clone`, last seen at `from`) into a small control such as a button: the copy
 * shrinks onto the control's centre and fades as it arrives, then the control gives a short bump.
 */
export function dropInto(clone: HTMLElement, from: DOMRect, target: HTMLElement): Animation[] {
	const to = target.getBoundingClientRect();
	if (!to.height || !from.height || !appSettings.animateCards) return [];
	const ghost = ghostAt(clone, from, document.body);
	const scale = Math.min(1, to.height / from.height);
	const dx = to.left + to.width / 2 - (from.left + from.width * scale / 2);
	const dy = to.top + to.height / 2 - (from.top + from.height * scale / 2);
	const duration = MOTION.handoff / speed();
	const travel = ghost.animate([
		{ transform: 'none', opacity: 1 },
		{ opacity: 1, offset: .7 },
		{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 }
	], { duration, easing: EASE_OUT, fill: 'forwards' });
	const bump = target.animate([
		{ transform: 'none' },
		{ transform: 'scale(1.08)', offset: .4 },
		{ transform: 'none' }
	], { duration: MOTION.pickStamp / speed(), delay: duration * .6, easing: EASE_OUT });
	const done = () => ghost.remove();
	travel.finished.then(done, done);
	return [travel, bump];
}
