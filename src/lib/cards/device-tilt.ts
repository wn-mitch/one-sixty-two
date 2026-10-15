import { appSettings, type AppSettingsSnapshot } from '../game/settings.svelte.ts';

/**
 * Phone tilt from `deviceorientation`, shared by every card. Values are screen-space and normalized to
 * −1..1 around a neutral pose: x > 0 when the screen's right edge dips away from the viewer, y > 0 when
 * its top edge tips toward the viewer (the phone held more upright). The neutral pose is captured when
 * listening starts and drifts slowly toward however the phone is held, so any steady grip reads as rest.
 */
export interface DeviceTiltValue { x: number; y: number }
export type DeviceTiltState = 'unsupported' | 'needs-permission' | 'denied' | 'active';
/** WebKit answers 'default' for a dismissed prompt; Chromium answers 'prompt' before the player decides. */
type PermissionResult = 'granted' | 'denied' | 'default' | 'prompt';

/** One orientation reading in degrees, as `DeviceOrientationEvent` reports it. */
export interface OrientationSample { beta: number | null; gamma: number | null }

/** Everything the source touches in the browser, so tests can drive it with a fake. */
export interface DeviceTiltEnvironment {
	/** Whether the browser has `DeviceOrientationEvent` at all. */
	supported: boolean;
	/**
	 * `DeviceOrientationEvent.requestPermission` where the browser has it. iOS only prompts inside a user
	 * gesture and rejects without prompting outside one; Chromium grants without a prompt.
	 */
	requestPermission?: () => Promise<PermissionResult>;
	/** True when every pointer is fine (a desktop with a mouse), where tilt stays with the pointer. */
	finePointerOnly(): boolean;
	/** `screen.orientation.angle` in degrees: 0, 90, 180 or 270. */
	screenAngle(): number;
	hidden(): boolean;
	now(): number;
	/** Runs `listener` once after `ms`; the returned function cancels it. */
	later(ms: number, listener: () => void): () => void;
	listenOrientation(listener: (sample: OrientationSample) => void): () => void;
	listenVisibility(listener: () => void): () => void;
	/** Calls `listener` once on the next tap or click anywhere, inside that gesture. */
	onNextGesture(listener: () => void): () => void;
}

/** The settings the source reads: the motion gate and the player's choice. */
export interface DeviceTiltSettings {
	readonly effectiveEnabled: boolean;
	readonly phoneTilt: boolean | null;
	retain(): () => void;
	subscribe(listener: (settings: AppSettingsSnapshot) => void): () => void;
}

/** Degrees from neutral that read as full tilt. */
export const DEVICE_TILT_RANGE = 18;
/** Low-pass time constant for the output, in milliseconds. */
export const DEVICE_TILT_SMOOTHING_MS = 90;
/** Time constant for the neutral pose following the grip, in milliseconds. */
export const DEVICE_TILT_RECENTER_MS = 3500;
/**
 * How long readings may stay empty before the browser counts as having no sensor. Some browsers fire one
 * empty reading as listening starts and real ones after, so a single empty reading proves nothing.
 */
export const DEVICE_TILT_SENSOR_GRACE_MS = 1000;
/** A gap between readings longer than this is a paused sensor, not follow time; it counts as one frame. */
export const DEVICE_TILT_GAP_MS = 250;
const FRAME_MS = 16;
/** A single-event jump larger than this is a sensor flip (gimbal or wrap), not motion. */
const JUMP_DEGREES = 50;
/** After this many consecutive jumps the new pose is real; the neutral restarts there. */
const JUMP_RESET_SAMPLES = 4;

const clamp = (value: number) => Math.max(-1, Math.min(1, value));
/** The shortest signed difference between two angles, in degrees. */
const angleDelta = (to: number, from: number) => ((((to - from) % 360) + 540) % 360) - 180;
const follow = (dt: number, tau: number) => 1 - Math.exp(-Math.max(0, dt) / tau);

