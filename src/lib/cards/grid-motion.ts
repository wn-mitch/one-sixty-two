import { animate, type JSAnimation } from 'animejs';
import { autonomousMotion } from './motion-runtime.ts';
import { appSettings } from '../game/settings.svelte.ts';

interface Snapshot {
	clone: HTMLElement;
	rect: DOMRect;
}

export interface CandidateGridMotion {
	attach(root: HTMLElement): void;
	detach(root: HTMLElement): void;
	capture(): number;
	play(revision: number): void;
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
			for (const [key, node] of after()) {
				const rect = measured(node);
				if (rect) snapshots.set(key, { rect, clone: ghostOf(node, rect) });
			}
			return revision;
		},
		play(nextRevision) {
			if (nextRevision !== revision || !root || !motionEnabled) return;
			const nodes = after();
			const departures: HTMLElement[] = [];
			const survivors: { node: HTMLElement; x: number; y: number }[] = [];
			const entrants: HTMLElement[] = [];
			const remember = (node: HTMLElement) => pendingStyles.set(node, {
				transform: node.style.transform, opacity: node.style.opacity
			});
			for (const [key, snapshot] of snapshots) {
				const node = nodes.get(key);
				if (!node) {
					document.body.append(snapshot.clone);
					ghosts.add(snapshot.clone);
					departures.push(snapshot.clone);
					continue;
				}
				const rect = measured(node);
				if (!rect) continue;
				const x = snapshot.rect.left - rect.left;
				const y = snapshot.rect.top - rect.top;
				if (x || y) {
					remember(node);
					node.style.transform = `translate(${x}px, ${y}px)`;
					survivors.push({ node, x, y });
				}
			}
			for (const [key, node] of nodes) {
				if (!snapshots.has(key)) {
					remember(node);
					node.style.opacity = '0';
					entrants.push(node);
				}
			}
			snapshots.clear();
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
			stage(departures, (node, complete) => {
				run(node, { opacity: [1, 0], duration: 180, ease: 'outQuart' }, () => {
					ghosts.delete(node);
					node.remove();
					complete();
				});
			}, () => stage(survivors, ({ node, x, y }, complete) => {
				run(node, { translateX: [x, 0], translateY: [y, 0], duration: 320, ease: 'outQuart' }, () => {
					restore(node);
					complete();
				});
			}, () => stage(entrants, (node, complete) => {
				run(node, { opacity: [0, 1], duration: 240, ease: 'outQuart' }, () => {
					restore(node);
					complete();
				});
			}, () => {})));
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
