import { describe, expect, it } from 'vitest';
import { AutonomousMotionScheduler, type MotionSchedulerEnvironment } from './motion-runtime.ts';
import { APP_SETTINGS_STORAGE_KEY, AppSettingsState, browserEnvironment } from '../game/settings.svelte.ts';

class FakeMediaPreference {
	matches = false;
	listeners = new Set<() => void>();

	addEventListener(_type: 'change', listener: () => void): void {
		this.listeners.add(listener);
	}

	removeEventListener(_type: 'change', listener: () => void): void {
		this.listeners.delete(listener);
	}

	set(matches: boolean): void {
		this.matches = matches;
		for (const listener of this.listeners) listener();
	}
}

class MemoryStorage {
	values = new Map<string, string>();
	blocked = false;

	getItem(key: string): string | null {
		if (this.blocked) throw new DOMException('Blocked', 'SecurityError');
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		if (this.blocked) throw new DOMException('Blocked', 'SecurityError');
		this.values.set(key, value);
	}
}

class FakeSchedulerEnvironment {
	hidden = false;
	visibilityListeners = new Set<() => void>();
	frames = new Map<number, FrameRequestCallback>();
	observed = new Set<Element>();
	resizeObserved = new Set<Element>();
	intersectionCallback: ((entries: Array<{ target: Element; isIntersecting: boolean; intersectionRatio: number }>) => void) | null = null;
	resizeCallback: ((nodes: Element[]) => void) | null = null;
	nextFrame = 1;
	cancelled = 0;
	disconnected = 0;
	resizeDisconnected = 0;

	readonly environment: MotionSchedulerEnvironment;

	constructor() {
		const owner = this;
		this.environment = {
			document: {
				get hidden() { return owner.hidden; },
				addEventListener: (_type, listener) => owner.visibilityListeners.add(listener),
				removeEventListener: (_type, listener) => owner.visibilityListeners.delete(listener)
			},
			requestFrame: callback => {
				const handle = owner.nextFrame++;
				owner.frames.set(handle, callback);
				return handle;
			},
			cancelFrame: handle => {
				if (owner.frames.delete(handle)) owner.cancelled++;
			},
			createIntersectionObserver: callback => {
				owner.intersectionCallback = callback;
				return {
					observe: node => owner.observed.add(node),
					unobserve: node => owner.observed.delete(node),
					disconnect: () => {
						owner.disconnected++;
						owner.observed.clear();
					}
				};
			},
			createResizeObserver: callback => {
				owner.resizeCallback = callback;
				return {
					observe: node => owner.resizeObserved.add(node),
					unobserve: node => owner.resizeObserved.delete(node),
					disconnect: () => {
						owner.resizeDisconnected++;
						owner.resizeObserved.clear();
					}
				};
			}
		};
	}

	flush(timestamp: number): void {
		const pending = [...this.frames.values()];
		this.frames.clear();
		for (const callback of pending) callback(timestamp);
	}

