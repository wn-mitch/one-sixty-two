import { animate, type JSAnimation } from 'animejs';
import { appSettings } from '../game/settings.svelte.ts';
import { MOTION } from '../motion-timing.ts';

const SHIFT_MS = MOTION.rowShift;
const SETTLE_MS = MOTION.rowSettle;

export interface OrderMotion {
	/** Places a row at a vertical offset immediately, as direct pointer manipulation. */
	place(row: HTMLElement, offset: number): void;
	/** Slides a row to a vertical offset; jumps there when motion is off. */
	slide(row: HTMLElement, offset: number): void;
	/** Records each keyed row's on-screen top, including any drag offset. */
	capture(list: HTMLElement): Map<string, number>;
	/** Moves rows from their captured tops to their new layout positions, keeping `lift` above the others until it lands. */
	settle(list: HTMLElement, before: Map<string, number>, lift?: string): void;
	destroy(): void;
}

function offsetOf(row: HTMLElement): number {
	const transform = getComputedStyle(row).transform;
	return transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
}

function rows(list: HTMLElement): HTMLElement[] {
	return Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.seasonId);
}

/** Vertical row movement for the lineup lists, honouring the shared Motion setting. */
export function createOrderMotion(): OrderMotion {
	let enabled = false;
	const animations = new Map<HTMLElement, JSAnimation>();
	const release = appSettings.retain();
	const unsubscribe = appSettings.subscribe(settings => { enabled = settings.effectiveEnabled; });

	const stop = (row: HTMLElement) => {
		animations.get(row)?.cancel();
		animations.delete(row);
	};

	const place = (row: HTMLElement, offset: number) => {
		stop(row);
		row.style.transform = Math.abs(offset) < .5 ? '' : `translateY(${offset}px)`;
	};

	const run = (row: HTMLElement, from: number, to: number, duration: number, done?: () => void) => {
		stop(row);
		if (!enabled || Math.abs(from - to) < .5) { place(row, to); done?.(); return; }
		const animation: JSAnimation = animate(row, {
			translateY: [from, to],
			duration,
			ease: 'outQuart',
			onComplete: () => {
				if (animations.get(row) !== animation) return;
				animations.delete(row);
				if (to === 0) row.style.transform = '';
				done?.();
			}
		});
		animations.set(row, animation);
	};

	return {
		place,
		slide(row, offset) {
			run(row, offsetOf(row), offset, SHIFT_MS);
		},
		capture(list) {
			return new Map(rows(list).map(row => [row.dataset.seasonId!, row.getBoundingClientRect().top]));
		},
		settle(list, before, lift) {
			const current = rows(list);
			for (const row of current) place(row, 0);
			for (const row of current) {
				const previous = before.get(row.dataset.seasonId!);
				if (previous === undefined) continue;
				const delta = previous - row.getBoundingClientRect().top;
				const lifted = row.dataset.seasonId === lift;
				if (lifted) row.style.zIndex = '2';
				place(row, delta);
				run(row, delta, 0, SETTLE_MS, lifted ? () => { row.style.zIndex = ''; } : undefined);
			}
		},
		destroy() {
			for (const row of animations.keys()) {
				stop(row);
				row.style.transform = '';
				row.style.zIndex = '';
			}
			unsubscribe();
			release();
		}
	};
}
