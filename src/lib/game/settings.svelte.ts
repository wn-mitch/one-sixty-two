export const APP_SETTINGS_STORAGE_KEY = '162-zero:settings:v1';

export type RosterClickBehavior = 'move' | 'review';

export interface AppPreferences {
	motionEnabled: boolean;
	cardAnimation: boolean;
	cardSpeed: number;
	rosterFirstClick: RosterClickBehavior;
}

export interface AppSettingsSnapshot extends AppPreferences {
	reducedMotion: boolean;
	effectiveEnabled: boolean;
	animateCards: boolean;
	storageAvailable: boolean;
}

interface MediaPreference {
	matches: boolean;
	addEventListener(type: 'change', listener: () => void): void;
	removeEventListener(type: 'change', listener: () => void): void;
}

export interface AppSettingsEnvironment {
	storage: Pick<Storage, 'getItem' | 'setItem'> | null;
	reducedMotion: MediaPreference;
}

type Listener = (settings: AppSettingsSnapshot) => void;

function validStored(value: unknown): AppPreferences | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<AppPreferences>;
	return typeof candidate.motionEnabled === 'boolean'
		&& typeof candidate.cardAnimation === 'boolean'
		&& typeof candidate.cardSpeed === 'number'
		&& Number.isFinite(candidate.cardSpeed)
		&& candidate.cardSpeed >= 0.5
		&& candidate.cardSpeed <= 2
		&& (candidate.rosterFirstClick === 'move' || candidate.rosterFirstClick === 'review')
		? {
			motionEnabled: candidate.motionEnabled,
			cardAnimation: candidate.cardAnimation,
			cardSpeed: candidate.cardSpeed,
			rosterFirstClick: candidate.rosterFirstClick
		}
		: null;
}

export function browserEnvironment(
	source: Pick<Window, 'localStorage' | 'matchMedia'> | null =
		typeof window === 'undefined' ? null : window
): AppSettingsEnvironment | null {
	if (!source) return null;
	const reducedMotion = source.matchMedia('(prefers-reduced-motion: reduce)');
	let storage: AppSettingsEnvironment['storage'] = null;
	try {
		storage = source.localStorage;
	} catch {
		// Storage access can be denied independently of media-query access.
	}
	return { storage, reducedMotion };
}

export class AppSettingsState {
	motionEnabled = $state(true);
	cardAnimation = $state(true);
	cardSpeed = $state(1);
	rosterFirstClick = $state<RosterClickBehavior>('move');
	reducedMotion = $state(false);
	storageAvailable = $state(true);

	#environmentFactory: () => AppSettingsEnvironment | null;
	#environment: AppSettingsEnvironment | null = null;
	#listeners = new Set<Listener>();
	#users = 0;
	#loaded = false;
	#motionAttributeCaptured = false;
	#previousMotionAttribute: string | null = null;

	constructor(environmentFactory: () => AppSettingsEnvironment | null = browserEnvironment) {
		this.#environmentFactory = environmentFactory;
	}

	get effectiveEnabled(): boolean {
		return this.motionEnabled && !this.reducedMotion;
	}

	get animateCards(): boolean {
		return this.effectiveEnabled && this.cardAnimation;
	}

	get snapshot(): AppSettingsSnapshot {
		return {
			motionEnabled: this.motionEnabled,
			cardAnimation: this.cardAnimation,
			cardSpeed: this.cardSpeed,
			rosterFirstClick: this.rosterFirstClick,
			reducedMotion: this.reducedMotion,
			effectiveEnabled: this.effectiveEnabled,
			animateCards: this.animateCards,
			storageAvailable: this.storageAvailable
		};
	}

	#syncMotionAttribute(): void {
		if (!this.#users || typeof document === 'undefined') return;
		const root = document.documentElement;
		if (!this.#motionAttributeCaptured) {
			this.#motionAttributeCaptured = true;
			this.#previousMotionAttribute = root.getAttribute('data-motion');
		}
		root.dataset.motion = this.effectiveEnabled ? 'on' : 'off';
	}

	#restoreMotionAttribute(): void {
		if (!this.#motionAttributeCaptured || typeof document === 'undefined') return;
		const root = document.documentElement;
		if (this.#previousMotionAttribute === null) root.removeAttribute('data-motion');
		else root.setAttribute('data-motion', this.#previousMotionAttribute);
		this.#motionAttributeCaptured = false;
		this.#previousMotionAttribute = null;
	}

	#notify = () => {
		this.#syncMotionAttribute();
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
			const raw = this.#environment.storage.getItem(APP_SETTINGS_STORAGE_KEY);
			const stored = raw ? validStored(JSON.parse(raw)) : null;
			if (stored) {
				this.motionEnabled = stored.motionEnabled;
				this.cardAnimation = stored.cardAnimation;
				this.cardSpeed = stored.cardSpeed;
				this.rosterFirstClick = stored.rosterFirstClick;
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
				this.#restoreMotionAttribute();
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
			storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({
				motionEnabled: this.motionEnabled,
				cardAnimation: this.cardAnimation,
				cardSpeed: this.cardSpeed,
				rosterFirstClick: this.rosterFirstClick
			} satisfies AppPreferences));
		} catch {
			this.storageAvailable = false;
		}
	}

	setMotionEnabled(motionEnabled: boolean): void {
		if (motionEnabled === this.motionEnabled) return;
		this.motionEnabled = motionEnabled;
		this.#persist();
		this.#notify();
	}

	setCardAnimation(cardAnimation: boolean): void {
		if (cardAnimation === this.cardAnimation) return;
		this.cardAnimation = cardAnimation;
		this.#persist();
		this.#notify();
	}
	setCardSpeed(cardSpeed: number): void {
		if (!Number.isFinite(cardSpeed) || cardSpeed < 0.5 || cardSpeed > 2 || cardSpeed === this.cardSpeed) return;
		this.cardSpeed = cardSpeed;
		this.#persist();
		this.#notify();
	}

	setRosterFirstClick(rosterFirstClick: RosterClickBehavior): void {
		if (rosterFirstClick === this.rosterFirstClick) return;
		this.rosterFirstClick = rosterFirstClick;
		this.#persist();
		this.#notify();
	}
}

export const appSettings = new AppSettingsState();