/**
 * Maps device beta/gamma into screen axes for the current screen rotation, so tilting the phone
 * toward the screen's right reads as +x whichever way it is turned.
 */
export function screenAxes(beta: number, gamma: number, angle: number): { x: number; y: number } {
	switch ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) {
		case 90: return { x: beta, y: -gamma };
		case 180: return { x: -gamma, y: -beta };
		case 270: return { x: -beta, y: gamma };
		default: return { x: gamma, y: beta };
	}
}

export class DeviceTiltSource {
	#environmentFactory: () => DeviceTiltEnvironment | null;
	#settings: DeviceTiltSettings;
	#environment: DeviceTiltEnvironment | null = null;
	#resolved = false;
	#permission: 'unknown' | 'granted' | 'denied' = 'unknown';
	#noSensor = false;
	#sawEmpty = false;
	#stopGrace: (() => void) | null = null;
	#listeners = new Set<(tilt: DeviceTiltValue) => void>();
	#stateListeners = new Set<(state: DeviceTiltState) => void>();
	#releaseSettings: (() => void) | null = null;
	#stopSettings: (() => void) | null = null;
	#stopVisibility: (() => void) | null = null;
	#stopOrientation: (() => void) | null = null;
	#stopGesture: (() => void) | null = null;
	#emitting = false;
	// Filter state, in screen-space degrees.
	#neutral: { x: number; y: number } | null = null;
	#smoothed = { x: 0, y: 0 };
	#last: { x: number; y: number; at: number } | null = null;
	#jumps = 0;

	constructor(environmentFactory: () => DeviceTiltEnvironment | null = browserTiltEnvironment, settings: DeviceTiltSettings = appSettings) {
		this.#environmentFactory = environmentFactory;
		this.#settings = settings;
	}

	#env(): DeviceTiltEnvironment | null {
		if (!this.#resolved) {
			this.#resolved = true;
			try { this.#environment = this.#environmentFactory(); } catch { this.#environment = null; }
			// A silent check outside any gesture: browsers that grant without a prompt (Chromium) or that
			// already hold this page's grant answer 'granted'; iOS without a grant rejects and shows nothing.
			if (this.#environment?.requestPermission) void this.#ask(this.#environment.requestPermission, true);
		}
		return this.#environment;
	}

	get state(): DeviceTiltState {
		return this.#noSensor ? 'unsupported' : this.#availability();
	}

	/** The state without the empty-sensor verdict, which stays revisable while readings may still arrive. */
	#availability(): DeviceTiltState {
		const env = this.#env();
		if (!env || !env.supported || env.finePointerOnly()) return 'unsupported';
		if (!env.requestPermission) return 'active';
		return this.#permission === 'granted' ? 'active' : this.#permission === 'denied' ? 'denied' : 'needs-permission';
	}

	/** On by default; platforms requiring permission ask on the first interaction. */
	get enabled(): boolean {
		return this.#settings.phoneTilt ?? true;
	}

	/**
	 * Asks for motion access where the platform requires it. Call it directly from a tap or click
	 * handler: iOS only shows its prompt inside a user gesture. Resolves with the resulting state.
	 */
	request(): Promise<DeviceTiltState> {
		const env = this.#env();
		if (!env?.requestPermission || this.state === 'unsupported' || this.#permission === 'granted') return Promise.resolve(this.state);
		return this.#ask(env.requestPermission, false);
	}

	/** Asks synchronously, so a caller inside a gesture keeps its user activation. */
	#ask(requestPermission: () => Promise<PermissionResult>, silent: boolean): Promise<DeviceTiltState> {
		let asked: Promise<PermissionResult>;
		try {
			asked = requestPermission();
		} catch (error) {
			asked = Promise.reject(error);
		}
		return asked.then(result => {
			// 'default' and 'prompt' mean nothing was decided; tilt stays askable.
			if (result === 'granted') this.#permission = 'granted';
			else if (result === 'denied') this.#permission = 'denied';
		}, () => {
			// Outside a gesture a rejection only means "ask from a tap"; from a tap it is a refusal.
			if (!silent) this.#permission = 'denied';
		}).then(() => {
			this.#changed();
			return this.state;
		});
	}

