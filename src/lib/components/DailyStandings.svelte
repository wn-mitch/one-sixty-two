<script lang="ts">
	import type { DailyStandingsView } from '../game/standings.ts';
	import DailyCurve from './DailyCurve.svelte';

	/**
	 * Where this device's daily run stands: its percentile among the day's runs and the day's records
	 * drawn as a curve with the run's own bin marked. `compact` drops the curve.
	 */
	let { standings, compact = false }: { standings: DailyStandingsView; compact?: boolean } = $props();
	const count = (value: number) => value.toLocaleString('en-US');
	const summary = $derived.by(() => {
		const { standing, final } = standings;
		if (standing.total <= 1) return final ? 'The only daily run that day' : 'First daily run of the day so far';
		// "Top 80%" undersells a lower-half run's place, so below the median it reads as a rank.
		const place = standing.topPercent <= 50 ? `Top ${standing.topPercent}%` : `#${count(standing.rank)}`;
		return `${place} of ${count(standing.total)} daily runs${final ? '' : ' so far'}`;
	});
</script>

<section class="standings" aria-label="Today’s daily standings">
	<p class="summary"><strong>{summary}</strong></p>
	{#if !compact && standings.total > 1}<DailyCurve distribution={standings.distribution} wins={standings.wins} />{/if}
</section>

<style>
	.standings { display: grid; gap: var(--space-3); min-width: 0; }
	.summary { margin: 0; font-size: var(--text-sm); }
	.summary strong { font-weight: 750; }
</style>
