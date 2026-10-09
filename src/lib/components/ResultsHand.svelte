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
		<p>Every roster member not featured above is still here.</p>
	</div>
	<div class="hand-scroll" role="region" aria-label="Rest of roster cards">
		<div class="hand">
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
							<Card s={view} face="front" compact thumbnail interactive={false} onDetails={noCardDetails} />
						</span>
					</button>
				{/if}
			{/each}
		</div>
	</div>
	<p class="source-note">
		Card inspection retains the historical statistics, defensive evidence, media credits, and source notes for each selected season.
		{#if rankingLoading} Historical WAR rankings are still loading.
		{:else if rankingError} Historical WAR rankings are unavailable; simulated results remain complete.
		{:else if mediaUnavailable} Some card media is unavailable; standard placeholders are shown.
		{/if}
	</p>
</section>

<style>
	.rest-hand { display: grid; gap: var(--space-4); min-width: 0; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-6); }
	.section-heading .eyebrow { margin: 0 0 var(--space-2); }
	.section-heading h3 { font-size: var(--text-xl); }
	.section-heading > p { max-width: 36rem; margin: 0; color: var(--muted); font-size: var(--text-sm); text-align: right; }
	.hand-scroll { min-width: 0; overflow-x: auto; overscroll-behavior-inline: contain; padding: var(--space-4) var(--space-1) var(--space-5); }
	.hand { display: flex; align-items: end; width: max-content; min-width: 100%; }
	.hand-card { position: relative; flex: 0 0 clamp(4.5rem, 9vw, 7rem); width: clamp(4.5rem, 9vw, 7rem); min-height: 0; padding: 0; border: 0; background: transparent; border-radius: .35rem; filter: drop-shadow(0 .55rem .7rem oklch(8% .01 255 / .38)); transition: transform 180ms var(--ease-out), filter 180ms var(--ease-out); }
	.hand-card + .hand-card { margin-inline-start: clamp(-4rem, -5vw, -2.25rem); }
	.hand-card:hover, .hand-card:focus-visible { z-index: 20; background: transparent; transform: translateY(-.7rem); filter: drop-shadow(0 1rem 1rem oklch(8% .01 255 / .48)); }
	.hand-card > span { display: block; }
	.source-note { max-width: 74ch; margin: 0; color: var(--muted); font-size: var(--text-xs); }
	@media (max-width: 40rem) {
		.section-heading { display: block; }
		.section-heading > p { margin-top: var(--space-2); text-align: left; }
		.hand-card { flex-basis: 72px; width: 72px; }
		.hand-card + .hand-card { margin-inline-start: -48px; }
	}
</style>
