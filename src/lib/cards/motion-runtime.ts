import { motionSettings, type MotionSettingsSnapshot, type MotionSettingsState } from './motion-settings.svelte.ts';

const FRAME_INTERVAL = 30;

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
	ambientDelta: number;
	settings: MotionSettingsSnapshot;
}

interface Subscriber {
	node: Element;
	visible: boolean;
	active(settings: MotionSettingsSnapshot): boolean;
	frame(frame: MotionFrame): void;
	state(settings: MotionSettingsSnapshot, visible: boolean): void;
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
	#settingsState: MotionSettingsState;
	#settings: MotionSettingsSnapshot;
	#releaseSettings: (() => void) | null = null;
	#unsubscribeSettings: (() => void) | null = null;
	#frameHandle = 0;
	#lastTimestamp: number | null = null;
	#lastPaint = Number.NEGATIVE_INFINITY;
	#logicalTime = 0;

	constructor(
		environmentFactory: () => MotionSchedulerEnvironment = browserSchedulerEnvironment,
		settingsState: MotionSettingsState = motionSettings
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
			const visible = entry.isIntersecting && entry.intersectionRatio > 0;
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
		if (timestamp - this.#lastPaint < FRAME_INTERVAL) {
			this.#request();
			return;
		}
		const delta = this.#lastTimestamp === null ? 0 : Math.max(0, Math.min(100, timestamp - this.#lastTimestamp));
		this.#lastTimestamp = timestamp;
		this.#lastPaint = timestamp;
		const ambientDelta = delta * this.#settings.speed;
		this.#logicalTime += ambientDelta;
		const frame = { time: this.#logicalTime, delta, ambientDelta, settings: this.#settings };
		for (const subscriber of this.#subscribers) {
			if (subscriber.visible && subscriber.active(this.#settings)) subscriber.frame(frame);
		}
		this.#request();
	};

	register(
		node: Element,
		callbacks: Pick<Subscriber, 'active' | 'frame' | 'state'>
	): MotionRegistration {
		this.#ensure();
		const subscriber: Subscriber = { node, visible: true, ...callbacks };
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
		this.#lastPaint = Number.NEGATIVE_INFINITY;
	}
}

export const autonomousMotion = new AutonomousMotionScheduler();
