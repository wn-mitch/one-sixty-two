<script lang="ts">
	import type { DailyStandingsView } from '../game/standings.ts';

	/**
	 * Where this device's daily run stands: its percentile among the day's runs and the day's records
	 * drawn as a curve of five-win bins, with the run's own bin marked. `compact` drops the curve.
	 */
	let { standings, compact = false }: { standings: DailyStandingsView; compact?: boolean } = $props();
	const BIN = 5;
	const count = (value: number) => value.toLocaleString('en-US');
	const summary = $derived.by(() => {
		const { standing, final } = standings;
		if (standing.total <= 1) return final ? 'The only daily run that day' : 'First daily run of the day so far';
		// "Top 80%" undersells a lower-half run's place, so below the median it reads as a rank.
		const place = standing.topPercent <= 50 ? `Top ${standing.topPercent}%` : `#${count(standing.rank)}`;
		return `${place} of ${count(standing.total)} daily runs${final ? '' : ' so far'}`;
	});
	const bins = $derived.by(() => {
		const totals = standings.distribution.map(([wins]) => wins).concat(standings.wins);
		const low = Math.floor(Math.min(...totals) / BIN) * BIN;
		const high = Math.floor(Math.max(...totals) / BIN) * BIN;
		const counts = new Map<number, number>();
		for (const [wins, runs] of standings.distribution) counts.set(Math.floor(wins / BIN) * BIN, (counts.get(Math.floor(wins / BIN) * BIN) ?? 0) + runs);
		const mine = Math.floor(standings.wins / BIN) * BIN;
		const list = [];
		for (let floor = low; floor <= high; floor += BIN) list.push({ floor, runs: Math.max(counts.get(floor) ?? 0, floor === mine ? 1 : 0), mine: floor === mine });
		return list;
	});
	const tallest = $derived(Math.max(...bins.map(bin => bin.runs)));
	const range = $derived(`${bins[0].floor}–${bins.at(-1)!.floor + BIN - 1} wins`);
</script>

<section class="standings" aria-label="Today’s daily standings">
	<p class="summary"><strong>{summary}</strong></p>
	{#if !compact && standings.total > 1}
		<figure class="curve">
			<div class="bars" role="img" aria-label={`Daily records from ${range}; your ${standings.wins} wins are marked`}>
				{#each bins as bin (bin.floor)}
					<span class="bar" class:mine={bin.mine} style={`--h:${bin.runs / tallest}`} title={`${bin.floor}–${bin.floor + BIN - 1} wins: ${count(bin.runs)} ${bin.runs === 1 ? 'run' : 'runs'}`}></span>
				{/each}
			</div>
			<figcaption><span>{bins[0].floor}</span><span class="you">You: {standings.wins}</span><span>{bins.at(-1)!.floor + BIN - 1}</span></figcaption>
		</figure>
	{/if}
</section>

<style>
	.standings { display: grid; gap: var(--space-3); min-width: 0; }
	.summary { margin: 0; font-size: var(--text-sm); }
	.summary strong { font-weight: 750; }
	.curve { margin: 0; display: grid; gap: var(--space-1); }
	.bars { display: flex; align-items: flex-end; gap: 2px; height: 3.5rem; }
	.bar { flex: 1 1 0; min-width: 2px; height: calc(max(var(--h), .06) * 100%); border-radius: 2px 2px 0 0; background: color-mix(in oklch, var(--muted) 45%, transparent); }
	.bar.mine { background: var(--accent); }
	figcaption { display: flex; justify-content: space-between; color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.you { color: var(--text); font-weight: 700; }
</style>
