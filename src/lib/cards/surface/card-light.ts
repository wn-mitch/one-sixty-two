import type { Finish } from '../finish.ts';
import type { FoilPlate, PlateTuning } from './foil-plates.ts';
import { ANIMATED_FILMS, ERA_HOLO, HOLO_PATTERNS, type HoloPattern } from './holo-films.ts';
import { LightRenderer, type LightOptions, type LitCard } from './light-renderer.ts';
import { SurfaceMapQueue } from './map-queue.ts';
import { stableUnit } from '../stable-unit.ts';
import type { SurfaceMapOptions } from './surface-map.ts';
import type { ReliefProfile } from './surfaces.ts';
import { CARD_ERAS, type CardEra } from '../era.ts';

/**
 * Lights individual cards. One shared WebGL2 context packs every card whose light changed into one frame,
 * draws them together, and copies each card's region to that card's canvas, which lives inside the card, so
 * layout, scrolling, stacking and the card's CSS tilt need no syncing. Cards redraw only when their light
 * moves, in the same frame as the tilt that moved it, so a card's pose and its light never drift apart.
 */

/**
 * What a light canvas lights: its card, or another surface marked `data-light-root` (a pack), which carries
 * the same `data-finish`, `data-card`, `data-film`, `data-plate` and `data-palette` attributes a card does.
 */
const LIGHT_ROOT = '.card, [data-light-root]';

/** Where the light sits over a card, in card fractions, and how strongly it catches. */
export interface LightState {
	lightX: number;
	lightY: number;
	/** 0 is ambient light; 1 lifts a full glare. */
	spotlight: number;
	/** The viewer's offset across the face from the card's tilt, as sines of its lean; 0 faces straight on. */
	viewX?: number;
	viewY?: number;
}

/**
 * Films that move with time redraw at about 30 fps: smooth to the eye at half the GPU work of a 60 Hz screen.
 * The slack lets the interval land on whole display frames (every 2nd at 60 Hz, every 4th at 120 Hz), so steps stay even.
 */
const FILM_INTERVAL = 33.4;
const FILM_SLACK = 6;
const MAX_PIXEL_RATIO = 2;
/** Device pixels between packed cards, so no card's region picks up a neighbour's edge. */
const PACK_GAP = 2;
/** The widest frame the shared canvas packs before it starts a second batch. */
const PACK_LIMIT = 4096;
const MAP_SCALE = 1.5;
const REST: LightState = { lightX: 0.23, lightY: 0.05, spotlight: 0 };

/** Counters for the `?perf` overlay: how much light work the page asks for. */
export const lightStats = { flushes: 0, batches: 0, presents: 0, lights: 0, visible: 0, canvasWidth: 0, canvasHeight: 0 };

let nextId = 0;

export class CardLight {
	readonly id = `card-light-${nextId++}`;
	card: HTMLElement | null = null;
	canvas: HTMLCanvasElement | null = null;
	presenter: CanvasRenderingContext2D | null = null;
	state: LightState = { ...REST };
	visible = false;
	width = 0;
	height = 0;
	/** How this card's raised name is shaped; the scene default when unset. */
	nameProfile: ReliefProfile | undefined;

	/** Reshapes the raised name and repaints the card's map. */
	setNameProfile(profile: ReliefProfile | undefined): void {
		if (profile === this.nameProfile) return;
		this.nameProfile = profile;
		LightEngine.shared()?.invalidate(this);
	}

	/** Moves the light; the card redraws in the frame that moved it. */
	set(state: LightState): void {
		const { lightX, lightY, spotlight, viewX = 0, viewY = 0 } = this.state;
		const still = (a: number, b: number) => Math.abs(a - b) < 0.002;
		if (still(lightX, state.lightX) && still(lightY, state.lightY) && still(spotlight, state.spotlight) && still(viewX, state.viewX ?? 0) && still(viewY, state.viewY ?? 0)) return;
		this.state = { ...state };
		LightEngine.shared()?.dirty(this);
	}

	rest(): void {
		this.set(REST);
	}
}

export class LightEngine {
	static #shared: LightEngine | null | undefined;

	/** The page's engine, or null when this browser cannot light cards and they keep their static finish. */
	static shared(): LightEngine | null {
		if (LightEngine.#shared !== undefined) return LightEngine.#shared;
		if (typeof document === 'undefined') return null;
		LightEngine.#shared = LightEngine.#create();
		return LightEngine.#shared;
	}

	static #create(): LightEngine | null {
		const renderer = (typeof OffscreenCanvas !== 'undefined' ? LightRenderer.create(new OffscreenCanvas(1, 1)) : null)
			?? LightRenderer.create(document.createElement('canvas'));
		return renderer ? new LightEngine(renderer) : null;
	}

