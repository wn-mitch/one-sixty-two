import type { Finish } from '../finish.ts';
import type { FoilPlate, PlateTuning } from './foil-plates.ts';
import { ANIMATED_FILMS, ERA_HOLO, HOLO_PATTERNS, type HoloPattern } from './holo-films.ts';
import { LightRenderer, type LightOptions } from './light-renderer.ts';
import { SurfaceMapQueue } from './map-queue.ts';
import { stableUnit } from '../stable-unit.ts';
import type { SurfaceMapOptions } from './surface-map.ts';
import type { ReliefProfile } from './surfaces.ts';
import { CARD_ERAS, type CardEra } from '../era.ts';

/**
 * Lights individual cards. One shared WebGL2 context renders a card at its own size and hands the
 * frame to that card's canvas, which lives inside the card, so layout, scrolling, stacking and the
 * card's CSS tilt need no syncing. Only cards whose light changed redraw: pointer-driven light every
 * frame, ambient light at a reduced rate, and resting cards once.
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

/** Ambient light changes slowly, so it redraws at this interval rather than every frame. */
const AMBIENT_INTERVAL = 80;
/** Films that move with time redraw at about 30 fps: smooth to the eye at half the GPU work of a 60 Hz screen. */
const FILM_INTERVAL = 30;
const MAX_PIXEL_RATIO = 2;
const MAP_SCALE = 1.5;
const REST: LightState = { lightX: 0.23, lightY: 0.05, spotlight: 0 };

type Presenter = ImageBitmapRenderingContext | CanvasRenderingContext2D;

let nextId = 0;

export class CardLight {
	readonly id = `card-light-${nextId++}`;
	card: HTMLElement | null = null;
	canvas: HTMLCanvasElement | null = null;
	presenter: Presenter | null = null;
	state: LightState = { ...REST };
	visible = false;
	/** A pointer or focus is driving this card's light, so it redraws every frame. */
	direct = false;
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

	/** Moves the light; `direct` marks pointer-driven light, which redraws every frame. */
	set(state: LightState, direct = false): void {
		const { lightX, lightY, spotlight, viewX = 0, viewY = 0 } = this.state;
		this.direct = direct;
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
		// Transferring frames needs WebGL on an offscreen canvas; otherwise copy from a detached canvas.
		if (typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmapRenderingContext !== 'undefined') {
			const renderer = LightRenderer.create(new OffscreenCanvas(1, 1));
			if (renderer) return new LightEngine(renderer, 'transfer');
		}
		const renderer = LightRenderer.create(document.createElement('canvas'));
		return renderer ? new LightEngine(renderer, 'copy') : null;
	}

	readonly #renderer: LightRenderer;
	readonly #mode: 'transfer' | 'copy';
	readonly #lights = new Map<string, CardLight>();
	readonly #byCard = new Map<Element, CardLight>();
	readonly #dirty = new Set<CardLight>();
	readonly #queue: SurfaceMapQueue;
	readonly #visibility: IntersectionObserver;
	readonly #sizes: ResizeObserver;
	#frame = 0;
	#lastAmbient = Number.NEGATIVE_INFINITY;
	#lastFilm = Number.NEGATIVE_INFINITY;
	#options: LightOptions = {};
	/** Cards given their own light or map settings instead of the scene's. */
	readonly #own = new WeakMap<Element, { light?: LightOptions; map?: SurfaceMapOptions }>();

	private constructor(renderer: LightRenderer, mode: 'transfer' | 'copy') {
		this.#renderer = renderer;
		this.#mode = mode;
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
		light.presenter = this.#mode === 'transfer' ? canvas.getContext('bitmaprenderer') : canvas.getContext('2d');
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
		if (!this.#frame) this.#frame = requestAnimationFrame(this.#flush);
	}

	/** Restarts redraws for visible cards whose films move with time, after a hold is released. */
	resumeFilms(): void {
		for (const light of this.#lights.values()) if (light.visible && this.#animates(light)) this.dirty(light);
	}

	#flush = (time: number) => {
		this.#frame = 0;
		const ambientDue = time - this.#lastAmbient >= AMBIENT_INTERVAL;
		if (ambientDue) this.#lastAmbient = time;
		const ratio = Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO);
		let deferred = false;
		for (const light of [...this.#dirty]) {
			if (!light.visible || !light.presenter || !light.canvas) {
				this.#dirty.delete(light);
				continue;
			}
			if (!light.direct && !ambientDue && !this.#animates(light)) {
				deferred = true;
				continue;
			}
			this.#dirty.delete(light);
			if (!this.#renderer.has(light.id)) continue;
			// A card whose shader is still compiling stays dirty and tries again next frame.
			if (!this.#present(light, ratio)) this.#dirty.add(light);
		}
		// A film that moves with time keeps its card redrawing while the card is on screen, at most at FILM_INTERVAL.
		let animating = false;
		const filmDue = time - this.#lastFilm >= FILM_INTERVAL;
		if (filmDue) this.#lastFilm = time;
		for (const light of this.#lights.values()) {
			if (!light.visible || !this.#animates(light)) continue;
			animating = true;
			if (filmDue) this.#dirty.add(light);
		}
		if (deferred || animating || this.#dirty.size) this.#frame = requestAnimationFrame(this.#flush);
	};

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

	/** Draws one card and copies it to its canvas; false when its shader is not ready yet. */
	#present(light: CardLight, ratio: number): boolean {
		const { width, height } = light;
		if (!width || !height) return true;
		this.#renderer.resize(width, height, ratio);
		const drawn = this.#renderer.draw([{
			key: light.id,
			originX: 0,
			originY: 0,
			axisXx: width,
			axisXy: 0,
			axisYx: 0,
			axisYy: height,
			...light.state,
			tier: (light.card?.dataset.finish ?? 'base') as Finish,
			era: light.card?.dataset.card as CardEra | undefined,
			film: light.card?.dataset.film as HoloPattern | undefined,
			plate: light.card?.dataset.plate as FoilPlate | undefined,
			plateTuning: plateTuning(light.card?.dataset.plateTuning),
			palette: palette(light.card?.dataset.palette),
			pattern: stableUnit(light.card?.dataset.identity ?? '', 41)
		}], (light.card && this.#own.get(light.card)?.light) ?? this.#options);
		if (!drawn) return false;
		const source = this.#renderer.canvas;
		const canvas = light.canvas!;
		// The card fades its light in on the first frame, so it never shows an empty canvas over unfoiled print.
		canvas.dataset.presented = '';
		if (this.#mode === 'transfer') {
			(light.presenter as ImageBitmapRenderingContext).transferFromImageBitmap((source as OffscreenCanvas).transferToImageBitmap());
			return true;
		}
		if (canvas.width !== source.width || canvas.height !== source.height) {
			canvas.width = source.width;
			canvas.height = source.height;
		}
		const context = light.presenter as CanvasRenderingContext2D;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(source as HTMLCanvasElement, 0, 0);
		return true;
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
