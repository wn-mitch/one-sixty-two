<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Modal error report. It opens whenever `message` is set and stacks above any open dialog,
	 * so the page and its header never shift. Escape, the backdrop, and Dismiss all dismiss it.
	 */
	let { message, onDismiss, actions }: { message: string; onDismiss: () => void; actions?: Snippet } = $props();
	let dialog = $state<HTMLDialogElement>();
	let dismiss = $state<HTMLButtonElement>();
	const titleId = $props.id();

	$effect(() => {
		if (!dialog) return;
		if (message && !dialog.open) {
			dialog.showModal();
			dismiss?.focus();
		} else if (!message && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="error-dialog"
	role="alertdialog"
	aria-labelledby={titleId}
	onclose={() => { if (message) onDismiss(); }}
	onclick={event => { if (event.target === dialog) dialog?.close(); }}
>
	<div class="panel">
		<h2 id={titleId}>Something went wrong</h2>
		<p role="alert">{message}</p>
		<div class="actions">
			<button bind:this={dismiss} type="button" class="secondary" onclick={() => dialog?.close()}>Dismiss</button>
			{@render actions?.()}
		</div>
	</div>
</dialog>

<style>
	.error-dialog {
		width: min(28rem, calc(100vw - 2rem));
		margin: auto;
		padding: 0;
		border: 1px solid var(--error);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1.5rem 4rem color-mix(in oklch, var(--background) 72%, transparent);
	}
	.error-dialog[open] { animation: rise 220ms var(--ease-out) both; }
	.error-dialog::backdrop { background: color-mix(in oklch, var(--background) 60%, transparent); }
	.panel { display: grid; gap: var(--space-3); padding: var(--space-6); }
	h2 { margin: 0; font-size: var(--text-xl); }
	p { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
	.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2); }
	@keyframes rise { from { opacity: 0; transform: translateY(.5rem) scale(.98); } to { opacity: 1; transform: none; } }
</style>