	/** Listens to tilt; the sensor runs only while at least one listener is subscribed. */
	subscribe(listener: (tilt: DeviceTiltValue) => void): () => void {
		this.#listeners.add(listener);
		if (this.#listeners.size === 1) this.#start();
		else this.#update();
		let subscribed = true;
		return () => {
			if (!subscribed) return;
			subscribed = false;
			this.#listeners.delete(listener);
			if (!this.#listeners.size) this.#stop();
		};
	}

	/** Listens to `state` changes, for controls that offer the permission prompt. Calls back immediately. */
	subscribeState(listener: (state: DeviceTiltState) => void): () => void {
		this.#stateListeners.add(listener);
		listener(this.state);
		return () => { this.#stateListeners.delete(listener); };
	}

	/** Re-evaluates the gates after an outside change, such as the player flipping the setting. */
	refresh(): void {
		this.#changed();
	}

	#changed(): void {
		const state = this.state;
		for (const listener of this.#stateListeners) listener(state);
		this.#update();
	}

	#start(): void {
		const env = this.#env();
		if (!env) return;
		this.#releaseSettings = this.#settings.retain();
		this.#stopSettings = this.#settings.subscribe(() => this.#update());
		this.#stopVisibility = env.listenVisibility(() => this.#update());
		this.#update();
	}

	#stop(): void {
		this.#detach();
		this.#stopGesture?.(); this.#stopGesture = null;
		this.#stopVisibility?.(); this.#stopVisibility = null;
		this.#stopSettings?.(); this.#stopSettings = null;
		this.#releaseSettings?.(); this.#releaseSettings = null;
	}

	/** Whether readings may reach listeners right now. */
	#open(): boolean {
		const env = this.#env();
		// A browser judged sensorless keeps listening, so its first real reading can revive tilt.
		const available = this.#availability() === 'active';
		const enabled = this.#settings.phoneTilt ?? available;
		return !!env && this.#listeners.size > 0 && enabled && available && this.#settings.effectiveEnabled && !env.hidden();
	}

