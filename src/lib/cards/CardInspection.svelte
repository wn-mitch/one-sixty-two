<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import CardFlip from './CardFlip.svelte';
	import CardDetails from './CardDetails.svelte';
	import type { CardViewModel } from './view-model.ts';

	let { s, returnFocus = null, onClose }: { s: CardViewModel; returnFocus?: HTMLElement | null; onClose?: () => void } = $props();
	const uid = $props.id();
	const titleId = `${uid}-inspection-title`;
	let opened = $state(false);
	let dialog = $state<HTMLDialogElement>();
	let cardFlip = $state<CardFlip>();
	let trigger: HTMLElement | null = null;
	let focusFallback: HTMLElement | null = null;
	let session = $state(0);
	let cardDetails = $state<CardDetails>();
	let destroying = false;

	export async function open(nextTrigger: HTMLElement): Promise<void> {
		trigger = nextTrigger;
		focusFallback = returnFocus;
		opened = true;
		session += 1;
		if (!dialog?.open) dialog?.showModal();
		await tick();
		if (opened) cardFlip?.focusTurn();
	}

	function restoreFocus(): void {
		opened = false;
		const previousTrigger = trigger;
		const previousFallback = focusFallback;
		trigger = null;
		focusFallback = null;
		if (!previousTrigger && !previousFallback) return;
		queueMicrotask(() => {
			if (previousTrigger?.isConnected) previousTrigger.focus({ preventScroll: true });
			else if (previousFallback?.isConnected) previousFallback.focus();
		});
	}

	function close(): void {
		dialog?.close();
	}

	async function showDetails(): Promise<void> {
		await cardDetails?.showDetails();
	}

	function handleClose(): void {
		restoreFocus();
		if (!destroying) onClose?.();
	}

	onDestroy(() => {
		destroying = true;
		if (!opened) return;
		dialog?.close();
		restoreFocus();
	});
</script>

<dialog bind:this={dialog} class="card-inspection" aria-labelledby={titleId} onclose={handleClose}>
	<div class="dialog-shell">
		<header class="dialog-header">
			<div>
				<p class="eyebrow">Historical season card</p>
				<h2 id={titleId}>{s.full}</h2>
				<p>{s.year} · {s.team} · {s.pos}</p>
			</div>
			<button type="button" class="close" onclick={close}>Close card</button>
		</header>

		<div class="inspection-content">
			{#if opened}
				{#key session}
					<CardFlip bind:this={cardFlip} {s} onDetails={showDetails} />
				{/key}
			{/if}
			<CardDetails bind:this={cardDetails} {s} />
		</div>
	</div>
</dialog>

<style>
	.card-inspection {
		width: min(calc(100vw - 1.5rem), 46rem);
		max-width: none;
		max-height: min(92dvh, 64rem);
		padding: 0;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: .65rem;
		box-shadow: 0 1.5rem 4rem oklch(8% .01 255 / .52);
		overflow: hidden;
	}
	.card-inspection::backdrop { background: oklch(8% .01 255 / .7); }
	.dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: inherit; min-width: 0; }
	.dialog-header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1rem clamp(1rem, 3vw, 1.5rem); border-bottom: 1px solid var(--border); background: var(--surface-raised, var(--surface)); }
	.eyebrow { margin: 0 0 .2rem; color: var(--muted); font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	h2 { margin: 0; font-size: 1.25rem; line-height: 1.15; overflow-wrap: anywhere; }
	.dialog-header p:not(.eyebrow) { margin: .3rem 0 0; color: var(--muted); font-size: .9rem; overflow-wrap: anywhere; }
	.close { flex: 0 0 auto; min-height: 2.75rem; }
	.inspection-content { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 1rem clamp(.75rem, 3vw, 1.5rem) 1.5rem; }
	@media (max-width: 30rem) {
		.card-inspection { width: calc(100vw - .75rem); max-height: 96dvh; border-radius: .4rem; }
		.dialog-header { gap: .75rem; padding: .75rem; }
		.close { min-width: 2.75rem; padding-inline: .6rem; font-size: .8rem; }
		.inspection-content { padding: .75rem .375rem 1rem; }
	}
</style>
