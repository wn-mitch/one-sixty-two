/**
 * Site-wide transient messages. Action feedback (copied, saved, failed) appears as a toast pinned to
 * the viewport instead of a paragraph that shifts the page. A toast with an `id` replaces the previous
 * toast with that id, so one action's progress and outcome share a single slot.
 */
import { untrack } from 'svelte';

export type ToastTone = 'info' | 'error';

export interface Toast {
	key: number;
	id: string | null;
	message: string;
	tone: ToastTone;
}

interface ShowOptions {
	id?: string;
	tone?: ToastTone;
	/** Milliseconds before dismissal; `null` keeps the toast until it is dismissed. */
	duration?: number | null;
}

const INFO_MS = 4000;
const ERROR_MS = 8000;
const MAX_TOASTS = 3;

class ToastStore {
	items = $state<Toast[]>([]);
	#next = 0;
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	/** Safe to call from an effect: the store's own state is read untracked. */
	show(message: string, options: ShowOptions = {}): void {
		if (message) untrack(() => this.#show(message, options));
	}

	#show(message: string, { id, tone = 'info', duration }: ShowOptions): void {
		if (id) for (const item of this.items) if (item.id === id) this.dismiss(item.key);
		const toast: Toast = { key: this.#next++, id: id ?? null, message, tone };
		this.items = [...this.items, toast].slice(-MAX_TOASTS);
		// A message carrying a link to copy by hand stays until the reader is done with it.
		const wait = duration !== undefined ? duration : /https?:\/\//.test(message) ? null : tone === 'error' ? ERROR_MS : INFO_MS;
		if (wait !== null) this.#timers.set(toast.key, setTimeout(() => this.dismiss(toast.key), wait));
	}

	dismiss(key: number): void {
		clearTimeout(this.#timers.get(key));
		this.#timers.delete(key);
		this.items = this.items.filter(item => item.key !== key);
	}
}

export const toasts = new ToastStore();
