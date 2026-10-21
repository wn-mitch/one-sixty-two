import { appSettings, type AppSettingsSnapshot, type AppSettingsState } from '../game/settings.svelte.ts';

/**
 * How often each kind of motion moves, in milliseconds. A subscriber ticks on whole display frames: every frame
 * under a pointer, about 60 times a second under phone tilt, and about 30 for drift and other ambient motion. Locking
 * to a whole number of frames keeps steps even (every 4th frame at 120 Hz, not alternating 3 and 4).
 */
export const MOTION_INTERVALS = { frame: 0, sensor: 1000 / 60, ambient: 1000 / 30 } as const;
export type MotionRate = keyof typeof MOTION_INTERVALS;
/** The display's frame period is learned from frame timestamps; this is the guess before it is. */
const DEFAULT_PERIOD = 1000 / 60;
/** Counters for the `?perf` overlay. */
export const motionStats = { frames: 0, ticks: 0, period: DEFAULT_PERIOD };

interface IntersectionEntryLike {
	target: Element;
	isIntersecting: boolean;
	intersectionRatio: number;
}

interface ObserverLike {
	observe(node: Element): void;
	unobserve(node: Element): void;
	disconnect(): void;
}

export interface MotionSchedulerEnvironment {
	document: {
		readonly hidden: boolean;
		addEventListener(type: 'visibilitychange', listener: () => void): void;
		removeEventListener(type: 'visibilitychange', listener: () => void): void;
	};
	requestFrame(callback: FrameRequestCallback): number;
	cancelFrame(handle: number): void;
	createIntersectionObserver?(callback: (entries: IntersectionEntryLike[]) => void): ObserverLike;
	createResizeObserver?(callback: (nodes: Element[]) => void): ObserverLike;
}

export interface MotionFrame {
	time: number;
	delta: number;
	settings: AppSettingsSnapshot;
}

interface Subscriber {
	node: Element;
	visible: boolean;
	/** The logical time and frame count of this subscriber's last tick. */
	lastTime: number | null;
	lastFrame: number;
	active(settings: AppSettingsSnapshot): boolean;
	/** How smoothly it moves now; ambient when unset. */
	rate?(): MotionRate;
	frame(frame: MotionFrame): void;
	state(settings: AppSettingsSnapshot, visible: boolean): void;
}

export interface MotionRegistration {
	readonly visible: boolean;
	wake(): void;
	unregister(): void;
}

function browserSchedulerEnvironment(): MotionSchedulerEnvironment {
	return {
		document: {
			get hidden() { return document.hidden; },
			addEventListener: (type, listener) => document.addEventListener(type, listener),
			removeEventListener: (type, listener) => document.removeEventListener(type, listener)
		},
		requestFrame: callback => requestAnimationFrame(callback),
		cancelFrame: handle => cancelAnimationFrame(handle),
		createIntersectionObserver: callback => {
			const observer = new IntersectionObserver(entries => callback(entries));
			return observer;
		},
		createResizeObserver: callback => {
			const observer = new ResizeObserver(entries => callback(entries.map(entry => entry.target)));
			return observer;
		}
	};
}

export class AutonomousMotionScheduler {
	#environmentFactory: () => MotionSchedulerEnvironment;
	#environment: MotionSchedulerEnvironment | null = null;
	#subscribers = new Set<Subscriber>();
	#byNode = new Map<Element, Set<Subscriber>>();
	#resizeCallbacks = new Map<Element, Set<() => void>>();
	#intersectionObserver: ObserverLike | null = null;
	#resizeObserver: ObserverLike | null = null;
	#settingsState: AppSettingsState;
	#settings: AppSettingsSnapshot;
	#releaseSettings: (() => void) | null = null;
	#unsubscribeSettings: (() => void) | null = null;
	#frameHandle = 0;
	#lastTimestamp: number | null = null;
	#logicalTime = 0;
	#frameCount = 0;
	#period = DEFAULT_PERIOD;
	#ambientHolds = 0;

	constructor(
		environmentFactory: () => MotionSchedulerEnvironment = browserSchedulerEnvironment,
		settingsState: AppSettingsState = appSettings
	) {
		this.#environmentFactory = environmentFactory;
		this.#settingsState = settingsState;
		this.#settings = settingsState.snapshot;
	}