	intersect(node: Element, visible: boolean): void {
		this.intersectionCallback?.([{ target: node, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
	}

	setHidden(hidden: boolean): void {
		this.hidden = hidden;
		for (const listener of this.visibilityListeners) listener();
	}

	resize(node: Element): void {
		this.resizeCallback?.([node]);
	}
}


function createSchedulerFixture() {
	const media = new FakeMediaPreference();
	const storage = new MemoryStorage();
	const settings = new AppSettingsState(() => ({ storage, reducedMotion: media }));
	const environment = new FakeSchedulerEnvironment();
	const scheduler = new AutonomousMotionScheduler(() => environment.environment, settings);
	return { environment, media, scheduler, settings, storage };
}

describe('app settings', () => {
	it('persists all preferences and live-overrides motion for reduced motion', () => {
		const media = new FakeMediaPreference();
		const storage = new MemoryStorage();
		storage.values.set(APP_SETTINGS_STORAGE_KEY, JSON.stringify({ motionEnabled: true, cardAnimation: false, cardSpeed: 1.4, rosterFirstClick: 'review' }));
		const settings = new AppSettingsState(() => ({ storage, reducedMotion: media }));
		const snapshots: boolean[] = [];
		const unsubscribe = settings.subscribe(value => snapshots.push(value.effectiveEnabled));
		const release = settings.retain();

		expect(settings.snapshot).toMatchObject({ motionEnabled: true, cardAnimation: false, cardSpeed: 1.4, rosterFirstClick: 'review', effectiveEnabled: true, animateCards: false });
		settings.setMotionEnabled(false);
		expect(settings.snapshot).toMatchObject({ motionEnabled: false, cardAnimation: false, rosterFirstClick: 'review', effectiveEnabled: false, animateCards: false });
		const restored = new AppSettingsState(() => ({ storage, reducedMotion: media }));
		const releaseRestored = restored.retain();
		expect(restored.snapshot).toMatchObject({ motionEnabled: false, cardAnimation: false, rosterFirstClick: 'review', effectiveEnabled: false, animateCards: false });
		releaseRestored();
		settings.setMotionEnabled(true);
		settings.setCardAnimation(true);
		settings.setRosterFirstClick('move');
		settings.setCardSpeed(1.7);
		const persisted = JSON.parse(storage.values.get(APP_SETTINGS_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
		expect(persisted).toMatchObject({ motionEnabled: true, cardAnimation: true, cardSpeed: 1.7, rosterFirstClick: 'move' });
		const speedRestored = new AppSettingsState(() => ({ storage, reducedMotion: media }));
		const releaseSpeedRestored = speedRestored.retain();
		expect(speedRestored.snapshot.cardSpeed).toBe(1.7);
		releaseSpeedRestored();
		media.set(true);
		expect(settings.snapshot).toMatchObject({ reducedMotion: true, effectiveEnabled: false, animateCards: false });
		settings.setMotionEnabled(false);
		media.set(false);
		expect(settings.snapshot).toMatchObject({ reducedMotion: false, effectiveEnabled: false, animateCards: false });
		expect(snapshots).toContain(false);

		unsubscribe();
		release();
		expect(media.listeners.size).toBe(0);
	});


	it('ignores card speeds outside the supported API bounds', () => {
		const media = new FakeMediaPreference();
		const storage = new MemoryStorage();
		const settings = new AppSettingsState(() => ({ storage, reducedMotion: media }));
		const release = settings.retain();

		settings.setCardSpeed(0.49);
		settings.setCardSpeed(2.01);
		settings.setCardSpeed(Number.NaN);
		settings.setCardSpeed(Number.POSITIVE_INFINITY);

		expect(settings.snapshot.cardSpeed).toBe(1);
		release();
	});

	it('keeps session controls usable when storage is denied', () => {
		const media = new FakeMediaPreference();
		const storage = new MemoryStorage();
		storage.blocked = true;
		const settings = new AppSettingsState(() => ({ storage, reducedMotion: media }));
		const release = settings.retain();
		settings.setMotionEnabled(false);

		expect(settings.snapshot).toMatchObject({ motionEnabled: false, effectiveEnabled: false, storageAvailable: false });
		release();
	});

	it('keeps live OS reduced motion when the localStorage getter is denied', () => {
		const media = new FakeMediaPreference();
		media.set(true);
		const source = {
			get localStorage(): Storage {
				throw new DOMException('Blocked', 'SecurityError');
			},
			matchMedia: () => media
		} as unknown as Pick<Window, 'localStorage' | 'matchMedia'>;
		const environment = browserEnvironment(source);
		const settings = new AppSettingsState(() => environment);
		const release = settings.retain();

		expect(settings.snapshot).toMatchObject({
			reducedMotion: true,
			effectiveEnabled: false,
			storageAvailable: false
		});
		expect(media.listeners.size).toBe(1);

		settings.setMotionEnabled(false);
		media.set(false);
		expect(settings.snapshot).toMatchObject({
			motionEnabled: false,
			reducedMotion: false,
			effectiveEnabled: false
		});
		media.set(true);
		expect(settings.snapshot).toMatchObject({ reducedMotion: true, effectiveEnabled: false });

		release();
		expect(media.listeners.size).toBe(0);
	});
});

describe('autonomous motion scheduler', () => {
	it('shares one throttled frame loop and one observer across visible subscribers', () => {
		const { environment, scheduler } = createSchedulerFixture();
		const firstNode = {} as Element;
		const secondNode = {} as Element;
		const firstFrames: number[] = [];
		const secondFrames: number[] = [];
		const first = scheduler.register(firstNode, {
			active: () => true,
			frame: frame => firstFrames.push(frame.time),
			state: () => undefined
		});
		const second = scheduler.register(secondNode, {
			active: () => true,
			frame: frame => secondFrames.push(frame.time),
			state: () => undefined
		});

		expect(environment.frames.size).toBe(1);
		expect(environment.observed.size).toBe(2);
		environment.flush(0);
		environment.flush(10);
		expect(firstFrames).toEqual([0]);
		environment.flush(31);
		expect(firstFrames).toEqual([0, 31]);
		expect(secondFrames).toEqual([0, 31]);

		environment.intersect(firstNode, false);
		environment.flush(62);
		expect(firstFrames).toEqual([0, 31]);
		expect(secondFrames).toEqual([0, 31, 62]);

		first.unregister();
		second.unregister();
		expect(environment.frames.size).toBe(0);
		expect(environment.visibilityListeners.size).toBe(0);
		expect(environment.observed.size).toBe(0);
		expect(environment.disconnected).toBe(1);
	});

	it('retains the shared lifecycle until its last resize consumer releases', () => {
		const { environment, media, scheduler } = createSchedulerFixture();
		const motionNode = {} as Element;
		const resizeNode = {} as Element;
		let resizeCount = 0;
		const stopResize = scheduler.observeResize(resizeNode, () => resizeCount++);
		const registration = scheduler.register(motionNode, {
			active: () => true,
			frame: () => undefined,
			state: () => undefined
		});

		environment.resize(resizeNode);
		expect(resizeCount).toBe(1);
		expect(environment.resizeObserved.has(resizeNode)).toBe(true);

		registration.unregister();
		expect(environment.visibilityListeners.size).toBe(1);
		expect(environment.disconnected).toBe(0);
		expect(media.listeners.size).toBe(1);

		stopResize();
		expect(environment.visibilityListeners.size).toBe(0);
		expect(environment.resizeObserved.size).toBe(0);
		expect(environment.disconnected).toBe(1);
		expect(environment.resizeDisconnected).toBe(1);
		expect(media.listeners.size).toBe(0);
	});

	it('freezes logical time while hidden and resets subscribers on live preference changes', () => {
		const { environment, media, scheduler } = createSchedulerFixture();
		const times: number[] = [];
		const effectiveStates: boolean[] = [];
		const registration = scheduler.register({} as Element, {
			active: settings => settings.effectiveEnabled,
			frame: frame => times.push(frame.time),
			state: settings => effectiveStates.push(settings.effectiveEnabled)
		});

		environment.flush(100);
		environment.flush(131);
		environment.setHidden(true);
		expect(environment.frames.size).toBe(0);
		environment.setHidden(false);
		environment.flush(10_000);
		environment.flush(10_031);
		expect(times).toEqual([0, 31, 31, 62]);

		media.set(true);
		environment.flush(10_062);
		expect(effectiveStates.at(-1)).toBe(false);
		expect(environment.frames.size).toBe(0);
		media.set(false);
		expect(effectiveStates.at(-1)).toBe(true);
		expect(environment.frames.size).toBe(1);

		registration.unregister();
		expect(media.listeners.size).toBe(0);
	});
});
