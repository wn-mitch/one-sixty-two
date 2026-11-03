<script lang="ts">
	import { tick } from 'svelte';

	const NAME_MIN = 3;
	const NAME_MAX = 20;
	const ALLOWED = /^[\p{L}\p{N} .'_-]+$/u;
	const URL_LIKE = /@|https?|www|\.(?:com|net|org|io|gg|tv|dev|co|me|app|xyz|ly|ru|link|site|online|live|info|biz)(?:\b|$)/i;

	/**
	 * Prompts for a leaderboard nickname before starting an unplayed daily on a device that has no
	 * saved nickname yet. Escape, backdrop, or close cancels without spending today's daily attempt.
	 */
	let { open, busy = false, onSave, onAnonymous, onCancel }: {
		open: boolean;
		busy?: boolean;
		onSave: (name: string) => void | Promise<void>;
		onAnonymous: () => void | Promise<void>;
		onCancel: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let draft = $state('');
	let error = $state('');
	const uid = $props.id();
	const titleId = `${uid}-title`;
	const inputId = `${uid}-input`;
	const hintId = `${uid}-hint`;
	const errorId = `${uid}-error`;

	function validate(raw: string): { ok: true; name: string } | { ok: false; message: string } {
		const name = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
		const length = [...name].length;
		if (length < NAME_MIN || length > NAME_MAX) return { ok: false, message: `Nicknames must be ${NAME_MIN} to ${NAME_MAX} characters.` };
		if (!ALLOWED.test(name)) return { ok: false, message: "Use letters, numbers, spaces, and . ' _ - only." };
		if (URL_LIKE.test(name)) return { ok: false, message: 'Nicknames cannot look like a link or email address.' };
		return { ok: true, name };
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (busy) return;
		const checked = validate(draft);
		if (!checked.ok) {
			error = checked.message;
			input?.focus();
			return;
		}
		error = '';
		void onSave(checked.name);
	}

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			draft = '';
			error = '';
			dialog.showModal();
			void tick().then(() => input?.focus());
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});
</script>

<dialog
	bind:this={dialog}
	class="daily-name-dialog"
	aria-labelledby={titleId}
	onclose={() => { if (open) onCancel(); }}
	onclick={event => { if (event.target === dialog) dialog?.close(); }}
>
	<form class="panel" onsubmit={submit} novalidate>
		<header class="head">
			<h2 id={titleId}>Pick a leaderboard nickname</h2>
			<button type="button" class="quiet close" aria-label="Cancel" onclick={() => dialog?.close()}>×</button>
		</header>
		<p class="lede">Your daily run joins today’s leaderboard. Choose a nickname to appear on the board — you can change it anytime in Settings — or stay Anonymous.</p>
		<div class="field">
			<label for={inputId}>Leaderboard nickname</label>
			<input
				bind:this={input}
				id={inputId}
				type="text"
				maxlength={NAME_MAX}
				autocomplete="nickname"
				spellcheck="false"
				placeholder="Your nickname"
				bind:value={draft}
				disabled={busy}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? `${hintId} ${errorId}` : hintId}
				oninput={() => { if (error) error = ''; }}
			/>
			<p id={hintId} class="hint">3 to 20 characters. <a href="/conduct">Name rules</a></p>
			{#if error}<p id={errorId} class="field-error" role="alert">{error}</p>{/if}
		</div>
		<div class="actions">
			<button type="button" class="secondary" disabled={busy} onclick={() => void onAnonymous()}>Stay anonymous</button>
			<button type="submit" class="primary" disabled={busy || !draft.trim()}>Save &amp; play daily</button>
		</div>
	</form>
</dialog>

<style>
	.daily-name-dialog {
		width: min(30rem, calc(100vw - 2rem));
		margin: auto;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1.5rem 4rem color-mix(in oklch, var(--background) 72%, transparent);
	}
	.daily-name-dialog[open] { animation: rise 220ms var(--ease-out) both; }
	.daily-name-dialog::backdrop { background: color-mix(in oklch, var(--background) 76%, transparent); }
	.panel { display: grid; gap: var(--space-4); padding: var(--space-6); }
	.head { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
	h2 { margin: 0; font-size: var(--text-xl); }
	.close { min-width: 2.75rem; min-height: 2.75rem; padding: 0; font-size: 1.5rem; line-height: 1; color: var(--muted); }
	.lede { margin: 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.5; }
	.field { display: grid; gap: var(--space-1); }
	label { font-size: var(--text-sm); font-weight: 700; }
	input { width: 100%; min-height: 44px; }
	.hint { margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.field-error { margin: 0; color: var(--error); font-size: var(--text-sm); }
	.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-1); }
	@keyframes rise { from { opacity: 0; transform: translateY(.5rem) scale(.98); } to { opacity: 1; transform: none; } }
	@media (max-width: 28rem) {
		.panel { padding: var(--space-5); }
		.actions { display: grid; }
	}
</style>
