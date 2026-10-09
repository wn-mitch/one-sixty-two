<script lang="ts">
	import Card from '../cards/Card.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import type { FeaturedResult, ResultsCard } from '../game/results-types.ts';

	let {
		featured,
		cardViews,
		onInspect
	}: {
		featured: readonly FeaturedResult[];
		cardViews: ReadonlyMap<string, CardViewModel>;
		onInspect: (seasonId: string, trigger: HTMLElement) => void;
	} = $props();

	function noCardDetails(): void {}

	function cardLabel(card: ResultsCard): string {
		return `${card.profile.displayName}, ${card.profile.year}, ${card.slot}`;
	}
</script>

<section class="awards" aria-labelledby="awards-heading">
	<div class="section-heading">
		<div>
			<p class="eyebrow">Every participant considered</p>
			<h3 id="awards-heading">Season awards</h3>
		</div>
		<p>MVP and LVP use the app’s estimated WAR, not a historical WAR system or a forecast of team wins.</p>
	</div>
	<div class="award-rail">
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
						{#if primaryMetric.key === 'mvp' || primaryMetric.key === 'lvp'}<span>App-estimated WAR</span>{/if}
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
</section>

<style>
	.awards { display: grid; gap: var(--space-4); min-width: 0; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-6); }
	.section-heading .eyebrow { margin: 0 0 var(--space-2); }
	.section-heading h3 { font-size: var(--text-xl); }
	.section-heading > p { max-width: 36rem; margin: 0; color: var(--muted); font-size: var(--text-sm); text-align: right; }
	.award-rail { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: var(--space-5); min-width: 0; padding: var(--space-2) var(--space-1) var(--space-5); }
	.award-entry { display: grid; align-content: start; gap: var(--space-3); min-width: 0; --award-tone: var(--accent); }
	.award-entry.red { --award-tone: var(--error); }
	.award-kicker { margin: 0; color: var(--award-tone); font-size: var(--text-xs); font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
	.award-card { width: 100%; min-height: 0; padding: 0; border: 0; background: transparent; border-radius: .55rem; text-align: inherit; }
	.award-card:hover, .award-card:focus-visible { background: transparent; transform: translateY(-.35rem); }
	.award-art { display: block; width: 100%; filter: drop-shadow(0 .9rem 1.15rem oklch(8% .01 255 / .36)); }
	.award-copy { display: grid; gap: .1rem; }
	.award-copy strong { overflow-wrap: anywhere; font-size: var(--text-lg); line-height: 1.15; }
	.award-copy span { color: var(--muted); font-size: var(--text-xs); }
	.primary-metric { display: grid; gap: .1rem; padding-top: var(--space-2); border-top: 1px solid var(--border); }
	.primary-metric strong { color: var(--award-tone); font-size: var(--text-2xl); line-height: 1; letter-spacing: -.03em; }
	.primary-metric span { color: var(--muted); font-size: var(--text-xs); }
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
	@media (max-width: 64rem) {
		.award-rail { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(13rem, 16rem); justify-content: start; overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: inline mandatory; }
		.award-entry { scroll-snap-align: start; }
	}
	@media (max-width: 40rem) {
		.section-heading { display: block; }
		.section-heading > p { margin-top: var(--space-2); text-align: left; }
		.award-rail { grid-auto-columns: minmax(13rem, calc(100% - 3rem)); margin-inline: calc(var(--space-4) * -1); padding-inline: var(--space-4); scroll-padding-inline: var(--space-4); }
	}
</style>