	#ensure(): void {
		if (this.#environment) return;
		this.#environment = this.#environmentFactory();
		this.#environment.document.addEventListener('visibilitychange', this.#onVisibilityChange);
		this.#intersectionObserver = this.#environment.createIntersectionObserver?.(this.#onIntersection) ?? null;
		this.#resizeObserver = this.#environment.createResizeObserver?.(this.#onResize) ?? null;
		this.#releaseSettings = this.#settingsState.retain();
		this.#unsubscribeSettings = this.#settingsState.subscribe(settings => {
			this.#settings = settings;
			for (const subscriber of this.#subscribers) subscriber.state(settings, subscriber.visible);
			this.wake();
		});
	}

	#onIntersection = (entries: IntersectionEntryLike[]) => {
		for (const entry of entries) {
			// A card first observed fully clipped (ratio 0) gets no further entry when the clip lifts, so the ratio cannot gate it.
			const visible = entry.isIntersecting;
			const subscribers = this.#byNode.get(entry.target);
			if (!subscribers) continue;
			for (const subscriber of subscribers) {
				if (subscriber.visible === visible) continue;
				subscriber.visible = visible;
				subscriber.state(this.#settings, visible);
			}
		}
		this.wake();
	};

	#onResize = (nodes: Element[]) => {
		for (const node of nodes) {
			const callbacks = this.#resizeCallbacks.get(node);
			if (callbacks) for (const callback of callbacks) callback();
		}
	};

	#onVisibilityChange = () => {
		if (this.#environment?.document.hidden) {
			if (this.#frameHandle) this.#environment.cancelFrame(this.#frameHandle);
			this.#frameHandle = 0;
			this.#lastTimestamp = null;
			for (const subscriber of this.#subscribers) subscriber.state(this.#settings, subscriber.visible);
			return;
		}
		this.#lastTimestamp = null;
		this.wake();
	};

	#hasActiveSubscriber(): boolean {
		if (!this.#environment || this.#environment.document.hidden) return false;
		for (const subscriber of this.#subscribers) {
			if (subscriber.visible && subscriber.active(this.#settings)) return true;
		}
		return false;
	}

	#request(): void {
		if (!this.#environment) return;
		if (!this.#hasActiveSubscriber()) {
			if (this.#frameHandle) this.#environment.cancelFrame(this.#frameHandle);
			this.#frameHandle = 0;
			this.#lastTimestamp = null;
			return;
		}
		if (!this.#frameHandle) this.#frameHandle = this.#environment.requestFrame(this.#onFrame);
	}

	#onFrame = (timestamp: number) => {
		this.#frameHandle = 0;
		if (!this.#environment || this.#environment.document.hidden) {
			this.#lastTimestamp = null;
			return;
		}
		const elapsed = this.#lastTimestamp === null ? 0 : Math.max(0, Math.min(100, timestamp - this.#lastTimestamp));
		this.#lastTimestamp = timestamp;
		this.#logicalTime += elapsed;
		this.#frameCount += 1;
		motionStats.frames++;
		// A slow average of steady frame gaps; a dropped frame or a pause does not retune it.
		if (elapsed > 3 && elapsed < 1.5 * this.#period + 4) this.#period += (elapsed - this.#period) * 0.1;
		motionStats.period = this.#period;
		const frame = this.#frameCount;
		for (const subscriber of this.#subscribers) {
			if (!subscriber.visible || !subscriber.active(this.#settings)) {
				subscriber.lastTime = null;
				continue;
			}
			const every = Math.max(1, Math.round(MOTION_INTERVALS[subscriber.rate?.() ?? 'ambient'] / this.#period));
			if (subscriber.lastTime !== null && frame - subscriber.lastFrame < every) continue;
			const delta = subscriber.lastTime === null ? 0 : Math.min(100, this.#logicalTime - subscriber.lastTime);
			subscriber.lastTime = this.#logicalTime;
			// Counted from the last whole multiple, so subscribers at one rate share frames and the light pass draws them together.
			subscriber.lastFrame = frame - (frame % every);
			motionStats.ticks++;
			subscriber.frame({ time: this.#logicalTime, delta, settings: this.#settings });
		}
		this.#request();
	};

	/** True while a raised card holds the rest of the page's ambient motion still. */
	get ambientHeld(): boolean {
		return this.#ambientHolds > 0;
	}

	/** Pauses ambient drift and lighting elsewhere until the returned release is called. */
	holdAmbient(): () => void {
		this.#ambientHolds += 1;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.#ambientHolds -= 1;
			this.wake();
		};
	}

	register(
		node: Element,
		callbacks: Pick<Subscriber, 'active' | 'frame' | 'state' | 'rate'>
	): MotionRegistration {
		this.#ensure();
		const subscriber: Subscriber = { node, visible: true, lastTime: null, lastFrame: Number.NEGATIVE_INFINITY, ...callbacks };
		this.#subscribers.add(subscriber);
		let nodeSubscribers = this.#byNode.get(node);
		if (!nodeSubscribers) {
			nodeSubscribers = new Set();
			this.#byNode.set(node, nodeSubscribers);
			this.#intersectionObserver?.observe(node);
		}
		nodeSubscribers.add(subscriber);
		subscriber.state(this.#settings, true);
		this.#request();
		let registered = true;
		return {
			get visible() { return subscriber.visible; },
			wake: () => this.wake(),
			unregister: () => {
				if (!registered) return;
				registered = false;
				this.#subscribers.delete(subscriber);
				const current = this.#byNode.get(node);
				current?.delete(subscriber);
				if (current?.size === 0) {
					this.#byNode.delete(node);
					this.#intersectionObserver?.unobserve(node);
				}
				this.#teardownIfEmpty();
			}
		};
	}

	observeResize(node: Element, callback: () => void): () => void {
		this.#ensure();
		let callbacks = this.#resizeCallbacks.get(node);
		if (!callbacks) {
			callbacks = new Set();
			this.#resizeCallbacks.set(node, callbacks);
			this.#resizeObserver?.observe(node);
		}
		callbacks.add(callback);
		return () => {
			const current = this.#resizeCallbacks.get(node);
			current?.delete(callback);
			if (current?.size === 0) {
				this.#resizeCallbacks.delete(node);
				this.#resizeObserver?.unobserve(node);
			}
			this.#teardownIfEmpty();
		};
	}

	wake(): void {
		this.#request();
	}

	#teardownIfEmpty(): void {
		if (this.#subscribers.size || this.#resizeCallbacks.size || !this.#environment) return;
		if (this.#frameHandle) this.#environment.cancelFrame(this.#frameHandle);
		this.#environment.document.removeEventListener('visibilitychange', this.#onVisibilityChange);
		this.#intersectionObserver?.disconnect();
		this.#resizeObserver?.disconnect();
		this.#unsubscribeSettings?.();
		this.#releaseSettings?.();
		this.#environment = null;
		this.#intersectionObserver = null;
		this.#resizeObserver = null;
		this.#unsubscribeSettings = null;
		this.#releaseSettings = null;
		this.#frameHandle = 0;
		this.#lastTimestamp = null;
	}
}

export const autonomousMotion = new AutonomousMotionScheduler();
