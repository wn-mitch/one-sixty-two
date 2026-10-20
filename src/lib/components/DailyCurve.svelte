<script lang="ts">
	/**
	 * A day's records drawn as five-win bins. `wins` marks a run's own bin, kept visible even when the
	 * distribution does not count it yet; without it the curve is plain.
	 */
	let { distribution, wins = null }: { distribution: [number, number][]; wins?: number | null } = $props();
	const BIN = 5;
	const count = (value: number) => value.toLocaleString('en-US');
	const floorOf = (value: number) => Math.floor(value / BIN) * BIN;
	const bins = $derived.by(() => {
		const totals = distribution.map(([w]) => w).concat(wins === null ? [] : [wins]);
		const low = floorOf(Math.min(...totals));
		const high = floorOf(Math.max(...totals));
		const counts = new Map<number, number>();
		for (const [w, runs] of distribution) counts.set(floorOf(w), (counts.get(floorOf(w)) ?? 0) + runs);
		const mine = wins === null ? null : floorOf(wins);
		const list = [];
		for (let floor = low; floor <= high; floor += BIN) list.push({ floor, runs: Math.max(counts.get(floor) ?? 0, floor === mine ? 1 : 0), mine: floor === mine });
		return list;
	});
	const tallest = $derived(Math.max(...bins.map(bin => bin.runs)));
	const top = $derived(bins.at(-1)!.floor + BIN - 1);
	const label = $derived(`Daily records from ${bins[0].floor}–${top} wins${wins === null ? '' : `; your ${wins} wins are marked`}`);
</script>

<figure class="curve">
	<div class="bars" role="img" aria-label={label}>
		{#each bins as bin (bin.floor)}
			<span class="bar" class:mine={bin.mine} style={`--h:${bin.runs / tallest}`} title={`${bin.floor}–${bin.floor + BIN - 1} wins: ${count(bin.runs)} ${bin.runs === 1 ? 'run' : 'runs'}`}></span>
		{/each}
	</div>
	<figcaption><span>{bins[0].floor}</span>{#if wins !== null}<span class="you">You: {wins}</span>{:else}<span>wins</span>{/if}<span>{top}</span></figcaption>
</figure>

<style>
	.curve { margin: 0; display: grid; gap: var(--space-1); }
	.bars { display: flex; align-items: flex-end; gap: 2px; height: 3.5rem; }
	.bar { flex: 1 1 0; min-width: 2px; height: calc(max(var(--h), .06) * 100%); border-radius: 2px 2px 0 0; background: color-mix(in oklch, var(--muted) 45%, transparent); }
	.bar.mine { background: var(--accent); }
	figcaption { display: flex; justify-content: space-between; color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.you { color: var(--text); font-weight: 700; }
</style>
