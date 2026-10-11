<script lang="ts">
	import type { SeasonMoment, WinPoint } from '../sim/types.ts';
	import { momentIndex, tracePositions } from './win-trace.ts';

	/** Your club's win chance through one game, with the moment's play drawn in its tone and pinned. */
	let { trace, moment, tone, summary }: { trace: readonly WinPoint[]; moment: SeasonMoment; tone: 'highlight' | 'lowlight'; summary: string } = $props();

	const uid = $props.id();
	let halves = $derived(Math.max(18, Math.ceil((trace.at(-1)!.half + 1) / 2) * 2));
	let innings = $derived(Array.from({ length: halves / 2 }, (_, index) => index + 1));
	let ticks = $derived(innings.filter(inning => inning % 3 === 0 || inning === innings.length));
	let xs = $derived(tracePositions(trace));
	let points = $derived(trace.map((point, index) => `${xs[index]},${(1 - point.win) * 100}`).join(' '));
	let area = $derived(`0,50 ${points} ${xs.at(-1)},50`);
	let pin = $derived.by(() => {
		const index = momentIndex(trace, moment);
		if (index < 1) return null;
		return { x0: xs[index - 1], y0: (1 - trace[index - 1].win) * 100, x: xs[index], y: (1 - trace[index].win) * 100 };
	});
	const percent = (win: number) => `${Math.round(win * 100)}%`;
	let label = $derived(`Win chance through game ${moment.gameNumber}: opened at ${percent(trace[0].win)}, ${trace.at(-1)!.win === 1 ? 'won' : 'lost'}. The play moved it ${summary}.`);
</script>

<figure class={`win-chart ${tone}`}>
	<div class="plot">
		<svg viewBox={`0 0 ${halves} 100`} preserveAspectRatio="none" role="img" aria-label={label}>
			<defs>
				<clipPath id={`${uid}-above`}><rect x="0" y="0" width={halves} height="50" /></clipPath>
				<clipPath id={`${uid}-below`}><rect x="0" y="50" width={halves} height="50" /></clipPath>
			</defs>
			{#each innings as inning (inning)}
				<line class="inning" x1={inning * 2} x2={inning * 2} y1="0" y2="100" vector-effect="non-scaling-stroke" />
			{/each}
			<line class="even" x1="0" x2={halves} y1="50" y2="50" vector-effect="non-scaling-stroke" />
			<polygon class="fill ahead" points={area} clip-path={`url(#${uid}-above)`} />
			<polygon class="fill behind" points={area} clip-path={`url(#${uid}-below)`} />
			<polyline class="trace" points={points} vector-effect="non-scaling-stroke" />
			{#if pin}<line class="play" x1={pin.x0} y1={pin.y0} x2={pin.x} y2={pin.y} vector-effect="non-scaling-stroke" />{/if}
		</svg>
		{#if pin}<span class="pin" aria-hidden="true" style:left={`${pin.x / halves * 100}%`} style:top={`${pin.y}%`}></span>{/if}
		<span class="scale top" aria-hidden="true">100%</span>
		<span class="scale mid" aria-hidden="true">50%</span>
	</div>
	<div class="ticks" aria-hidden="true">
		{#each ticks as inning (inning)}<span style:left={`${(inning * 2 - 1) / halves * 100}%`}>{inning}</span>{/each}
	</div>
	<figcaption>{summary}</figcaption>
</figure>

<style>
	.win-chart { --tone: var(--success); display: grid; gap: var(--space-1); margin: 0; padding-top: var(--space-3); border-top: 1px solid var(--border); }
	.win-chart.lowlight { --tone: var(--error); }
	.plot { position: relative; height: 5.5rem; border-radius: 4px; background: var(--background); }
	svg { display: block; width: 100%; height: 100%; overflow: visible; }
	.inning { stroke: var(--surface); stroke-width: 1; }
	.even { stroke: var(--border); stroke-width: 1; stroke-dasharray: 3 3; }
	.fill.ahead { fill: color-mix(in oklch, var(--accent) 26%, transparent); }
	.fill.behind { fill: color-mix(in oklch, var(--focus) 26%, transparent); }
	.trace { fill: none; stroke: var(--muted); stroke-width: 1.5; stroke-linejoin: round; }
	.play { stroke: var(--tone); stroke-width: 3; stroke-linecap: round; }
	.pin { position: absolute; width: .75rem; height: .75rem; border: 2px solid var(--tone); border-radius: 50%; background: var(--background); transform: translate(-50%, -50%); }
	.scale { position: absolute; left: var(--space-1); color: var(--muted); font-size: .625rem; line-height: 1; font-variant-numeric: tabular-nums; pointer-events: none; }
	.scale.top { top: 2px; }
	.scale.mid { top: 50%; transform: translateY(-120%); }
	.ticks { position: relative; height: .875rem; color: var(--muted); font-size: .625rem; font-variant-numeric: tabular-nums; }
	.ticks span { position: absolute; transform: translateX(-50%); }
	figcaption { color: var(--tone); font-size: var(--text-sm); font-weight: 750; font-variant-numeric: tabular-nums; }
</style>
