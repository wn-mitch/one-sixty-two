import type { Finish } from '../cards/finish.ts';
import { autonomousMotion, type MotionRegistration } from '../cards/motion-runtime.ts';
import { stableUnit } from '../cards/stable-unit.ts';
import { layoutOffset } from '../cards/surface/geometry.ts';
import { LightRenderer, type LitCard } from '../cards/surface/light-renderer.ts';
import { SurfaceMapQueue } from '../cards/surface/map-queue.ts';
import type { CardEra } from '../cards/view-model.ts';

/**
 * Lights the home wall in one WebGL pass over its static cards. Each card's light sweeps across it
 * on its own rhythm, and every so often one card catches a spotlight. The marquee reports each row's
 * offset, and the pass redraws after the rows move in the same frame, so light stays on its card.
 */

const SWEEP = 7000;
const SPOTLIGHT_INTERVAL = 1800;
const SPOTLIGHT_DURATION = 2200;
/** Map pixels per CSS pixel; relief reads at this density without a large atlas. */
const MAP_SCALE = 1.5;

interface WallCard {
	element: HTMLElement;
	track: HTMLElement;
	key: string;
	tier: Finish;
	era: CardEra;
	x: number;
	y: number;
	width: number;
	height: number;
	phase: number;
}

interface Geometry {
	stageWidth: number;
	stageHeight: number;
	/** Grid layout origin in the stage, its transform origin, and its transform. */
	gridX: number;
	gridY: number;
	originX: number;
	originY: number;
	matrix: DOMMatrix;
	tracks: Map<HTMLElement, { x: number; y: number }>;
}

export class WallLight {
	readonly #stage: HTMLElement;
	readonly #grid: HTMLElement;
	readonly #renderer: LightRenderer;
	readonly #registration: MotionRegistration;
	readonly #offsets = new Map<HTMLElement, number>();
	readonly #queue: SurfaceMapQueue;
	readonly #observer: ResizeObserver;
	#cards: WallCard[] = [];
	#geometry: Geometry | null = null;
	#time = 0;
	#drawQueued = false;
	#spotlights = new Map<number, WallCard | null>();
	#destroyed = false;

	static create(stage: HTMLElement, grid: HTMLElement, canvas: HTMLCanvasElement): WallLight | null {
		const renderer = LightRenderer.create(canvas);
		return renderer ? new WallLight(stage, grid, renderer) : null;
	}

