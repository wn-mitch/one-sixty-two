<script lang="ts">
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import { CARD_ERAS, type CardEra } from '../../cards/era.ts';
	import type { CustomTier } from '../../cosmetics/catalogue.ts';
	import type { ShopSnapshot } from '../../cosmetics/ledger.ts';
	import { appearanceOf, choiceName, eraChoice, tierLabel, wornChoice } from '../../cosmetics/factory.ts';
	import FinishSample from '../FinishSample.svelte';

	/** The factory's entry view: one real card per era, each wearing its current finish for the tier. Each links to that era's editor. */
	let { tier, snapshot, cards }: {
		tier: CustomTier;
		snapshot: ShopSnapshot | null;
		/** Sample cards of this tier by era; an era without one shows a bare finish sample. */
		cards: ReadonlyMap<CardEra, CardViewModel>;
	} = $props();
	const noDetails = () => {};
</script>

<ul class="rack" aria-label={`${tierLabel(tier)} cards by era`}>
	{#each CARD_ERAS as era (era)}
		{@const worn = wornChoice(snapshot, tier, era)}
		{@const own = !!eraChoice(snapshot, tier, era)}
		{@const card = cards.get(era)}
		<li>
			<a class="slot" href={`/factory?era=${era}`} data-era={era}
				aria-label={`${era}, ${own ? choiceName(worn) : 'Deck default'}`}>
				<span class="art" aria-hidden="true">
					{#if card}
						<Card s={card} appearance={appearanceOf(tier, worn)} onDetails={noDetails} />
					{:else}
						<FinishSample {tier} {era} appearance={appearanceOf(tier, worn)} />
					{/if}
				</span>
				<span class="caption">
					<span class="era">{era}</span>
					<span class="finish" class:own>{choiceName(worn)}</span>
					{#if !own}<span class="source">Deck default</span>{/if}
				</span>
			</a>
		</li>
	{/each}
</ul>

<style>
	.rack { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4) var(--space-3); margin: 0; padding: 0; list-style: none; }
	.slot { display: grid; gap: var(--space-2); height: 100%; padding: var(--space-2); border: 1px solid transparent; border-radius: var(--radius-lg); color: inherit; text-decoration: none; }
	.slot:hover { background: var(--surface); }
	.slot:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
	.art { display: block; pointer-events: none; }
	.caption { display: grid; gap: 2px; min-width: 0; }
	.era { font-size: var(--text-base); font-weight: 750; }
	.finish { color: var(--text); font: 600 var(--text-sm)/1.3 system-ui, sans-serif; overflow-wrap: anywhere; }
	.finish.own { color: var(--accent); }
	.source { color: var(--muted); font: 400 var(--text-xs)/1.3 system-ui, sans-serif; }
	@media (min-width: 40rem) { .rack { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
