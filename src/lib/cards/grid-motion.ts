import { animate, type JSAnimation } from 'animejs';
import { autonomousMotion } from './motion-runtime.ts';
import { appSettings } from '../game/settings.svelte.ts';
import { MOTION } from '../motion-timing.ts';

/** Where a card sat before a change, and the card itself, kept so one that leaves can be copied then. */
interface Snapshot {
	node: HTMLElement;
	rect: DOMRect;
}

export interface CandidateGridMotion {
	attach(root: HTMLElement): void;
	detach(root: HTMLElement): void;
	capture(): number;
	/** `gather` scoops leaving cards into one pile, slides the rest up into place, and lifts new cards in from below. */
	play(revision: number, style?: 'reflow' | 'gather'): void;
	/** Deals every card now in the grid onto the table, in reading order, as if it had just been laid down. */
	enter(): void;
	skip(): void;
	destroy(): void;
}

const selector = '[data-candidate-group]';

function measured(node: HTMLElement): DOMRect | null {
	const rect = node.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0 ? rect : null;
}

function ghostOf(node: HTMLElement, rect: DOMRect): HTMLElement {
	const ghost = node.cloneNode(true) as HTMLElement;
	ghost.removeAttribute('data-candidate-group');
	ghost.setAttribute('aria-hidden', 'true');
	ghost.setAttribute('inert', '');
	for (const duplicateId of ghost.querySelectorAll<HTMLElement>('[id]')) {
		if (!(duplicateId instanceof SVGElement)) duplicateId.removeAttribute('id');
	}
	Object.assign(ghost.style, {
		position: 'fixed',
		left: `${rect.left}px`,
		top: `${rect.top}px`,
		width: `${rect.width}px`,
		height: `${rect.height}px`,
		maxWidth: 'none',
		margin: '0',
		pointerEvents: 'none',
		zIndex: '1'
	});
	return ghost;
}