	readonly #renderer: LightRenderer;
	readonly #lights = new Map<string, CardLight>();
	readonly #byCard = new Map<Element, CardLight>();
	readonly #dirty = new Set<CardLight>();
	readonly #queue: SurfaceMapQueue;
	readonly #visibility: IntersectionObserver;
	readonly #sizes: ResizeObserver;
	#scheduled = false;
	/** The frame loop for films that move with time and for cards whose program is still compiling. */
	#frame = 0;
	#retry = false;
	#lastFilm = Number.NEGATIVE_INFINITY;
	/** The shared canvas's CSS size, which only grows, so packing a different set of cards never reallocates it. */
	#canvasWidth = 1;
	#canvasHeight = 1;
	#ratio = 0;
	#options: LightOptions = {};
	/** Cards given their own light or map settings instead of the scene's. */
	readonly #own = new WeakMap<Element, { light?: LightOptions; map?: SurfaceMapOptions }>();

	private constructor(renderer: LightRenderer) {
		this.#renderer = renderer;
		// Each era's program compiles in the background once the page settles, before the first card of that era shows.
		const warm = () => renderer.warm(CARD_ERAS, this.#options);
		if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 2000 });
		else setTimeout(warm, 200);
		this.#queue = new SurfaceMapQueue(renderer, key => {
			const light = this.#lights.get(key);
			if (!light?.card) return null;
			const own = this.#own.get(light.card)?.map;
			return { card: light.card, options: { ...own, ...(light.nameProfile ? { nameProfile: light.nameProfile } : {}) } };
		}, () => {
			for (const light of this.#lights.values()) if (light.visible) this.dirty(light);
		}, MAP_SCALE, {}, () => {
			for (const light of this.#lights.values()) if (!light.visible) this.#renderer.forget(light.id);
		});
		this.#visibility = new IntersectionObserver(entries => {
			for (const entry of entries) {
				const light = this.#byCard.get(entry.target);
				if (!light) continue;
				light.visible = entry.isIntersecting;
				if (!light.visible) continue;
				this.#queue.request(light.id);
				this.dirty(light);
			}
		}, { rootMargin: '200px' });
		this.#sizes = new ResizeObserver(entries => {
			for (const entry of entries) {
				const light = this.#byCard.get(entry.target);
				if (!light?.card) continue;
				// The observer's own border-box size, so a page mounting many cards never forces a layout per card.
				const box = entry.borderBoxSize?.[0];
				light.width = box ? Math.round(box.inlineSize) : light.card.offsetWidth;
				light.height = box ? Math.round(box.blockSize) : light.card.offsetHeight;
				this.#queue.invalidate(light.id);
			}
		});
		document.addEventListener('cards:fitted', this.#onCardChanged);
		document.addEventListener('load', this.#onCardChanged, true);
	}

	#onCardChanged = (event: Event) => {
		const card = (event.target as Element | null)?.closest?.(LIGHT_ROOT);
		const light = card && this.#byCard.get(card);
		if (light) this.#queue.invalidate(light.id);
	};

	/** Lights `card` through `canvas`, which must sit inside the card covering its face. */
	attach(light: CardLight, card: HTMLElement, canvas: HTMLCanvasElement): void {
		this.detach(light);
		light.card = card;
		light.canvas = canvas;
		light.presenter = canvas.getContext('2d');
		// Sized by the resize observer's first entry, delivered before the next paint.
		light.width = 0;
		light.height = 0;
		this.#lights.set(light.id, light);
		this.#byCard.set(card, light);
		this.#visibility.observe(card);
		this.#sizes.observe(card);
	}

	detach(light: CardLight): void {
		if (!light.card) return;
		this.#visibility.unobserve(light.card);
		this.#sizes.unobserve(light.card);
		this.#byCard.delete(light.card);
		this.#lights.delete(light.id);
		this.#dirty.delete(light);
		this.#renderer.forget(light.id);
		light.card = null;
		light.canvas = null;
		light.presenter = null;
		light.visible = false;
	}

	/** Scene-wide tuning, for the workshop. */
	configure(options: LightOptions, mapOptions?: SurfaceMapOptions): void {
		this.#options = options;
		if (mapOptions) this.#queue.reconfigure(MAP_SCALE, mapOptions, this.#lights.keys());
		for (const light of this.#lights.values()) this.dirty(light);
	}

	/**
	 * Gives one light root its own light settings and, optionally, its own map settings in place of the scene's,
	 * so cards can be compared side by side; null hands it back to the scene.
	 */
	configureCard(root: Element, light: LightOptions | null, map?: SurfaceMapOptions): void {
		const before = this.#own.get(root)?.map;
		if (light) this.#own.set(root, { light, map });
		else this.#own.delete(root);
		const card = this.#byCard.get(root);
		if (!card) return;
		if (JSON.stringify(before) !== JSON.stringify(light ? map : undefined)) this.#queue.invalidate(card.id);
		this.dirty(card);
	}

	invalidate(light: CardLight): void {
		if (light.card) this.#queue.invalidate(light.id);
	}

	dirty(light: CardLight): void {
		if (!light.card) return;
		this.#dirty.add(light);
		this.#schedule();
	}

	/** Restarts redraws for visible cards whose films move with time, after a hold is released. */
	resumeFilms(): void {
		for (const light of this.#lights.values()) if (light.visible && this.#animates(light)) this.dirty(light);
	}

	/**
	 * Draws after the current task: a motion frame moves every card's pose and light, then this one pass lights them
	 * all before the browser paints, so transform and light land in the same frame.
	 */
	#schedule(): void {
		if (this.#scheduled) return;
		this.#scheduled = true;
		queueMicrotask(this.#flush);
	}

	#loop(): void {
		if (!this.#frame) this.#frame = requestAnimationFrame(this.#tick);
	}

	#tick = (time: number) => {
		this.#frame = 0;
		if (this.#retry) {
			this.#retry = false;
			this.#schedule();
		}
		const filmDue = time - this.#lastFilm >= FILM_INTERVAL - FILM_SLACK;
		let animating = false;
		for (const light of this.#lights.values()) {
			if (!light.visible || !this.#animates(light)) continue;
			animating = true;
			if (filmDue) this.dirty(light);
		}
		if (filmDue && animating) this.#lastFilm = time;
		if (animating) this.#loop();
	};

	#flush = () => {
		this.#scheduled = false;
		lightStats.flushes++;
		lightStats.lights = this.#lights.size;
		let visible = 0;
		for (const light of this.#lights.values()) if (light.visible) visible++;
		lightStats.visible = visible;
		const due: CardLight[] = [];
		for (const light of this.#dirty) {
			if (light.visible && light.presenter && light.canvas && light.width && light.height && this.#renderer.has(light.id)) due.push(light);
		}
		this.#dirty.clear();
		const ratio = Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);
		while (due.length) this.#batch(due, ratio);
		// Films keep their cards redrawing while on screen.
		for (const light of this.#lights.values()) {
			if (light.visible && this.#animates(light)) {
				this.#loop();
				break;
			}
		}
	};

	/**
	 * Shelf-packs as many of `due` as fit one frame of the shared canvas, removing them from `due`, draws them in one
	 * pass per light setting, and copies each card's region to its canvas.
	 */
	#batch(due: CardLight[], ratio: number): void {
		const placed: { light: CardLight; x: number; y: number; width: number; height: number }[] = [];
		let x = 0;
		let y = 0;
		let shelf = 0;
		let packedWidth = 0;
		while (due.length) {
			const light = due[due.length - 1]!;
			const width = Math.max(1, Math.round(light.width * ratio));
			const height = Math.max(1, Math.round(light.height * ratio));
			if (x && x + width > PACK_LIMIT) {
				x = 0;
				y += shelf + PACK_GAP;
				shelf = 0;
			}
			if (placed.length && y + height > PACK_LIMIT) break;
			due.pop();
			placed.push({ light, x, y, width, height });
			x += width + PACK_GAP;
			shelf = Math.max(shelf, height);
			packedWidth = Math.max(packedWidth, x);
		}
		// The canvas only grows, in CSS pixels at this ratio; a ratio change (a window moved between screens) starts over.
		if (ratio !== this.#ratio) {
			this.#ratio = ratio;
			this.#canvasWidth = this.#canvasHeight = 1;
		}
		this.#canvasWidth = Math.max(this.#canvasWidth, Math.ceil(packedWidth / ratio));
		this.#canvasHeight = Math.max(this.#canvasHeight, Math.ceil((y + shelf) / ratio));
		this.#renderer.resize(this.#canvasWidth, this.#canvasHeight, ratio);
		lightStats.canvasWidth = this.#canvasWidth;
		lightStats.canvasHeight = this.#canvasHeight;
		// Cards with their own light settings draw in their own pass over the same frame.
		const scenes = new Map<LightOptions, LitCard[]>();
		for (const { light, x, y } of placed) {
			const options = (light.card && this.#own.get(light.card)?.light) ?? this.#options;
			let cards = scenes.get(options);
			if (!cards) scenes.set(options, cards = []);
			cards.push(this.#litCard(light, x / ratio, y / ratio));
		}
		let first = true;
		const incomplete = new Set<string>();
		for (const [options, cards] of scenes) {
			if (!this.#renderer.draw(cards, options, first)) {
				// Some program is still compiling; its cards stay dirty and try again next frame.
				for (const card of cards) if (!this.#renderer.compiled(card, options)) incomplete.add(card.key);
			}
			first = false;
		}
		lightStats.batches++;
		const source = this.#renderer.canvas;
		for (const { light, x, y, width, height } of placed) {
			if (incomplete.has(light.id)) {
				this.#dirty.add(light);
				this.#retry = true;
				this.#loop();
				continue;
			}
			const canvas = light.canvas!;
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			} else {
				light.presenter!.clearRect(0, 0, width, height);
			}
			light.presenter!.drawImage(source, x, y, width, height, 0, 0, width, height);
			// The card fades its light in on the first frame, so it never shows an empty canvas over unfoiled print.
			canvas.dataset.presented = '';
			lightStats.presents++;
		}
	}

	#litCard(light: CardLight, originX: number, originY: number): LitCard {
		const card = light.card!;
		return {
			key: light.id,
			originX,
			originY,
			axisXx: light.width,
			axisXy: 0,
			axisYx: 0,
			axisYy: light.height,
			...light.state,
			tier: (card.dataset.finish ?? 'base') as Finish,
			era: card.dataset.card as CardEra | undefined,
			film: card.dataset.film as HoloPattern | undefined,
			plate: card.dataset.plate as FoilPlate | undefined,
			plateTuning: plateTuning(card.dataset.plateTuning),
			palette: palette(card.dataset.palette),
			pattern: stableUnit(card.dataset.identity ?? '', 41),
			// A swatch names the width it shows its pattern at; smaller swatches magnify to it.
			zoom: Math.max(1, (Number(card.dataset.patternWidth) || 0) / light.width)
		};
	}

	/** Whether this card shows a film that moves with time: its own, the scene's forced one, or its era's on a Gem card. */
	#animates(light: CardLight): boolean {
		const root = light.card;
		if (!root || filmHolds > 0 || !motionAllowed()) return false;
		const options = this.#own.get(root)?.light ?? this.#options;
		const forced = options.holoPattern ?? -1;
		const under = options.underFilm ?? -1;
		if (under >= 0 && ANIMATED_FILMS.has(HOLO_PATTERNS[under]!)) return true;
		const film = forced >= 0 ? HOLO_PATTERNS[forced] : root.dataset.film ?? (root.dataset.finish === 'gem' ? ERA_HOLO[root.dataset.card as CardEra] : undefined);
		return film !== undefined && ANIMATED_FILMS.has(film);
	}
}

let filmHolds = 0;

/**
 * Holds every animated film on its current frame until the returned release is called, so heavy main-thread work
 * such as a share capture does not compete with film redraws. Holds nest; tilt and pointer light still redraw.
 */
export function holdFilmMotion(): () => void {
	filmHolds++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		filmHolds--;
		if (!filmHolds) LightEngine.shared()?.resumeFilms();
	};
}

