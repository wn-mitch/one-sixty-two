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
type Stored = { skipped: boolean; done: GuideStep[]; bonusPack: boolean };

const fresh = (): Stored => ({ skipped: false, done: [], bonusPack: false });

function read(): Stored {
	try {
		const value = JSON.parse(localStorage.getItem(GUIDE_STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
		if (value && typeof value.skipped === 'boolean' && Array.isArray(value.done)) {
			return {
				skipped: value.skipped,
				done: value.done.filter((step): step is GuideStep => GUIDE_STEPS.includes(step as GuideStep)),
				bonusPack: value.bonusPack === true
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
	 * Draft callouts belong to a device's first season. The results callout follows a guided draft: it
	 * shows once the finished-roster callout has, since completing that season ends the first-season bonus.
	 */
	#eligible(step: GuideStep): boolean {
		const { skipped, done } = this.#state;
		if (skipped || done.includes(step)) return false;
		return step === 'results' ? done.includes('roster') : shopState.snapshot?.firstSeasonBonus === true;
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
		this.#state = { ...this.#state, done: [...this.#state.done, step] };
		this.#write();
	}
	skip(): void {
		this.#state = { ...this.#state, skipped: true };
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
