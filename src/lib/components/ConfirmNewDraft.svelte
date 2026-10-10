<script lang="ts">
	/** Modal confirmation before a new draft replaces the saved run. Escape, the backdrop, and Keep draft all keep it. */
	let { open, onKeep, onDiscard }: { open: boolean; onKeep: () => void; onDiscard: () => void } = $props();
	let dialog = $state<HTMLDialogElement>();
	let keep = $state<HTMLButtonElement>();
	const titleId = $props.id();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			keep?.focus();
		} else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="confirm-new"
	aria-labelledby={titleId}
	onclose={() => { if (open) onKeep(); }}
	onclick={event => { if (event.target === dialog) dialog?.close(); }}
>
	<div class="panel">
		<h2 id={titleId}>Leave this roster behind?</h2>
		<p>Your picks are permanent. Starting a new draft replaces this saved run with a new seed.</p>
		<div class="actions">
			<button bind:this={keep} type="button" class="secondary" onclick={() => dialog?.close()}>Keep draft</button>
			<button type="button" class="primary" onclick={onDiscard}>Discard and start new</button>
		</div>
	</div>
</dialog>

<style>
	.confirm-new {
		width: min(28rem, calc(100vw - 2rem));
		margin: auto;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1.5rem 4rem color-mix(in oklch, var(--background) 72%, transparent);
	}
	.confirm-new[open] { animation: rise 220ms var(--ease-out) both; }
	.confirm-new::backdrop { background: color-mix(in oklch, var(--background) 76%, transparent); }
	.panel { display: grid; gap: var(--space-3); padding: var(--space-6); }
	h2 { margin: 0; font-size: var(--text-xl); }
	p { margin: 0; color: var(--muted); }
	.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2); }
	@keyframes rise { from { opacity: 0; transform: translateY(.5rem) scale(.98); } to { opacity: 1; transform: none; } }
</style>
