<script lang="ts">
	import Card from '../cards/Card.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import type { FeaturedResult, ResultsCard } from '../game/results-types.ts';
	import InfoTooltip from './InfoTooltip.svelte';

	let {
		featured,
		cardViews,
		selectedSeasonId,
		reviewId,
		onInspect
	}: {
		featured: readonly FeaturedResult[];
		cardViews: ReadonlyMap<string, CardViewModel>;
		selectedSeasonId: string | null;
		reviewId: string;
		onInspect: (seasonId: string, trigger: HTMLButtonElement) => void;
	} = $props();

	function noCardDetails(): void {}

	// Where the swipeable rail rests, for the dots under it on narrow screens.
	let rail = $state<HTMLDivElement>();
	let current = $state(0);
	const shown = $derived(featured.filter(entry => cardViews.has(entry.card.seasonId) && entry.metrics[0]));
	function entries(): HTMLElement[] {
		return rail ? [...rail.querySelectorAll<HTMLElement>(':scope > .award-entry')] : [];
	}
	function trackRail(): void {
		if (!rail) return;
		const start = rail.getBoundingClientRect().left + parseFloat(getComputedStyle(rail).scrollPaddingInlineStart || '0');
		const offsets = entries().map(entry => Math.abs(entry.getBoundingClientRect().left - start));
		current = offsets.indexOf(Math.min(...offsets));
	}
	function showEntry(index: number): void {
		entries()[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
	}

	function cardLabel(card: ResultsCard): string {
		return `${card.profile.displayName}, ${card.profile.year}, ${card.slot}`;
	}
</script>

<section class="awards" aria-labelledby="awards-heading">
	<div class="section-heading">
		<h3 id="awards-heading">Season awards</h3>
		<InfoTooltip label="season awards" text="Awards and totals measure your simulated season. Card fronts show each player’s historical season, so the numbers can differ." />
	</div>
	<div class="award-rail" bind:this={rail} onscroll={trackRail}>
		{#each featured as entry (entry.card.seasonId)}
			{@const view = cardViews.get(entry.card.seasonId)}
			{@const primaryMetric = entry.metrics[0]}
			{@const extraAwards = entry.card.awards.filter((award) => !entry.metrics.some((metric) => metric.key === award.key))}
			{#if view && primaryMetric}
				<article class:red={primaryMetric.tone === 'red'} class="award-entry">
					<p class="award-kicker">{primaryMetric.label}</p>
					<button
						type="button"
						class="award-card"
						aria-label={`Inspect ${cardLabel(entry.card)} award card`}
						aria-expanded={selectedSeasonId === entry.card.seasonId}
						aria-controls={reviewId}
						onclick={(event) => onInspect(entry.card.seasonId, event.currentTarget)}
					>
						<span class="award-art" aria-hidden="true">
							<Card s={view} face="front" interactive idle onDetails={noCardDetails} />
						</span>
					</button>
					<div class="award-copy">
						<strong>{entry.card.profile.displayName}</strong>
						<span>{entry.card.profile.year} · {entry.card.slot}</span>
					</div>
					<div class="primary-metric" class:red={primaryMetric.tone === 'red'}>
						<strong>{primaryMetric.formattedValue}</strong>
					</div>
					{#if entry.metrics.length > 1}
						<ul class="additional-metrics" aria-label={`Additional featured awards for ${entry.card.profile.displayName}`}>
							{#each entry.metrics.slice(1) as metric (metric.key)}
								<li class:red={metric.tone === 'red'}>
									<span>{metric.label}</span>
									<strong>{metric.formattedValue}</strong>
								</li>
							{/each}
						</ul>
					{/if}
					{#if extraAwards.length}
						<ul class="award-chips" aria-label={`Other award honors for ${entry.card.profile.displayName}`}>
							{#each extraAwards as award (award.key)}
								<li class:red={award.tone === 'red'}>{award.label}</li>
							{/each}
						</ul>
					{/if}
				</article>
			{/if}
		{/each}
	</div>
	{#if shown.length > 1}
		<div class="rail-dots" role="group" aria-label="Season awards">
			{#each shown as entry, index (entry.card.seasonId)}
				<button type="button" class="dot" aria-label={`Show ${entry.metrics[0]!.label}: ${entry.card.profile.displayName}`} aria-current={index === current ? 'true' : undefined} onclick={() => showEntry(index)}></button>
			{/each}
		</div>
	{/if}
</section>

<style>
	.awards { display: grid; gap: var(--space-3); min-width: 0; }
	.section-heading { display: flex; align-items: center; gap: var(--space-2); }
	.section-heading h3 { font-size: var(--text-xl); }
	.award-rail { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: var(--space-4); min-width: 0; padding: var(--space-1) var(--space-1) var(--space-2); }
	.award-entry { display: grid; align-content: start; gap: var(--space-2); min-width: 0; --award-tone: var(--accent); }
	.award-entry.red { --award-tone: var(--error); }
	.award-kicker { margin: 0; color: var(--award-tone); font-size: var(--text-xs); font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
	.award-card { width: 100%; min-height: 0; padding: 0; border: 0; background: transparent; border-radius: .55rem; text-align: inherit; }
	.award-card:hover, .award-card:focus-visible { background: transparent; transform: translateY(-.35rem); }
	/* A static shadow under the card, not a filter over it, which would re-rasterize the drifting card every frame. */
	.award-art { position: relative; display: block; width: 100%; isolation: isolate; }
	.award-art::before { content: ''; position: absolute; inset: 2% 3% 0; z-index: -1; border-radius: .5rem; box-shadow: 0 .9rem 1.6rem oklch(8% .01 255 / .4); pointer-events: none; }
	.award-copy { display: grid; gap: .1rem; }
	.award-copy strong { overflow-wrap: anywhere; font-size: var(--text-lg); line-height: 1.15; }
	.award-copy span { color: var(--muted); font-size: var(--text-xs); }
	.primary-metric { display: grid; gap: .1rem; padding-top: var(--space-2); border-top: 1px solid var(--border); }
	.primary-metric strong { color: var(--award-tone); font-size: var(--text-2xl); line-height: 1; letter-spacing: -.03em; }
	.primary-metric.red strong { color: var(--error); }
	.additional-metrics, .award-chips { margin: 0; padding: 0; list-style: none; }
	.additional-metrics { display: grid; gap: var(--space-2); }
	.additional-metrics li { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-top: var(--space-2); border-top: 1px solid var(--border); font-size: var(--text-xs); }
	.additional-metrics li span { color: var(--muted); }
	.additional-metrics li strong { white-space: nowrap; }
	.additional-metrics li.red span, .additional-metrics li.red strong { color: var(--error); }
	.award-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
	.award-chips li { padding: .2rem .5rem; border: 1px solid color-mix(in oklch, var(--accent) 60%, var(--border)); border-radius: 999px; color: var(--accent); font-size: .6875rem; font-weight: 750; }
	.award-chips li.red { border-color: color-mix(in oklch, var(--error) 60%, var(--border)); color: var(--error); }
	/* Beside the share panel: a 2×2 grid, each card to the left of its kicker, name and metrics. */
	@media (min-width: 64.001rem) {
		.award-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6) var(--space-5); }
		.award-entry { grid-template-columns: minmax(0, 10rem) minmax(0, 1fr); grid-auto-rows: min-content; column-gap: var(--space-4); }
		.award-entry > .award-card { grid-column: 1; grid-row: 1 / span 6; align-self: start; }
		.award-entry > :not(.award-card) { grid-column: 2; }
		.award-copy strong { font-size: var(--text-base); }
		.primary-metric strong { font-size: var(--text-xl); white-space: nowrap; }
	}
	/* The rail swipes sideways only on narrower screens; there its dots show how many awards there are and which is in view. */
	.rail-dots { display: none; }
	@media (max-width: 64rem) {
		.rail-dots { display: flex; justify-content: center; gap: 0; margin-top: calc(var(--space-2) * -1); }
		.dot { position: relative; width: 1.75rem; min-width: 0; height: 1.75rem; min-height: 0; padding: 0; border: 0; background: transparent; }
		.dot::after { content: ''; position: absolute; inset: 50% auto auto 50%; width: .5rem; height: .5rem; translate: -50% -50%; border-radius: 50%; background: var(--border); transition: background 160ms ease-out, width 160ms ease-out; }
		.dot[aria-current='true']::after { width: 1.1rem; border-radius: 999px; background: var(--text); }
		.award-rail { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(13rem, 16rem); justify-content: start; overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: inline mandatory; }
		.award-entry { scroll-snap-align: start; }
	}
	@media (max-width: 40rem) {
		.award-rail { grid-auto-columns: minmax(13rem, calc(100% - 3rem)); margin-inline: calc(var(--space-4) * -1); padding-inline: var(--space-4); scroll-padding-inline: var(--space-4); }
	}
</style>
