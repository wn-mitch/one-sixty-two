<script lang="ts">
	import Card from '../cards/Card.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import type { ResultsCard } from '../game/results-types.ts';

	let {
		cards,
		cardViews,
		rankingLoading,
		rankingError,
		mediaUnavailable,
		selectedSeasonId,
		reviewId,
		onInspect
	}: {
		cards: readonly ResultsCard[];
		cardViews: ReadonlyMap<string, CardViewModel>;
		rankingLoading: boolean;
		rankingError: boolean;
		mediaUnavailable: boolean;
		selectedSeasonId: string | null;
		reviewId: string;
		onInspect: (seasonId: string, trigger: HTMLButtonElement) => void;
	} = $props();

	function noCardDetails(): void {}

	function cardLabel(card: ResultsCard): string {
		return `${card.profile.displayName}, ${card.profile.year}, ${card.slot}`;
	}
</script>

<section class="rest-hand" aria-labelledby="rest-hand-heading">
	<div class="section-heading">
		<div>
			<p class="eyebrow">The complete roster</p>
			<h3 id="rest-hand-heading">Rest of the hand</h3>
		</div>
	</div>
	<div class="hand-scroll" role="region" aria-label="Rest of roster cards">
		<div class="hand" style:--count={cards.filter(card => cardViews.has(card.seasonId)).length}>
			{#each cards as card (card.seasonId)}
				{@const view = cardViews.get(card.seasonId)}
				{#if view}
					<button
						type="button"
						class="hand-card"
						data-slot={card.slot}
						aria-label={`Inspect ${cardLabel(card)} card`}
						aria-expanded={selectedSeasonId === card.seasonId}
						aria-controls={reviewId}
						onclick={(event) => onInspect(card.seasonId, event.currentTarget)}
					>
						<span aria-hidden="true">
							<Card s={view} face="front" thumbnail interactive={false} onDetails={noCardDetails} />
						</span>
					</button>
				{/if}
			{/each}
		</div>
	</div>
	{#if rankingLoading || rankingError || mediaUnavailable}
		<p class="source-note" role="status">
			{#if rankingLoading}Historical WAR rankings are still loading.
			{:else if rankingError}Historical WAR rankings are unavailable; simulated results remain complete.
			{:else}Some card media is unavailable; standard placeholders are shown.
			{/if}
		</p>
	{/if}
</section>

<style>
	.rest-hand { display: grid; gap: var(--space-2); min-width: 0; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-6); }
	.section-heading .eyebrow { margin: 0 0 var(--space-2); }
	.section-heading h3 { font-size: var(--text-xl); }
	.hand-scroll { min-width: 0; container-type: inline-size; padding: var(--space-3) 0; }
	/*
	 * The hand always fits its row without scrolling: each full front takes an equal share (104px to
	 * 11rem), and when even 104px cards cannot fit side by side they overlap just enough to fit.
	 */
	.hand { --gap: var(--space-3); --w: clamp(104px, (100cqi - (var(--count) - 1) * var(--gap)) / var(--count), 11rem); display: flex; align-items: end; }
	.hand-card + .hand-card { margin-inline-start: min(var(--gap), (100cqi - var(--count) * var(--w)) / (var(--count) - 1)); }
	.hand-card { position: relative; flex: 0 0 var(--w); width: var(--w); min-height: 0; padding: 0; border: 0; background: transparent; border-radius: .35rem; filter: drop-shadow(0 .55rem .7rem oklch(8% .01 255 / .38)); transition: transform 180ms var(--ease-out), filter 180ms var(--ease-out); }
	.hand-card:hover, .hand-card:focus-visible { z-index: 20; background: transparent; transform: translateY(-.7rem); filter: drop-shadow(0 1rem 1rem oklch(8% .01 255 / .48)); }
	.hand-card > span { display: block; }
	.source-note { max-width: 74ch; margin: 0; color: var(--muted); font-size: var(--text-xs); }
	@media (max-width: 40rem) {
		.section-heading { display: block; }
		/* Phones lay the hand out as a swipeable row instead of crushing it into the screen width. */
		.hand-scroll { overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scroll-padding-inline: var(--space-4); margin-inline: calc(-1 * var(--space-4)); padding: var(--space-4); scrollbar-width: none; }
		.hand { --w: 7.5rem; width: max-content; gap: var(--space-3); }
		.hand-card { scroll-snap-align: start; }
		.hand-card + .hand-card { margin-inline-start: 0; }
	}
</style>
