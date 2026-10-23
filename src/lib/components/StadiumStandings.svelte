<script lang="ts">
	import type { StadiumStandingsView } from '../game/stadium-standings.ts';
	import { MIN_RUNS, placeLabel } from '../game/win-distribution.ts';
	import WinChart from './WinChart.svelte';

	/** Where an own season stands among every counted run at its home park, with the park's records drawn as a curve. */
	let { standings, park }: { standings: StadiumStandingsView; park: string } = $props();
	const count = (value: number) => value.toLocaleString('en-US');
	const runs = (value: number) => `${count(value)} ${value === 1 ? 'run' : 'runs'}`;
	// A percentile of a handful of runs says little, so until then the line counts the runs instead.
	const summary = $derived(standings.standing.total < MIN_RUNS
		? `${runs(standings.standing.total)} at ${park} so far`
		: `${placeLabel(standings.standing)} of ${runs(standings.standing.total)} at ${park}`);
</script>

<section class="standings" aria-label={`Standings at ${park}`}>
	<p class="summary"><strong>{summary}</strong></p>
	{#if standings.standing.total > 1}<WinChart distribution={standings.distribution} wins={standings.wins} subject={`Runs at ${park}`} />{/if}
</section>

<style>
	.standings { display: grid; gap: var(--space-3); min-width: 0; }
	.summary { margin: 0; font-size: var(--text-sm); }
	.summary strong { font-weight: 750; }
</style>
