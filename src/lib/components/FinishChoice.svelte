<script lang="ts">
	import type { CardEra } from '../cards/era.ts';
	import type { CardAppearance, CustomTier } from '../cosmetics/catalogue.ts';
	import FinishSample from './FinishSample.svelte';
	import TokenAmount from './TokenAmount.svelte';

	let { name, tier, era, appearance, selected = false, cost = 1, status = null, description,
		equippedLabel, finishId, compact = false, showCost = true, disabled = false, onChoose }: {
		name: string;
		tier: CustomTier;
		era: CardEra;
		appearance: CardAppearance | null;
		selected?: boolean;
		cost?: number;
		status?: string | null;
		description?: string;
		equippedLabel?: string;
		finishId?: string;
		compact?: boolean;
		/** False leaves an unpriced, unowned tile without a caption price; its accessible name keeps the cost. */
		showCost?: boolean;
		disabled?: boolean;
		onChoose: (trigger: HTMLButtonElement) => void;
	} = $props();
	const uid = $props.id();
	const describedBy = $derived([description ? `${uid}-description` : '', equippedLabel ? `${uid}-equipped` : ''].filter(Boolean).join(' ') || undefined);
</script>

<button class="finish-choice" class:compact type="button" {disabled} data-finish-id={finishId}
	aria-pressed={selected} aria-label={`${name}, ${status ?? `${cost} ${cost === 1 ? 'token' : 'tokens'}`}`}
	aria-describedby={describedBy} onclick={event => onChoose(event.currentTarget)}>
	<span class="swatch" aria-hidden="true"><FinishSample {tier} {era} {appearance} /></span>
	{#if equippedLabel}
		<span class="equipped-tag" title={equippedLabel}>
			<svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 10 3 3 7-7" /></svg>
			<span class="sr-only" id="{uid}-equipped">{equippedLabel}</span>
		</span>
	{/if}
	<span class="product-caption">
		<span class="finish-name">{name}</span>
		{#if status || showCost}<span class="ownership" class:applied={status === 'Applied'} class:owned={status === 'Owned' && !showCost}>{#if status}{status}{:else}<TokenAmount amount={cost} />{/if}</span>{/if}
	</span>
	{#if description}<span id="{uid}-description" class="era-tag">{description}</span>{/if}
</button>

<style>
	.finish-choice { position: relative; display: grid; width: 100%; gap: var(--space-3); padding: var(--space-2); text-align: left; background: transparent; border-color: transparent; }
	.finish-choice:hover:not(:disabled) { background: var(--surface); }
	.finish-choice[aria-pressed='true'] { border-color: var(--accent); }
	.swatch { display: block; width: 100%; padding: var(--space-3); background: var(--surface); border-radius: var(--radius); }
	.product-caption { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
	.finish-name { font: 650 var(--text-sm)/1.3 system-ui, sans-serif; overflow-wrap: anywhere; }
	.ownership { flex-shrink: 0; color: var(--muted); font: 400 var(--text-sm)/1.4 system-ui, sans-serif; }
	.ownership.applied, .ownership.owned { color: var(--accent); font-weight: 650; }
	.era-tag { justify-self: start; padding: 2px var(--space-2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--muted); font: 500 var(--text-xs)/1.4 system-ui, sans-serif; }
	.equipped-tag { position: absolute; top: var(--space-3); right: var(--space-3); display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border: 1px solid var(--accent); border-radius: 50%; background: var(--background); color: var(--accent); }
	.equipped-tag svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
	.compact { gap: var(--space-1); padding: var(--space-1); }
	.compact .swatch { padding: var(--space-1); }
	.compact .product-caption { display: grid; gap: 2px; }
	.compact .finish-name, .compact .ownership { font-size: var(--text-xs); }
	@media (min-width: 64rem) { .finish-choice:not(.compact) .finish-name { font-size: var(--text-base); } }
</style>
