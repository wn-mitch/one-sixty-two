import { describe, expect, it } from 'vitest';
import { APP_SETTINGS_STORAGE_KEY, AppSettingsState } from '../game/settings.svelte.ts';
import { DEVICE_TILT_RANGE, DeviceTiltSource, screenAxes, type DeviceTiltEnvironment, type DeviceTiltValue, type OrientationSample } from './device-tilt.ts';

class FakeMedia {
	matches = false;
	#listeners = new Set<() => void>();
	addEventListener(_: 'change', listener: () => void) { this.#listeners.add(listener); }
	removeEventListener(_: 'change', listener: () => void) { this.#listeners.delete(listener); }
	set(matches: boolean) { this.matches = matches; for (const listener of this.#listeners) listener(); }
}

class MemoryStorage {
	values = new Map<string, string>();
	getItem(key: string) { return this.values.get(key) ?? null; }
	setItem(key: string, value: string) { this.values.set(key, value); }
}

/** A phone: orientation events, screen rotation, visibility and taps, all driven by the test. */
class FakePhone {
	angle = 0;
	isHidden = false;
	finePointer = false;
	time = 0;
	permission: ((inGesture: boolean) => Promise<'granted' | 'denied' | 'default' | 'prompt'>) | undefined;
	inGesture = false;
	orientation = new Set<(sample: OrientationSample) => void>();
	visibility = new Set<() => void>();
	gestures = new Set<() => void>();
	requests = 0;

	environment(): DeviceTiltEnvironment {
		return {
			supported: true,
			requestPermission: this.permission ? () => { this.requests++; return this.permission!(this.inGesture); } : undefined,
			finePointerOnly: () => this.finePointer,
			screenAngle: () => this.angle,
			hidden: () => this.isHidden,
			now: () => this.time,
			listenOrientation: listener => { this.orientation.add(listener); return () => this.orientation.delete(listener); },
			listenVisibility: listener => { this.visibility.add(listener); return () => this.visibility.delete(listener); },
			onNextGesture: listener => { this.gestures.add(listener); return () => this.gestures.delete(listener); }
		};
	}

	/** Holds one pose for `ms`, reporting at 60Hz. */
	hold(beta: number, gamma: number, ms: number) {
		for (let elapsed = 0; elapsed < ms; elapsed += 16) {
			this.time += 16;
			for (const listener of [...this.orientation]) listener({ beta, gamma });
		}
	}

	setHidden(hidden: boolean) { this.isHidden = hidden; for (const listener of this.visibility) listener(); }
	/** Runs `action` as a tap handler, with user activation. */
	gesture<T>(action: () => T): T { this.inGesture = true; try { return action(); } finally { this.inGesture = false; } }
	/** Like the browser's, the next-tap hook fires once. */
	tap() { const pending = [...this.gestures]; this.gestures.clear(); this.gesture(() => { for (const listener of pending) listener(); }); }
}

function fixture({ permission, stored }: { permission?: FakePhone['permission']; stored?: object } = {}) {
	const phone = new FakePhone();
	phone.permission = permission;
	const media = new FakeMedia();
	const storage = new MemoryStorage();
	if (stored) storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(stored));
	const settings = new AppSettingsState(() => ({ storage, reducedMotion: media }));
	const source = new DeviceTiltSource(() => phone.environment(), settings);
	const values: DeviceTiltValue[] = [];
	const last = () => values.at(-1);
	return { phone, media, storage, settings, source, values, last, listen: () => source.subscribe(value => values.push(value)) };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('screenAxes', () => {
	it('turns device beta/gamma into screen axes for each screen rotation', () => {
		expect(screenAxes(10, 4, 0)).toEqual({ x: 4, y: 10 });
		expect(screenAxes(10, 4, 90)).toEqual({ x: 10, y: -4 });
		expect(screenAxes(10, 4, 180)).toEqual({ x: -4, y: -10 });
		expect(screenAxes(10, 4, 270)).toEqual({ x: -10, y: 4 });
		expect(screenAxes(10, 4, -90)).toEqual({ x: -10, y: 4 });
	});
});

describe('deviceTilt', () => {
	it('reads the starting grip as rest and normalizes tilt from it, clamped to ±1', () => {
		const { phone, listen, last, values } = fixture();
		listen();
		phone.hold(55, -3, 200);
		expect(Math.abs(last()!.x)).toBeLessThan(0.01);
		expect(Math.abs(last()!.y)).toBeLessThan(0.01);

		// Half the range to the right settles near +0.5 (a little less as the neutral starts to follow).
		phone.hold(55, -3 + DEVICE_TILT_RANGE / 2, 400);
		expect(last()!.x).toBeGreaterThan(0.42);
		expect(last()!.x).toBeLessThan(0.5);
		expect(Math.abs(last()!.y)).toBeLessThan(0.01);

		// Far past the range in gradual steps: clamped, never beyond 1.
		for (let gamma = 6; gamma <= 60; gamma += 6) phone.hold(55, gamma, 48);
		phone.hold(55, 60, 300);
		expect(last()!.x).toBeGreaterThan(0.95);
		expect(Math.max(...values.map(value => Math.abs(value.x)))).toBeLessThanOrEqual(1);
	});

	it('follows the screen rotation, so tilting toward the screen right is +x in landscape too', () => {
		const { phone, listen, last } = fixture();
		phone.angle = 90;
		listen();
		phone.hold(0, 60, 100);
		// In landscape (90°) device beta runs along the screen's horizontal axis.
		phone.hold(9, 60, 400);
		expect(last()!.x).toBeGreaterThan(0.4);
		expect(Math.abs(last()!.y)).toBeLessThan(0.01);
	});

	it('recentres slowly onto a new steady grip', () => {
		const { phone, listen, last } = fixture();
		listen();
		phone.hold(40, 0, 100);
		phone.hold(40, 12, 300);
		const leaning = last()!.x;
		expect(leaning).toBeGreaterThan(0.5);
		phone.hold(40, 12, 1000);
		expect(last()!.x).toBeLessThan(leaning);
		expect(last()!.x).toBeGreaterThan(0.3);
		phone.hold(40, 12, 20000);
		expect(Math.abs(last()!.x)).toBeLessThan(0.02);
	});

	it('treats a sudden axis flip as a new rest pose instead of a full-scale swing', () => {
		const { phone, listen, values } = fixture();
		listen();
		phone.hold(85, 10, 200);
		// Passing through vertical flips gamma by ~180° and mirrors beta.
		phone.hold(95, -170, 400);
		expect(Math.max(...values.map(value => Math.abs(value.x)))).toBeLessThan(0.05);
	});

	it('stays silent with reduced motion, Motion off or a hidden page, after returning cards to rest once', () => {
		const { phone, media, settings, listen, values, last } = fixture();
		listen();
		phone.hold(40, 0, 100);
		phone.hold(40, 9, 300);
		expect(last()!.x).toBeGreaterThan(0.3);

		media.set(true);
		expect(last()).toEqual({ x: 0, y: 0 });
		expect(phone.orientation.size).toBe(0);
		const count = values.length;
		phone.hold(40, 15, 300);
		expect(values).toHaveLength(count);

		media.set(false);
		expect(phone.orientation.size).toBe(1);
		phone.hold(40, 15, 100);
		// Readings resume from a fresh neutral, so the pose held while gated reads as rest.
		expect(Math.abs(last()!.x)).toBeLessThan(0.05);

		settings.setMotionEnabled(false);
		expect(phone.orientation.size).toBe(0);
		settings.setMotionEnabled(true);
		phone.setHidden(true);
		expect(phone.orientation.size).toBe(0);
		phone.setHidden(false);
		expect(phone.orientation.size).toBe(1);
	});

	it('is unsupported with only a fine pointer and listens only while subscribed', () => {
		const desktop = fixture();
		desktop.phone.finePointer = true;
		expect(desktop.source.state).toBe('unsupported');
		desktop.listen();
		expect(desktop.phone.orientation.size).toBe(0);

		const { phone, listen } = fixture();
		expect(phone.orientation.size).toBe(0);
		const stop = listen();
		expect(phone.orientation.size).toBe(1);
		stop();
		expect(phone.orientation.size).toBe(0);
		expect(phone.visibility.size).toBe(0);
	});

	it('becomes unsupported when the browser fires only empty readings', () => {
		const { phone, source, listen, values } = fixture();
		listen();
		phone.hold(null as unknown as number, null as unknown as number, 32);
		expect(source.state).toBe('unsupported');
		expect(values).toHaveLength(0);
	});

	it('defaults on without a permission prompt and honours the saved choice', () => {
		const { source, settings, phone, listen } = fixture();
		expect(source.state).toBe('active');
		expect(source.enabled).toBe(true);
		listen();
		settings.setPhoneTilt(false);
		expect(source.enabled).toBe(false);
		expect(phone.orientation.size).toBe(0);
	});

	it('defaults on where the permission API grants without a prompt (Chromium)', async () => {
		const { source, phone, listen } = fixture({ permission: async () => 'granted' });
		listen();
		await flush();
		expect(source.state).toBe('active');
		expect(source.enabled).toBe(true);
		expect(phone.orientation.size).toBe(1);
	});

	/** iOS: no prompt outside a gesture, the player's answer inside one. */
	const ios = (answer: () => 'granted' | 'denied' | 'default' | 'prompt') => async (inGesture: boolean) => {
		if (!inGesture) throw new DOMException('Requesting device orientation access requires a user gesture', 'NotAllowedError');
		return answer();
	};

	it('needs permission on iOS: off by default, then active once granted from a tap', async () => {
		let answer: 'granted' | 'denied' | 'default' | 'prompt' = 'default';
		const { source, settings, phone, listen } = fixture({ permission: ios(() => answer) });
		const states: string[] = [];
		source.subscribeState(state => states.push(state));
		listen();
		await flush();
		expect(source.state).toBe('needs-permission');
		expect(source.enabled).toBe(false);
		expect(phone.orientation.size).toBe(0);
		expect(phone.gestures.size).toBe(0);

		// A dismissed or undecided prompt stays askable.
		expect(await phone.gesture(() => source.request())).toBe('needs-permission');
		answer = 'prompt';
		expect(await phone.gesture(() => source.request())).toBe('needs-permission');
		answer = 'granted';
		expect(await phone.gesture(() => source.request())).toBe('active');
		settings.setPhoneTilt(true);
		expect(phone.orientation.size).toBe(1);
		expect(states.at(-1)).toBe('active');
		expect(states).not.toContain('denied');
	});

	it('records a denial from a tap, including a prompt that throws or rejects', async () => {
		const denied = fixture({ permission: ios(() => 'denied') });
		expect(await denied.phone.gesture(() => denied.source.request())).toBe('denied');
		const thrown = fixture({ permission: inGesture => { if (inGesture) throw new Error('blocked'); return Promise.reject(new Error('no gesture')); } });
		await flush();
		expect(thrown.source.state).toBe('needs-permission');
		expect(await thrown.phone.gesture(() => thrown.source.request())).toBe('denied');
		const rejected = fixture({ permission: () => Promise.reject(new Error('NotAllowedError')) });
		expect(await rejected.phone.gesture(() => rejected.source.request())).toBe('denied');
	});

	it('asks again on the next tap when tilt was saved on but the grant did not survive a reload', async () => {
		const { source, phone, listen } = fixture({ permission: ios(() => 'granted'), stored: { motionEnabled: true, cardAnimation: true, cardSpeed: 1, rosterFirstClick: 'move', phoneTilt: true } });
		listen();
		await flush();
		expect(source.state).toBe('needs-permission');
		expect(phone.gestures.size).toBe(1);
		phone.tap();
		await flush();
		expect(source.state).toBe('active');
		expect(phone.orientation.size).toBe(1);
		expect(phone.gestures.size).toBe(0);
	});
});

describe('phone tilt preference', () => {
	it('persists an explicit choice and leaves older saves on the platform default', () => {
		const old = fixture({ stored: { motionEnabled: true, cardAnimation: true, cardSpeed: 1, rosterFirstClick: 'move' } });
		const release = old.settings.retain();
		expect(old.settings.phoneTilt).toBeNull();
		old.settings.setPhoneTilt(false);
		expect(JSON.parse(old.storage.getItem(APP_SETTINGS_STORAGE_KEY)!).phoneTilt).toBe(false);
		release();
		const restored = new AppSettingsState(() => ({ storage: old.storage, reducedMotion: old.media }));
		restored.retain();
		expect(restored.phoneTilt).toBe(false);
	});
});