/** The app's motion setting (`data-motion` on the root), or the system preference where the app sets none. */
function motionAllowed(): boolean {
	const setting = document.documentElement.dataset.motion;
	if (setting) return setting !== 'off';
	return !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** A card's `data-plate-tuning` ("scale,tone,stain[,vivid]"), or undefined to use its era's. */
function plateTuning(value: string | undefined): PlateTuning | undefined {
	const [scale, tone, stain, vivid = 1] = (value ?? '').split(',').map(Number);
	return value && [scale, tone, stain, vivid].every(Number.isFinite) ? { scale: scale!, tone: tone!, stain: stain!, vivid } : undefined;
}

/** A preset colourway index, or undefined to keep the scene/film default. */
function palette(value: string | undefined): number | undefined {
	const index = Number(value);
	return value !== undefined && Number.isInteger(index) && index >= 0 ? index : undefined;
}

/** Svelte action for the light canvas inside a card: `<canvas use:lightCanvas={light}>`. */
export function lightCanvas(canvas: HTMLCanvasElement, light: CardLight) {
	const engine = LightEngine.shared();
	const card = canvas.closest<HTMLElement>(LIGHT_ROOT);
	if (engine && card) engine.attach(light, card, canvas);
	return {
		destroy() {
			engine?.detach(light);
		}
	};
}
