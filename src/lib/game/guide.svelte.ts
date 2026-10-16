import { shopState } from '../cosmetics/store.svelte.ts';

/**
 * The guided first season: one short tip at each first-time decision of a real run. Progress lives in
 * this browser's storage, apart from the token ledger, so skipping, finishing or resetting guidance can
 * never grant or forfeit the first-season bonus. Storage failures only mean tips may show again.
 */
export const GUIDE_STORAGE_KEY = '162-zero:guide:v1';
export const GUIDE_STEPS = ['stadium', 'pack', 'extra', 'roster'] as const;
export type GuideStep = typeof GUIDE_STEPS[number];
type Stored = { skipped: boolean; done: GuideStep[] };

function read(): Stored {
	try {
		const value = JSON.parse(localStorage.getItem(GUIDE_STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
		if (value && typeof value.skipped === 'boolean' && Array.isArray(value.done)) {
			return { skipped: value.skipped, done: value.done.filter((step): step is GuideStep => GUIDE_STEPS.includes(step as GuideStep)) };
		}
	} catch { /* unavailable or malformed storage starts fresh */ }
	return { skipped: false, done: [] };
}

class Guide {
	#state = $state<Stored>(typeof window === 'undefined' ? { skipped: false, done: [] } : read());

	#write(): void {
		try { localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(this.#state)); } catch { /* this tab keeps its progress */ }
	}
	/** Guidance ends when the device completes its first season or the player dismisses every tip. */
	get active(): boolean {
		const { skipped, done } = this.#state;
		return !skipped && done.length < GUIDE_STEPS.length && shopState.snapshot?.firstSeasonBonus === true;
	}
	shows(step: GuideStep): boolean {
		return this.active && !this.#state.done.includes(step);
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
}

export const guide = new Guide();