	private constructor(stage: HTMLElement, grid: HTMLElement, renderer: LightRenderer) {
		this.#stage = stage;
		this.#grid = grid;
		this.#renderer = renderer;
		this.#queue = new SurfaceMapQueue(renderer, key => {
			const card = this.#cards.find(entry => entry.key === key)?.element;
			return card ? { card } : null;
		}, () => this.#queueDraw(), MAP_SCALE);
		this.#observer = new ResizeObserver(() => this.refresh());
		this.#observer.observe(stage);
		stage.addEventListener('cards:fitted', this.#onCardChanged);
		stage.addEventListener('load', this.#onCardChanged, true);
		this.#registration = autonomousMotion.register(stage, {
			// A raised card holds the page's ambient light still until it lands again.
			active: settings => !settings.reducedMotion && !autonomousMotion.ambientHeld && this.#cards.length > 0,
			frame: ({ time }) => {
				this.#time = time;
				this.#queueDraw();
			},
			state: () => this.#queueDraw()
		});
	}

	/** Marquee hook: a row moved, so light must follow it this frame. */
	trackMoved(track: HTMLElement, translated: number): void {
		this.#offsets.set(track, translated);
		this.#queueDraw();
	}

	/** Re-reads the wall's cards and layout after its rows change. */
	refresh(): void {
		if (this.#destroyed) return;
		const tracks = [...this.#grid.querySelectorAll<HTMLElement>('[data-wall-track]')];
		this.#cards = [];
		for (const track of tracks) {
			for (const element of track.querySelectorAll<HTMLElement>('[data-wall-card]')) {
				const card = element.querySelector<HTMLElement>('.card');
				const offset = card && layoutOffset(card, track);
				if (!card || !offset) continue;
				const key = `${element.dataset.wallCard}@${card.offsetWidth}`;
				this.#cards.push({
					element: card,
					track,
					key,
					tier: (card.dataset.finish ?? 'base') as Finish,
					era: card.dataset.card as CardEra,
					x: offset.x,
					y: offset.y,
					width: card.offsetWidth,
					height: card.offsetHeight,
					phase: stableUnit(element.dataset.wallCard ?? '', 31) * SWEEP
				});
				this.#queue.request(key);
			}
		}
		this.#measure(tracks);
		this.#registration.wake();
		this.#queueDraw();
	}

	#measure(tracks: HTMLElement[]): void {
		const style = getComputedStyle(this.#grid);
		const [originX = 0, originY = 0] = style.transformOrigin.split(/\s+/).map(value => Number.parseFloat(value) || 0);
		const gridOffset = layoutOffset(this.#grid, this.#stage) ?? { x: 0, y: 0 };
		const trackOffsets = new Map<HTMLElement, { x: number; y: number }>();
		for (const track of tracks) trackOffsets.set(track, layoutOffset(track, this.#grid) ?? { x: 0, y: 0 });
		this.#geometry = {
			stageWidth: this.#stage.clientWidth,
			stageHeight: this.#stage.clientHeight,
			gridX: gridOffset.x,
			gridY: gridOffset.y,
			originX,
			originY,
			matrix: style.transform && style.transform !== 'none' ? new DOMMatrix(style.transform) : new DOMMatrix(),
			tracks: trackOffsets
		};
		this.#renderer.resize(this.#geometry.stageWidth, this.#geometry.stageHeight, Math.min(globalThis.devicePixelRatio || 1, 2));
	}

	#onCardChanged = (event: Event) => {
		const card = (event.target as Element | null)?.closest?.<HTMLElement>('[data-wall-card]');
		if (!card) return;
		const width = card.querySelector<HTMLElement>('.card')?.offsetWidth ?? 0;
		this.#queue.invalidate(`${card.dataset.wallCard}@${width}`);
	};

	#queueDraw(): void {
		if (this.#drawQueued || this.#destroyed) return;
		this.#drawQueued = true;
		// Microtask: after every marquee row has moved in this frame, before the browser paints it.
		queueMicrotask(() => {
			this.#drawQueued = false;
			this.#draw();
		});
	}

	#spotlight(bucket: number, visible: WallCard[]): WallCard | null {
		const existing = this.#spotlights.get(bucket);
		if (existing !== undefined) return existing;
		const previous = this.#spotlights.get(bucket - 1) ?? null;
		let selected: WallCard | null = null;
		let score = Number.POSITIVE_INFINITY;
		for (const card of visible) {
			if (card === previous || card.tier === 'base') continue;
			const candidate = stableUnit(`${card.key}|${card.x}|${card.y}`, bucket);
			if (candidate < score) {
				score = candidate;
				selected = card;
			}
		}
		this.#spotlights.set(bucket, selected);
		for (const key of this.#spotlights.keys()) if (key < bucket - 2) this.#spotlights.delete(key);
		return selected;
	}

	#draw(): void {
		const geometry = this.#geometry;
		if (!geometry) return;
		const { matrix, originX, originY } = geometry;
		const toStage = (x: number, y: number) => {
			const point = matrix.transformPoint({ x: x - originX, y: y - originY });
			return { x: geometry.gridX + originX + point.x, y: geometry.gridY + originY + point.y };
		};
		const time = this.#time;
		const placed: { card: WallCard; origin: { x: number; y: number }; right: { x: number; y: number }; down: { x: number; y: number } }[] = [];
		for (const card of this.#cards) {
			const track = geometry.tracks.get(card.track);
			if (!track) continue;
			const x = track.x + card.x + (this.#offsets.get(card.track) ?? 0);
			const y = track.y + card.y;
			const origin = toStage(x, y);
			const right = toStage(x + card.width, y);
			const down = toStage(x, y + card.height);
			const far = { x: right.x + down.x - origin.x, y: right.y + down.y - origin.y };
			const minX = Math.min(origin.x, right.x, down.x, far.x);
			const maxX = Math.max(origin.x, right.x, down.x, far.x);
			const minY = Math.min(origin.y, right.y, down.y, far.y);
			const maxY = Math.max(origin.y, right.y, down.y, far.y);
			if (maxX < 0 || minX > geometry.stageWidth || maxY < 0 || minY > geometry.stageHeight) continue;
			placed.push({ card, origin, right, down });
		}
		const bucket = Math.floor(time / SPOTLIGHT_INTERVAL);
		const visible = placed.map(entry => entry.card);
		const spotlit = [bucket - 1, bucket].map(candidate => candidate >= 0 ? { bucket: candidate, card: this.#spotlight(candidate, visible) } : null);
		const cards: LitCard[] = placed.map(({ card, origin, right, down }) => {
			let spotlight = 0;
			for (const entry of spotlit) {
				if (!entry || entry.card !== card) continue;
				const progress = (time - entry.bucket * SPOTLIGHT_INTERVAL) / SPOTLIGHT_DURATION;
				if (progress >= 0 && progress < 1) spotlight = Math.max(spotlight, Math.sin(progress * Math.PI));
			}
			const phase = ((time + card.phase) % SWEEP) / SWEEP;
			return {
				key: card.key,
				originX: origin.x,
				originY: origin.y,
				axisXx: right.x - origin.x,
				axisXy: right.y - origin.y,
				axisYx: down.x - origin.x,
				axisYy: down.y - origin.y,
				lightX: 0.08 + (0.5 - 0.5 * Math.cos(phase * Math.PI * 2)) * 0.84,
				lightY: 0.18 + Math.sin(phase * Math.PI * 2) * 0.08,
				spotlight,
				tier: card.tier,
				era: card.era,
				pattern: stableUnit(card.key.split('@')[0] ?? '', 41)
			};
		});
		this.#renderer.draw(cards);
	}

	destroy(): void {
		this.#destroyed = true;
		this.#queue.destroy();
		this.#observer.disconnect();
		this.#stage.removeEventListener('cards:fitted', this.#onCardChanged);
		this.#stage.removeEventListener('load', this.#onCardChanged, true);
		this.#registration.unregister();
		this.#renderer.destroy();
	}
}
