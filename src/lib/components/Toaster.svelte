<script lang="ts">
	import { toasts } from '#lib/toast.svelte.ts';

	/**
	 * Toasts pinned to the bottom of the viewport. The region is a manual popover so it also shows above
	 * open modal dialogs; polite messages and alerts use separate live regions.
	 */
	let region = $state<HTMLElement>();
	const info = $derived(toasts.items.filter(item => item.tone === 'info'));
	const errors = $derived(toasts.items.filter(item => item.tone === 'error'));

	// The live regions must exist before a message arrives to be announced, so the region stays open.
	$effect(() => {
		const node = region;
		if (node?.showPopover && !node.matches(':popover-open')) node.showPopover();
	});
</script>

{#snippet item(toast: (typeof toasts.items)[number])}
	<div class="toast" class:error={toast.tone === 'error'} data-toast>
		<p>{toast.message}</p>
		<button type="button" class="dismiss" aria-label="Dismiss message" onclick={() => toasts.dismiss(toast.key)}>
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>
		</button>
	</div>
{/snippet}

<div bind:this={region} class="toaster" popover="manual" data-toaster>
	<div class="stack" aria-live="polite" aria-atomic="false">{#each info as toast (toast.key)}{@render item(toast)}{/each}</div>
	<div class="stack" aria-live="assertive">{#each errors as toast (toast.key)}{@render item(toast)}{/each}</div>
</div>

<style>
	.toaster {
		position: fixed;
		inset: auto 0 max(var(--space-4), env(safe-area-inset-bottom));
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		width: 100%;
		max-width: none;
		height: auto;
		margin: 0;
		padding: 0 var(--space-4);
		border: 0;
		background: transparent;
		overflow: visible;
		pointer-events: none;
	}
	.stack { display: grid; justify-items: center; gap: var(--space-2); }
	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: fit-content;
		max-width: min(32rem, 100%);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		background: var(--surface-raised);
		box-shadow: 0 .75rem 2rem oklch(8% .01 255 / .5);
		pointer-events: auto;
		animation: toast-in 200ms var(--ease-out) both;
	}
	.toast.error { border-color: color-mix(in oklch, var(--error) 60%, var(--border)); }
	.toast.error p { color: var(--error); }
	.toast p { margin: 0; font-size: var(--text-sm); overflow-wrap: anywhere; user-select: text; }
	.dismiss { display: grid; place-items: center; flex: none; width: 2.25rem; min-height: 2.25rem; padding: 0; border: 0; background: transparent; color: var(--muted); }
	.dismiss:hover { color: var(--text); }
	@keyframes toast-in {
		from { opacity: 0; transform: translateY(.75rem); }
		to { opacity: 1; transform: none; }
	}
	@media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
</style>