	#update(): void {
		const env = this.#env();
		if (!env || !this.#listeners.size) return;
		// iOS needs a user gesture for a new grant, including the default-on first visit.
		const waiting = this.enabled && this.state === 'needs-permission' && this.#settings.effectiveEnabled;
		if (waiting && !this.#stopGesture) this.#stopGesture = env.onNextGesture(() => { this.#stopGesture = null; void this.request(); });
		if (!waiting && this.#stopGesture) { this.#stopGesture(); this.#stopGesture = null; }
		if (this.#open()) {
			if (!this.#stopOrientation) {
				this.#stopOrientation = env.listenOrientation(sample => this.#sample(sample));
				this.#sawEmpty = false;
				this.#stopGrace = env.later(DEVICE_TILT_SENSOR_GRACE_MS, () => {
					this.#stopGrace = null;
					// Only empty readings since listening began: there is no sensor behind them.
					if (this.#sawEmpty && !this.#last && !this.#noSensor) { this.#noSensor = true; this.#changed(); }
				});
			}
		} else {
			this.#detach();
		}
	}

	#detach(): void {
		this.#stopOrientation?.();
		this.#stopOrientation = null;
		this.#stopGrace?.();
		this.#stopGrace = null;
		// Gating returns cards to rest once, then stays silent until readings resume.
		if (this.#emitting) {
			this.#emitting = false;
			for (const listener of this.#listeners) listener({ x: 0, y: 0 });
		}
		this.#neutral = null;
		this.#last = null;
		this.#smoothed = { x: 0, y: 0 };
		this.#jumps = 0;
	}

	#sample({ beta, gamma }: OrientationSample): void {
		const env = this.#env();
		if (!env || !this.#open()) return;
		if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) {
			// Desktop browsers fire one empty event and nothing else; the grace timer decides.
			this.#sawEmpty = true;
			return;
		}
		if (this.#noSensor) { this.#noSensor = false; this.#changed(); }
		const pose = screenAxes(beta, gamma, env.screenAngle());
		const at = env.now();
		if (!this.#neutral || !this.#last) {
			this.#neutral = { ...pose };
			this.#last = { ...pose, at };
			return;
		}
		const jump = Math.hypot(angleDelta(pose.x, this.#last.x), angleDelta(pose.y, this.#last.y));
		if (jump > JUMP_DEGREES) {
			this.#jumps++;
			if (this.#jumps < JUMP_RESET_SAMPLES) return;
			// The phone really is in a new pose (or the axes flipped through vertical): rest there.
			this.#neutral = { ...pose };
			this.#last = { ...pose, at };
			this.#jumps = 0;
			return;
		}
		this.#jumps = 0;
		const gap = at - this.#last.at;
		const dt = gap > DEVICE_TILT_GAP_MS ? FRAME_MS : gap;
		this.#last = { ...pose, at };
		const drift = follow(dt, DEVICE_TILT_RECENTER_MS);
		this.#neutral = {
			x: this.#neutral.x + angleDelta(pose.x, this.#neutral.x) * drift,
			y: this.#neutral.y + angleDelta(pose.y, this.#neutral.y) * drift
		};
		const smooth = follow(dt, DEVICE_TILT_SMOOTHING_MS);
		const target = {
			x: clamp(angleDelta(pose.x, this.#neutral.x) / DEVICE_TILT_RANGE),
			y: clamp(angleDelta(pose.y, this.#neutral.y) / DEVICE_TILT_RANGE)
		};
		this.#smoothed = {
			x: this.#smoothed.x + (target.x - this.#smoothed.x) * smooth,
			y: this.#smoothed.y + (target.y - this.#smoothed.y) * smooth
		};
		this.#emitting = true;
		const value = { x: this.#smoothed.x, y: this.#smoothed.y };
		for (const listener of this.#listeners) listener(value);
	}
}

export function browserTiltEnvironment(): DeviceTiltEnvironment | null {
	if (typeof window === 'undefined' || typeof document === 'undefined') return null;
	const Orientation = (window as Window & { DeviceOrientationEvent?: { requestPermission?: () => Promise<PermissionResult> } }).DeviceOrientationEvent;
	const requestPermission = typeof Orientation?.requestPermission === 'function' ? Orientation.requestPermission.bind(Orientation) : undefined;
	return {
		supported: !!Orientation,
		requestPermission,
		finePointerOnly: () => !window.matchMedia('(any-pointer: coarse)').matches,
		screenAngle: () => screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0),
		hidden: () => document.visibilityState === 'hidden',
		now: () => performance.now(),
		later(ms, listener) {
			const timer = setTimeout(listener, ms);
			return () => clearTimeout(timer);
		},
		listenOrientation(listener) {
			const handle = (event: DeviceOrientationEvent) => listener({ beta: event.beta, gamma: event.gamma });
			window.addEventListener('deviceorientation', handle);
			return () => window.removeEventListener('deviceorientation', handle);
		},
		listenVisibility(listener) {
			document.addEventListener('visibilitychange', listener);
			return () => document.removeEventListener('visibilitychange', listener);
		},
		onNextGesture(listener) {
			// touchend and click both count as user activation for iOS's permission prompt.
			const handle = () => { stop(); listener(); };
			const stop = () => {
				document.removeEventListener('touchend', handle, true);
				document.removeEventListener('click', handle, true);
			};
			document.addEventListener('touchend', handle, true);
			document.addEventListener('click', handle, true);
			return stop;
		}
	};
}

/** The one shared phone-tilt source. */
export const deviceTilt = new DeviceTiltSource();
