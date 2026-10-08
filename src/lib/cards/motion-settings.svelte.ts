export const MOTION_STORAGE_KEY = '162-zero:motion:v1';

export interface MotionPreferences {
	enabled: boolean;
	amount: number;
	speed: number;
}

export interface MotionSettingsSnapshot extends MotionPreferences {
	reducedMotion: boolean;
	effectiveEnabled: boolean;
	storageAvailable: boolean;
}

interface MediaPreference {
	matches: boolean;
	addEventListener(type: 'change', listener: () => void): void;
	removeEventListener(type: 'change', listener: () => void): void;
}

export interface MotionSettingsEnvironment {
	storage: Pick<Storage, 'getItem' | 'setItem'> | null;
	reducedMotion: MediaPreference;
}

const DEFAULTS: MotionPreferences = { enabled: true, amount: 2.5, speed: 1 };
const AMOUNT_STEP = 0.25;
const SPEED_STEP = 0.25;

type Listener = (settings: MotionSettingsSnapshot) => void;

function stepped(value: number, minimum: number, maximum: number, step: number): number {
	if (!Number.isFinite(value)) return minimum;
	const bounded = Math.max(minimum, Math.min(maximum, value));
	return Math.round(bounded / step) * step;
}

function validStored(value: unknown): MotionPreferences | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<MotionPreferences>;
	if (typeof candidate.enabled !== 'boolean' || typeof candidate.amount !== 'number' || typeof candidate.speed !== 'number') return null;
	return {
		enabled: candidate.enabled,
		amount: stepped(candidate.amount, 0, 3, AMOUNT_STEP),
		speed: stepped(candidate.speed, 0.25, 2, SPEED_STEP)
	};
}

export function browserEnvironment(
	source: Pick<Window, 'localStorage' | 'matchMedia'> | null =
		typeof window === 'undefined' ? null : window
): MotionSettingsEnvironment | null {
	if (!source) return null;
	const reducedMotion = source.matchMedia('(prefers-reduced-motion: reduce)');
	let storage: MotionSettingsEnvironment['storage'] = null;
	try {
		storage = source.localStorage;
	} catch {
		// Storage access can be denied independently of media-query access.
	}
	return { storage, reducedMotion };
}

export class MotionSettingsState {
	enabled = $state(DEFAULTS.enabled);
	amount = $state(DEFAULTS.amount);
	speed = $state(DEFAULTS.speed);
	reducedMotion = $state(false);
	storageAvailable = $state(true);

	#environmentFactory: () => MotionSettingsEnvironment | null;
	#environment: MotionSettingsEnvironment | null = null;
	#listeners = new Set<Listener>();
	#users = 0;
	#loaded = false;

	constructor(environmentFactory: () => MotionSettingsEnvironment | null = browserEnvironment) {
		this.#environmentFactory = environmentFactory;
	}

	get effectiveEnabled(): boolean {
		return this.enabled && !this.reducedMotion;
	}

	get snapshot(): MotionSettingsSnapshot {
		return {
			enabled: this.enabled,
			amount: this.amount,
			speed: this.speed,
			reducedMotion: this.reducedMotion,
			effectiveEnabled: this.effectiveEnabled,
			storageAvailable: this.storageAvailable
		};
	}

	#notify = () => {
		const snapshot = this.snapshot;
		for (const listener of this.#listeners) listener(snapshot);
	};

	#readStored(): void {
		if (this.#loaded || !this.#environment) return;
		this.#loaded = true;
		if (!this.#environment.storage) {
			this.storageAvailable = false;
			return;
		}
		try {
			const raw = this.#environment.storage.getItem(MOTION_STORAGE_KEY);
			const stored = raw ? validStored(JSON.parse(raw)) : null;
			if (stored) {
				this.enabled = stored.enabled;
				this.amount = stored.amount;
				this.speed = stored.speed;
			}
		} catch {
			this.storageAvailable = false;
		}
	}

	#onReducedMotionChange = () => {
		const next = this.#environment?.reducedMotion.matches ?? false;
		if (next === this.reducedMotion) return;
		this.reducedMotion = next;
		this.#notify();
	};

	retain(): () => void {
		this.#users++;
		if (this.#users === 1) {
			try {
				this.#environment = this.#environmentFactory();
			} catch {
				this.#environment = null;
				this.storageAvailable = false;
			}
			this.#readStored();
			this.reducedMotion = this.#environment?.reducedMotion.matches ?? false;
			this.#environment?.reducedMotion.addEventListener('change', this.#onReducedMotionChange);
			this.#notify();
		}
		let retained = true;
		return () => {
			if (!retained) return;
			retained = false;
			this.#users--;
			if (this.#users === 0) {
				this.#environment?.reducedMotion.removeEventListener('change', this.#onReducedMotionChange);
				this.#environment = null;
			}
		};
	}

	subscribe(listener: Listener): () => void {
		this.#listeners.add(listener);
		listener(this.snapshot);
		return () => this.#listeners.delete(listener);
	}

	#persist(): void {
		const storage = this.#environment?.storage;
		if (!storage || !this.storageAvailable) return;
		try {
			storage.setItem(MOTION_STORAGE_KEY, JSON.stringify({
				enabled: this.enabled,
				amount: this.amount,
				speed: this.speed
			} satisfies MotionPreferences));
		} catch {
			this.storageAvailable = false;
		}
	}

	setEnabled(enabled: boolean): void {
		if (enabled === this.enabled) return;
		this.enabled = enabled;
		this.#persist();
		this.#notify();
	}

	setAmount(amount: number): void {
		const next = stepped(amount, 0, 3, AMOUNT_STEP);
		if (next === this.amount) return;
		this.amount = next;
		this.#persist();
		this.#notify();
	}

	setSpeed(speed: number): void {
		const next = stepped(speed, 0.25, 2, SPEED_STEP);
		if (next === this.speed) return;
		this.speed = next;
		this.#persist();
		this.#notify();
	}
}

export const motionSettings = new MotionSettingsState();