export function createCandidateGridMotion(): CandidateGridMotion {
	let root: HTMLElement | null = null;
	let motionEnabled = false;
	let releaseSettings: (() => void) | null = null;
	let unsubscribeSettings: (() => void) | null = null;
	let revision = 0;
	const snapshots = new Map<string, Snapshot>();
	const animations = new Set<JSAnimation>();
	const ghosts = new Set<HTMLElement>();
	const pendingStyles = new Map<HTMLElement, { transform: string; opacity: string }>();

	const restore = (node: HTMLElement) => {
		const styles = pendingStyles.get(node);
		if (!styles) return;
		node.style.transform = styles.transform;
		node.style.opacity = styles.opacity;
		pendingStyles.delete(node);
	};

	const clear = () => {
		for (const animation of animations) animation.revert();
		animations.clear();
		for (const node of pendingStyles.keys()) restore(node);
		for (const ghost of ghosts) ghost.remove();
		ghosts.clear();
	};

	const onMotionChange = (enabled: boolean) => {
		const changed = enabled !== motionEnabled;
		motionEnabled = enabled;
		if (changed && !motionEnabled) {
			revision++;
			snapshots.clear();
			clear();
		}
	};

	const after = () => {
		if (!root) return new Map<string, HTMLElement>();
		const nodes = new Map<string, HTMLElement>();
		for (const node of root.querySelectorAll<HTMLElement>(selector)) {
			const key = node.dataset.candidateGroup;
			if (key) nodes.set(key, node);
		}
		return nodes;
	};

	const run = (node: HTMLElement, parameters: Parameters<typeof animate>[1], cleanup: () => void) => {
		let animation: JSAnimation;
		animation = animate(node, {
			...parameters,
			onComplete: () => {
				animations.delete(animation);
				cleanup();
			}
		});
		animations.add(animation);
	};

	return {
		attach(node) {
			root = node;
			releaseSettings = appSettings.retain();
			unsubscribeSettings = appSettings.subscribe(settings => {
				onMotionChange(settings.effectiveEnabled);
			});
		},
		detach(node) {
			if (root !== node) return;
			this.destroy();
		},
		capture() {
			revision++;
			clear();
			snapshots.clear();
			if (!root || !motionEnabled) return revision;
			// Positions only: copying every card here cost a deep clone per card on each sort or filter.
			for (const [key, node] of after()) {
				const rect = measured(node);
				if (rect) snapshots.set(key, { node, rect });
			}
			return revision;
		},
		play(nextRevision, style = 'reflow') {
			if (nextRevision !== revision || !root || !motionEnabled) return;
			const gather = style === 'gather';
			const bounds = root.getBoundingClientRect();
			const nodes = after();
			const departures: HTMLElement[] = [];
			const survivors: { node: HTMLElement; x: number; y: number }[] = [];
			const entrants: HTMLElement[] = [];
			const remember = (node: HTMLElement) => pendingStyles.set(node, {
				transform: node.style.transform, opacity: node.style.opacity
			});
			// Every read happens before any write, so the browser lays the grid out once rather than
			// once per card; the copies of leaving cards go into the page together at the end.
			const leaving: Snapshot[] = [];
			const moves: { node: HTMLElement; x: number; y: number }[] = [];
			for (const [key, snapshot] of snapshots) {
				const node = nodes.get(key);
				if (!node) {
					leaving.push(snapshot);
					continue;
				}
				const rect = measured(node);
				if (!rect) continue;
				const x = snapshot.rect.left - rect.left;
				const y = snapshot.rect.top - rect.top;
				if (x || y) moves.push({ node, x, y });
			}
			const arriving = [...nodes].filter(([key]) => !snapshots.has(key)).map(([, node]) => ({ node, rect: node.getBoundingClientRect() }));
			snapshots.clear();
			for (const { node, x, y } of moves) {
				remember(node);
				node.style.transform = `translate(${x}px, ${y}px)`;
				survivors.push({ node, x, y });
			}
			for (const { node } of arriving) {
				remember(node);
				node.style.opacity = '0';
				entrants.push(node);
			}
			// Every leaving card is scooped, including ones below the fold that fly up into the pile, in
			// reading order and capped so a long page never copies more than two deals' worth.
			const copies = leaving
				.sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left)
				.slice(0, MOTION.dealMaxCards * 2)
				.map(({ node, rect }) => ({ clone: ghostOf(node, rect), rect }));
			document.body.append(...copies.map(({ clone }) => clone));
			for (const { clone } of copies) {
				ghosts.add(clone);
				departures.push(clone);
			}
			const departedAt = new Map(copies.map(({ clone, rect }) => [clone, rect]));
			const stage = <T>(
				items: T[], start: (item: T, complete: () => void) => void, complete: () => void
			) => {
				if (nextRevision !== revision || !motionEnabled) return;
				if (!items.length) { complete(); return; }
				let remaining = items.length;
				for (const item of items) start(item, () => {
					if (nextRevision === revision && --remaining === 0) complete();
				});
			};
			if (gather) {
				// The hand scoops the leaving cards toward the top of the grid in reading order.
				const pileX = bounds.left + bounds.width / 2;
				const pileY = Math.max(bounds.top, 0) + 40;
				departures.forEach((node, index) => {
					const rect = departedAt.get(node)!;
					run(node, {
						translateX: [0, pileX - (rect.left + rect.width / 2)], translateY: [0, pileY - (rect.top + rect.height / 2)],
						scale: [1, .45], rotate: [0, (index % 2 ? 1 : -1) * (4 + (index % 3) * 2)], opacity: [1, 0],
						duration: MOTION.gather, delay: index * MOTION.gatherStagger, ease: 'inOutQuart'
					}, () => {
						ghosts.delete(node);
						node.remove();
					});
				});
				// Then the cards that stay filter up into the gaps while new ones rise in behind them.
				const lead = departures.length ? MOTION.gather * .5 : 0;
				survivors.forEach(({ node, x, y }) => {
					node.style.transform = `translate(${x}px, ${y}px)`;
					run(node, { translateX: [x, 0], translateY: [y, 0], duration: MOTION.gridMove, delay: lead, ease: 'outQuart' }, () => restore(node));
				});
				arriving
					.sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left)
					.forEach(({ node }, index) => {
						run(node, { translateY: [48, 0], opacity: [0, 1], duration: MOTION.gridMove, delay: lead + MOTION.gridMove * .3 + Math.min(index, 12) * MOTION.gatherStagger, ease: 'outQuart' }, () => restore(node));
					});
				return;
			}
			stage(departures, (node, complete) => {
				run(node, { opacity: [1, 0], duration: MOTION.gridExit, ease: 'outQuart' }, () => {
					ghosts.delete(node);
					node.remove();
					complete();
				});
			}, () => stage(survivors, ({ node, x, y }, complete) => {
				run(node, { translateX: [x, 0], translateY: [y, 0], duration: MOTION.gridMove, ease: 'outQuart' }, () => {
					restore(node);
					complete();
				});
			}, () => stage(entrants, (node, complete) => {
				run(node, { opacity: [0, 1], duration: MOTION.gridEnter, ease: 'outQuart' }, () => {
					restore(node);
					complete();
				});
			}, () => {})));
		},
		enter() {
			revision++;
			clear();
			snapshots.clear();
			if (!root || !motionEnabled) return;
			[...after().values()]
				.map(node => ({ node, rect: node.getBoundingClientRect() }))
				.filter(({ rect }) => rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight)
				.sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left)
				.slice(0, MOTION.dealMaxCards * 2)
				.forEach(({ node }, index) => {
					pendingStyles.set(node, { transform: node.style.transform, opacity: node.style.opacity });
					node.style.opacity = '0';
					run(node, {
						translateY: [-36, 0], rotate: [(index % 2 ? 1 : -1) * (3 + (index % 3)), 0], scale: [1.04, 1], opacity: [0, 1],
						duration: MOTION.dealOut, delay: index * MOTION.dealStagger, ease: 'outQuart'
					}, () => restore(node));
				});
		},
		skip() {
			revision++;
			snapshots.clear();
			clear();
		},
		destroy() {
			this.skip();
			unsubscribeSettings?.();
			releaseSettings?.();
			unsubscribeSettings = null;
			releaseSettings = null;
			motionEnabled = false;
			root = null;
		}
	};
}

