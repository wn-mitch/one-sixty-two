<script lang="ts">
	import { runCount, type WinDistribution } from '../game/win-distribution.ts';

	/**
	 * Season records drawn as five-win bins. `wins` marks a run's own bin, kept visible even when the
	 * distribution does not count it yet. `subject` names the runs ("daily runs", "runs at Truist Park") for
	 * the readout and screen readers. `spark` draws bare bars for a line of text that carries the numbers.
	 */
	let { distribution, wins = null, subject, spark = false }: { distribution: WinDistribution; wins?: number | null; subject: string; spark?: boolean } = $props();
	const BIN = 5;
	const count = (value: number) => value.toLocaleString('en-US');
	const plural = (value: number) => `${count(value)} ${value === 1 ? 'run' : 'runs'}`;
	const floorOf = (value: number) => Math.floor(value / BIN) * BIN;
	const bins = $derived.by(() => {
		const totals = distribution.map(([w]) => w).concat(wins === null ? [] : [wins]);
		if (!totals.length) return [];
		const low = floorOf(Math.min(...totals));
		const high = floorOf(Math.max(...totals));
		const counts = new Map<number, number>();
		for (const [w, runs] of distribution) counts.set(floorOf(w), (counts.get(floorOf(w)) ?? 0) + runs);
		const mine = wins === null ? null : floorOf(wins);
		const list = [];
		for (let floor = low; floor <= high; floor += BIN) list.push({ floor, runs: counts.get(floor) ?? 0, mine: floor === mine });
		return list;
	});
	const tallest = $derived(Math.max(1, ...bins.map(bin => bin.runs)));
	// About five axis labels at round win totals, whatever the spread.
	const step = $derived(bins.length <= 6 ? BIN : bins.length <= 12 ? 2 * BIN : 4 * BIN);
	const range = (floor: number) => `${floor}–${floor + BIN - 1} wins`;
	let hovered = $state<number | null>(null);
	/** Pointing anywhere in a bin's column, not just its bar, reads that bin out. */
	function point(event: PointerEvent): void {
		const column = (event.target as Element).closest<HTMLElement>('[data-floor]');
		hovered = column ? Number(column.dataset.floor) : null;
	}
	const focus = $derived(bins.find(bin => bin.floor === hovered) ?? null);
	const readout = $derived(focus
		? `${range(focus.floor)}: ${plural(focus.runs)}${focus.mine ? ', including yours' : ''}`
		: wins === null ? `${plural(runCount(distribution))}` : `You: ${wins} wins`);
	const label = $derived(bins.length
		? `${subject}: ${plural(runCount(distribution))} from ${bins[0].floor} to ${bins.at(-1)!.floor + BIN - 1} wins${wins === null ? '' : `; your ${wins} wins are marked`}`
		: `No ${subject} yet`);
</script>

{#if bins.length}
	{#if spark}
		<span class="spark" aria-hidden="true">
			{#each bins as bin (bin.floor)}<span class="bar" class:mine={bin.mine} class:empty={!bin.runs} style={`--h:${bin.runs / tallest}`}></span>{/each}
		</span>
	{:else}
		<figure class="chart">
			<div class="plot" role="img" aria-label={label} onpointermove={point} onpointerdown={point} onpointerleave={() => hovered = null}>
				{#each bins as bin (bin.floor)}
					<span class="column" data-floor={bin.floor} style={`--h:${bin.runs / tallest}`}>
						{#if bin.mine}<span class="you" aria-hidden="true">You</span>{/if}
						<span class="bar" class:mine={bin.mine} class:empty={!bin.runs} class:hovered={hovered === bin.floor}></span>
					</span>
				{/each}
			</div>
			<div class="axis" aria-hidden="true">
				{#each bins as bin (bin.floor)}<span>{bin.floor % step === 0 ? bin.floor : ''}</span>{/each}
			</div>
			<table class="sr-only">
				<caption>{subject} by wins</caption>
				<thead><tr><th scope="col">Wins</th><th scope="col">Runs</th></tr></thead>
				<tbody>{#each bins as bin (bin.floor)}<tr><th scope="row">{range(bin.floor)}{bin.mine ? ' (yours)' : ''}</th><td>{bin.runs}</td></tr>{/each}</tbody>
			</table>
			<figcaption><span class="readout" aria-live="polite">{readout}</span><span class="unit">wins</span></figcaption>
		</figure>
	{/if}
{/if}

<style>
	.chart { margin: 0; display: grid; gap: var(--space-1); min-width: 0; }
	.plot { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; align-items: end; gap: 2px; height: 5rem; padding-top: var(--space-4); border-bottom: 1px solid var(--border); touch-action: pan-y; }
	.column { position: relative; display: flex; justify-content: center; align-items: flex-end; height: 100%; }
	.bar { width: 100%; max-width: 24px; height: calc(max(var(--h), .04) * 100%); border-radius: 4px 4px 0 0; background: color-mix(in oklch, var(--muted) 45%, transparent); transition: background 120ms; }
	.bar.empty:not(.mine) { height: 0; }
	.bar.hovered { background: color-mix(in oklch, var(--muted) 75%, transparent); }
	.bar.mine { background: var(--accent); }
	.you { position: absolute; bottom: calc(max(var(--h), .04) * 100% + 3px); color: var(--text); font-size: var(--text-xs); font-weight: 750; line-height: 1; white-space: nowrap; }
	.axis { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: 2px; color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	/* Each label sits centred under the bin it starts; the edge bins' labels hold inside the plot. */
	.axis span { display: flex; justify-content: center; white-space: nowrap; }
	.axis span:first-child { justify-content: flex-start; }
	.axis span:last-child { justify-content: flex-end; }
	figcaption { display: flex; justify-content: space-between; gap: var(--space-2); color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.readout { color: var(--text); font-weight: 650; }
	.spark { display: inline-flex; align-items: flex-end; gap: 1px; width: 3.5rem; height: 1rem; vertical-align: -2px; }
	.spark .bar { flex: 1 1 0; min-width: 1px; border-radius: 1px 1px 0 0; }
</style>
