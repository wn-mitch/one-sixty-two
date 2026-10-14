import type { Finish } from '../finish.ts';
import type { CardEra } from '../view-model.ts';
import type { LightRenderer } from './light-renderer.ts';
import { buildSurfaceMap, type SurfaceMapOptions } from './surface-map.ts';

/**
 * Builds cards' surface maps a few at a time while the page is idle and hands them to a renderer.
 * A card is painted only after its text has settled; cards without a map keep their static finish.
 */

function idle(callback: () => void): () => void {
	if (typeof requestIdleCallback === 'function') {
		const handle = requestIdleCallback(callback, { timeout: 500 });
		return () => cancelIdleCallback(handle);
	}
	const handle = setTimeout(callback, 16);
	return () => clearTimeout(handle);
}

export function fitted(card: HTMLElement): boolean {
	const roots = [card, ...card.querySelectorAll<HTMLElement>('[data-card]')];
	return roots.every(root => !root.hasAttribute('data-fit-state') || root.dataset.fitState === 'settled');
}

export class SurfaceMapQueue {
	readonly #renderer: LightRenderer;
	readonly #resolve: (key: string) => { card: HTMLElement; options?: SurfaceMapOptions } | null;
	readonly #built: () => void;
	readonly #evict: () => void;
	readonly #pending = new Set<string>();
	#scale: number;
	#options: SurfaceMapOptions;
	#cancel: (() => void) | null = null;
	#destroyed = false;

	/**
	 * `resolve` finds a laid-out `.card` for a key, with any per-card map settings; `built` runs after each batch so the scene can redraw;
	 * `evict` frees atlas space, for instance by forgetting cards that are off screen, when a map does not fit.
	 */
	constructor(renderer: LightRenderer, resolve: (key: string) => { card: HTMLElement; options?: SurfaceMapOptions } | null, built: () => void, scale: number, options: SurfaceMapOptions = {}, evict: () => void = () => {}) {
		this.#renderer = renderer;
		this.#resolve = resolve;
		this.#built = built;
		this.#evict = evict;
		this.#scale = scale;
		this.#options = options;
	}

	request(key: string): void {
		if (this.#renderer.has(key)) return;
		this.#pending.add(key);
		this.#schedule();
	}

	/** Repaints one card, for instance after its text refits or its mark loads. */
	invalidate(key: string): void {
		this.#renderer.forget(key);
		this.request(key);
	}

	/** Repaints every card the renderer holds with new map settings. */
	reconfigure(scale: number, options: SurfaceMapOptions, keys: Iterable<string>): void {
		this.#scale = scale;
		this.#options = options;
		for (const key of keys) this.invalidate(key);
	}

	#schedule(): void {
		if (this.#cancel || !this.#pending.size || this.#destroyed) return;
		this.#cancel = idle(() => {
			this.#cancel = null;
			const started = performance.now();
			let waiting = false;
			for (const key of [...this.#pending]) {
				if (performance.now() - started > 8) {
					waiting = true;
					break;
				}
				const source = this.#resolve(key);
				if (!source) {
					this.#pending.delete(key);
					continue;
				}
				// A later fit event queues the card again.
				const { card } = source;
				if (!fitted(card)) continue;
				this.#pending.delete(key);
				const tier = (card.dataset.finish ?? 'base') as Finish;
				const map = buildSurfaceMap(card, tier, card.dataset.card as CardEra, this.#scale, { ...this.#options, ...source.options });
				if (!this.#renderer.add(key, map)) {
					this.#evict();
					if (!this.#renderer.add(key, map) && this.#renderer.grow()) this.#renderer.add(key, map);
				}
			}
			this.#built();
			if (waiting) this.#schedule();
		});
	}

	destroy(): void {
		this.#destroyed = true;
		this.#cancel?.();
		this.#pending.clear();
	}
}
