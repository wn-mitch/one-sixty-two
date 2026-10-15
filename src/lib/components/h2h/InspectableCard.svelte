<script lang="ts">
	import { tick } from 'svelte';
	import Card from '../../cards/Card.svelte';
	import CardReview from '../../cards/CardReview.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';

	let { s, compact = false, caption = '', meta = '', actionLabel }: {
		s: CardViewModel;
		compact?: boolean;
		caption?: string;
		meta?: string;
		actionLabel?: string;
	} = $props();
	const uid = $props.id();

	let trigger = $state<HTMLButtonElement>();
	let source = $state<HTMLElement | null>(null);
	let active = $state(false);
	let opened = $state(false);
	let turned = $state(false);
	let textBack = $state(false);

	async function inspect(): Promise<void> {
		opened = false;
		turned = false;
		textBack = false;
		source = trigger?.querySelector<HTMLElement>('.card') ?? null;
		active = true;
		await tick();
		opened = true;
	}

	function close(): void {
		active = false;
		opened = false;
		turned = false;
		textBack = false;
		source = null;
		void tick().then(() => trigger?.focus({ preventScroll: true }));
	}
	const label = $derived(actionLabel ?? `Inspect ${s.full}, ${s.year}`);
	const noDetails = () => {};
</script>

<button bind:this={trigger} type="button" class="card-trigger" class:compact aria-label={label} aria-expanded={active} onclick={() => void inspect()}>
	<span class="art" aria-hidden="true" inert>
		<Card {s} face="front" {compact} thumbnail={compact} interactive={!compact} idle={!compact} onDetails={noDetails} />
	</span>
	{#if caption || meta}
		<span class="caption">
			{#if caption}<strong>{caption}</strong>{/if}
			{#if meta}<span>{meta}</span>{/if}
		</span>
	{/if}
</button>

{#if active}
	<CardReview id={`h2h-${uid}-review`} {s} bind:opened bind:turned bind:textBack showControl={false} sourceElement={source} raisedOnly onClose={close} />
{/if}

<style>
	.card-trigger { display: grid; gap: var(--space-1); width: 100%; min-width: 0; min-height: 44px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; }
	.card-trigger:hover:not(:disabled) { background: transparent; }
	.card-trigger:active:not(:disabled) { transform: none; }
	.card-trigger:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.art { display: block; width: 100%; min-width: 0; }
	.compact .art :global(.card) { min-width: 0; }
	.caption { display: grid; gap: 1px; min-width: 0; line-height: 1.15; }
	.caption strong { font-size: var(--text-xs); overflow-wrap: anywhere; }
	.caption span { color: var(--muted); font-size: var(--text-xs); }
</style>