export function candidateGridMotion(node: HTMLElement, controller: CandidateGridMotion) {
	controller.attach(node);
	return {
		destroy: () => controller.detach(node)
	};
}

export interface MarqueeOptions {
	speed: number;
	direction: 1 | -1;
}

/**
 * Moves two identical adjacent copies as one continuous row. Mark the first copy
 * with `data-marquee-copy` when its width plus the row gap is the repeat distance.
 */
export function marquee(node: HTMLElement, initialOptions: MarqueeOptions) {
	const snapshot = node.style.transform;
	let options = initialOptions;
	let distance = 0;
	let offset = 0;
	let hovered = false;
	let focused = false;
	let destroyed = false;

	const render = () => {
		if (!distance) {
			node.style.transform = snapshot;
			return;
		}
		const translated = options.direction === 1 ? -offset : -distance + offset;
		node.style.transform = `${snapshot ? `${snapshot} ` : ''}translate3d(${translated.toFixed(2)}px, 0, 0)`;
	};

	const measure = () => {
		const copy = node.querySelector<HTMLElement>('[data-marquee-copy]');
		const gap = Number.parseFloat(getComputedStyle(node).columnGap);
		const layoutGap = Number.isFinite(gap) ? gap : 0;
		const measured = copy
			? copy.offsetWidth + layoutGap
			: (node.scrollWidth + layoutGap) / 2;
		distance = Number.isFinite(measured) && measured > 0 ? measured : 0;
		if (distance) offset %= distance;
		else offset = 0;
		render();
		registration.wake();
	};

	const setHovered = (next: boolean) => {
		hovered = next;
		registration.wake();
	};
	const onPointerEnter = () => setHovered(true);
	const onPointerLeave = () => setHovered(false);
	const onFocusIn = () => {
		focused = true;
		registration.wake();
	};
	const onFocusOut = (event: FocusEvent) => {
		if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
		focused = false;
		registration.wake();
	};
	const onAssetSettled = () => measure();

	const registration = autonomousMotion.register(node, {
		active(settings) {
			return settings.effectiveEnabled && !hovered && !focused && distance > 0 && options.speed > 0;
		},
		frame({ delta }) {
			offset = (offset + options.speed * delta / 1000) % distance;
			render();
		},
		state(settings, visible) {
			if (!visible) return;
			if (!settings.effectiveEnabled) {
				offset = 0;
				node.style.transform = snapshot;
			}
		}
	});
	const unobserveResize = autonomousMotion.observeResize(node, measure);
	node.addEventListener('pointerenter', onPointerEnter);
	node.addEventListener('pointerleave', onPointerLeave);
	node.addEventListener('focusin', onFocusIn);
	node.addEventListener('focusout', onFocusOut);
	node.addEventListener('load', onAssetSettled, true);
	node.addEventListener('error', onAssetSettled, true);
	queueMicrotask(measure);
	void document.fonts?.ready.then(() => {
		if (!destroyed) measure();
	});

	return {
		update(next: MarqueeOptions) {
			options = next;
			render();
			registration.wake();
		},
		destroy() {
			destroyed = true;
			node.removeEventListener('pointerenter', onPointerEnter);
			node.removeEventListener('pointerleave', onPointerLeave);
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('focusout', onFocusOut);
			node.removeEventListener('load', onAssetSettled, true);
			node.removeEventListener('error', onAssetSettled, true);
			unobserveResize();
			registration.unregister();
			node.style.transform = snapshot;
		}
	};
}
