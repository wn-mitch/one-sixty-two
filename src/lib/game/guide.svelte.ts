import { shopState } from '../cosmetics/store.svelte.ts';

/**
 * The guided first season: short callouts at each first-time decision of a real run, then one on the
 * first results. Progress lives in this browser's storage, apart from the token ledger, so skipping,
 * finishing or resetting guidance can never grant or forfeit the first-season bonus. Storage failures
 * only mean callouts may show again.
 */
export const GUIDE_STORAGE_KEY = '162-zero:guide:v2';
/** Callouts in the order they show; only the earliest one on screen shows at a time. */
export const GUIDE_STEPS = ['stadium', 'pack', 'card', 'slots', 'field', 'extra', 'free', 'roster', 'results'] as const;
export type GuideStep = typeof GUIDE_STEPS[number];
type Stored = { skipped: boolean; done: GuideStep[]; bonusPack: boolean; replaying?: boolean };

const fresh = (): Stored => ({ skipped: false, done: [], bonusPack: false });

function read(): Stored {
	try {
		const value = JSON.parse(localStorage.getItem(GUIDE_STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
		if (value && typeof value.skipped === 'boolean' && Array.isArray(value.done)) {
			return {
				skipped: value.skipped,
				done: value.done.filter((step): step is GuideStep => GUIDE_STEPS.includes(step as GuideStep)),
				bonusPack: value.bonusPack === true,
				...(value.replaying === true ? { replaying: true } : {})
			};
		}
	} catch { /* unavailable or malformed storage starts fresh */ }
	return fresh();
}

class Guide {
	#state = $state<Stored>(typeof window === 'undefined' ? fresh() : read());
	/** Callouts mounted on screen now, each waiting its turn. */
	#mounted = $state<GuideStep[]>([]);

	#write(): void {
		try { localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(this.#state)); } catch { /* this tab keeps its progress */ }
	}
	/**
	 * Draft callouts belong to a device's first season, or whenever the player replays the walkthrough
	 * from Settings. The results callout follows a guided draft: it shows once the finished-roster
	 * callout has, since completing that season ends the first-season bonus.
	 */
	#eligible(step: GuideStep): boolean {
		const { skipped, done, replaying } = this.#state;
		if (skipped || done.includes(step)) return false;
		if (replaying) return true;
		return step === 'results' ? done.includes('roster') : shopState.snapshot?.firstSeasonBonus === true;
	}
	/** Whether first-season tips are currently active (first run or replaying from Settings). */
	get active(): boolean {
		const { skipped, done, replaying } = this.#state;
		if (skipped || done.length >= GUIDE_STEPS.length) return false;
		return replaying === true || shopState.snapshot?.firstSeasonBonus === true;
	}
	/** 1-based position of `step` in the walkthrough. */
	stepNumber(step: GuideStep): number {
		return GUIDE_STEPS.indexOf(step) + 1;
	}
	/** Whether `step` is the callout to show now: eligible, and the earliest eligible one on screen. */
	shows(step: GuideStep): boolean {
		return GUIDE_STEPS.find(item => this.#mounted.includes(item) && this.#eligible(item)) === step;
	}
	mount(step: GuideStep): () => void {
		this.#mounted = [...this.#mounted, step];
		return () => {
			const index = this.#mounted.indexOf(step);
			if (index >= 0) this.#mounted = this.#mounted.toSpliced(index, 1);
		};
	}
	done(step: GuideStep): void {
		if (this.#state.done.includes(step)) return;
		const done = [...this.#state.done, step];
		const finished = done.length >= GUIDE_STEPS.length;
		this.#state = { ...this.#state, done, ...(finished ? { replaying: false } : {}) };
		this.#write();
	}
	skip(): void {
		this.#state = { ...this.#state, skipped: true, replaying: false };
		this.#write();
	}
	/** Re-enables all walkthrough tips without changing whether the first-season bonus pack was claimed. */
	reset(): void {
		this.#state = { ...this.#state, skipped: false, done: [], replaying: true };
		this.#write();
	}
	/** Whether this browser's first Classic draft received its bonus extra pack. */
	get bonusPackClaimed(): boolean {
		return this.#state.bonusPack;
	}
	/**
	 * Grants one bonus extra pack to a device's first Classic draft, once per browser: true for the draft
	 * being created now. Guidance being skipped does not forfeit it.
	 */
	claimBonusPack(): boolean {
		if (this.#state.bonusPack || shopState.snapshot?.firstSeasonBonus !== true) return false;
		this.#state = { ...this.#state, bonusPack: true };
		this.#write();
		return true;
	}
}

export const guide = new Guide();
