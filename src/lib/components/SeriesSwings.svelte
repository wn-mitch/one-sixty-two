<script lang="ts">
	import type { SeriesMoment, SeriesResult, SeriesTeamId } from '../sim/series-types.ts';
	import { formatSeasonMoment } from './season-moment.ts';

	/** Team A's win chance through every game, one strip per game on a shared inning axis, pinned at the series' two biggest swings. */
	let { result }: { result: SeriesResult } = $props();

	const name = (id: SeriesTeamId) => result.teams.find(team => team.id === id)!.name;
	let labels = $derived({ challenge: name('team-a'), opponent: name('team-b') });
	let halves = $derived(Math.max(18, ...result.games.map(game => Math.ceil((game.winTrace.at(-1)!.half + 1) / 2) * 2)));
	let innings = $derived(Array.from({ length: halves / 2 }, (_, index) => index + 1));
	let ticks = $derived(innings.filter(inning => inning === innings.length || (inning % 2 === 1 && inning < innings.length - 1)));

	/** Plays share their half-inning evenly; the pre-game point sits at the left edge. */
	function positions(trace: readonly { half: number }[]): number[] {
		const counts = new Map<number, number>();
		for (const point of trace.slice(1)) counts.set(point.half, (counts.get(point.half) ?? 0) + 1);
		const seen = new Map<number, number>();
		return trace.map((point, index) => {
			if (index === 0) return 0;
			const order = (seen.get(point.half) ?? 0) + 1;
			seen.set(point.half, order);
			return point.half + order / counts.get(point.half)!;
		});
	}

	function pinIndex(trace: readonly { half: number; win: number }[], moment: SeriesMoment): number {
		const half = (moment.inning - 1) * 2 + (moment.half === 'bottom' ? 1 : 0);
		return trace.findIndex((point, index) => index > 0 && point.half === half && point.win === moment.winAfter && trace[index - 1].win === moment.winBefore);
	}

	let swings = $derived(([[result.highlight, 'team-a'], [result.lowlight, 'team-b']] as const).flatMap(([value, liftFor], index) => {
		if (!value) return [];
		const game = result.games.find(entry => entry.number === value.gameNumber);
		return [{ number: index + 1, value, liftFor, copy: formatSeasonMoment(value, game?.result, labels) }];
	}));

	let strips = $derived(result.games.map(game => {
		const xs = positions(game.winTrace);
		const points = game.winTrace.map((point, index) => `${xs[index]},${(1 - point.win) * 100}`);
		const end = xs.at(-1)!;
		const pins = swings.filter(swing => swing.value.gameNumber === game.number).flatMap(swing => {
			const index = pinIndex(game.winTrace, swing.value);
			return index < 0 ? [] : [{ ...swing, x: xs[index] / halves * 100, y: (1 - game.winTrace[index].win) * 100 }];
		});
		const a = game.homeTeamId === 'team-a' ? game.result.home.runs : game.result.away.runs;
		const b = game.homeTeamId === 'team-b' ? game.result.home.runs : game.result.away.runs;
		const first = Math.round(game.winTrace[0].win * 100);
		return {
			game, a, b, pins,
			line: points.join(' '),
			area: `0,50 ${points.join(' ')} ${end},50`,
			label: `Game ${game.number}: ${labels.challenge} opened at ${first}% and ${game.winnerId === 'team-a' ? 'won' : 'lost'} ${a}–${b}.`
		};
	}));

	let active = $state<number | null>(null);
	const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	function reveal(number: number): void {
		active = number;
		document.getElementById(`series-swing-${number}`)?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
	}
</script>

<section class="swings" aria-labelledby="series-swings-heading">
	<div class="section-heading">
		<h2 id="series-swings-heading">Series swings</h2>
		<p>Neutral league-rate win chance, from {labels.challenge}’s side</p>
	</div>

	<div class="layout">
		<figure class="chart">
			<figcaption class="legend">
				<span><i class="swatch a"></i>{labels.challenge} favoured</span>
				<span><i class="swatch b"></i>{labels.opponent} favoured</span>
			</figcaption>
			{#each strips as strip (strip.game.number)}
				<div class="row">
					<p class="game-label"><strong>G{strip.game.number}</strong><span class:won={strip.game.winnerId === 'team-a'}>{strip.a}–{strip.b}</span></p>
					<div class="strip">
						<svg viewBox={`0 0 ${halves} 100`} preserveAspectRatio="none" role="img" aria-label={strip.label}>
							<defs>
								<clipPath id={`swing-above-${strip.game.number}`}><rect x="0" y="0" width={halves} height="50" /></clipPath>
								<clipPath id={`swing-below-${strip.game.number}`}><rect x="0" y="50" width={halves} height="50" /></clipPath>
							</defs>
							{#each innings as inning (inning)}
								<line class="inning" x1={inning * 2} x2={inning * 2} y1="0" y2="100" vector-effect="non-scaling-stroke" />
							{/each}
							<line class="even" x1="0" x2={halves} y1="50" y2="50" vector-effect="non-scaling-stroke" />
							<polygon class="fill a" points={strip.area} clip-path={`url(#swing-above-${strip.game.number})`} />
							<polygon class="fill b" points={strip.area} clip-path={`url(#swing-below-${strip.game.number})`} />
							<polyline class="trace" points={strip.line} vector-effect="non-scaling-stroke" />
						</svg>
						{#each strip.pins as pin (pin.number)}
							<button
								type="button"
								class="pin"
								class:active={active === pin.number}
								class:drop={pin.liftFor === 'team-b'}
								style:left={`${pin.x}%`}
								style:top={`${pin.y}%`}
								aria-label={`Swing ${pin.number}: biggest lift for ${name(pin.liftFor)}`}
								aria-controls={`series-swing-${pin.number}`}
								onclick={() => reveal(pin.number)}
							>{pin.number}</button>
						{/each}
					</div>
				</div>
			{/each}
			<div class="row axis" aria-hidden="true">
				<span></span>
				<div class="ticks">
					{#each ticks as inning (inning)}<span style:left={`${(inning * 2 - 1) / halves * 100}%`}>{inning}</span>{/each}
				</div>
			</div>
		</figure>

		<div class="plays">
			{#each swings as { number, value, liftFor, copy } (number)}
				<article
					id={`series-swing-${number}`}
					class="swing"
					class:active={active === number}
					class:drop={liftFor === 'team-b'}
					onpointerenter={() => active = number}
					onpointerleave={() => { if (active === number) active = null; }}
				>
					<p class="swing-for"><span class="badge" aria-hidden="true">{number}</span>Biggest lift for {name(liftFor)}</p>
					<p class="swing-when">{copy.matchup} · {copy.situation}</p>
					<p class="swing-play">{copy.action}</p>
					<p class="swing-chance"><strong>{copy.winChance}</strong> <span>{copy.swing}</span></p>
					<p class="swing-score">{copy.score}{#if copy.final}{' '}{copy.final}.{/if}</p>
				</article>
			{/each}
		</div>
	</div>
</section>

<style>
	.swings { display: grid; gap: var(--space-5); min-width: 0; }
	p { margin: 0; }
	h2 { margin: 0; font-size: var(--text-xl); }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-1) var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border); }
	.section-heading > p { color: var(--muted); font-size: var(--text-xs); }
	.layout { display: grid; gap: var(--space-8); min-width: 0; }

	.chart { display: grid; gap: var(--space-2); margin: 0; min-width: 0; }
	.legend { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); margin-bottom: var(--space-2); color: var(--muted); font-size: var(--text-xs); }
	.legend span { display: inline-flex; align-items: center; gap: var(--space-2); }
	.swatch { width: .75rem; height: .75rem; border-radius: 2px; }
	.swatch.a { background: color-mix(in oklch, var(--accent) 55%, transparent); }
	.swatch.b { background: color-mix(in oklch, var(--focus) 55%, transparent); }
	.row { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr); gap: var(--space-3); align-items: center; }
	.game-label { display: grid; font-variant-numeric: tabular-nums; }
	.game-label strong { font-size: var(--text-base); font-weight: 850; }
	.game-label span { color: var(--muted); font-size: var(--text-xs); }
	.game-label span.won { color: var(--text); font-weight: 700; }
	.strip { position: relative; height: 3.5rem; border-radius: 4px; background: var(--surface); }
	svg { display: block; width: 100%; height: 100%; overflow: visible; }
	.inning { stroke: var(--background); stroke-width: 1; }
	.even { stroke: var(--border); stroke-width: 1; stroke-dasharray: 3 3; }
	.fill.a { fill: color-mix(in oklch, var(--accent) 28%, transparent); }
	.fill.b { fill: color-mix(in oklch, var(--focus) 28%, transparent); }
	.trace { fill: none; stroke: var(--text); stroke-width: 1.5; stroke-linejoin: round; }

	.pin {
		position: absolute;
		display: grid;
		place-items: center;
		width: 1.5rem;
		min-width: 0;
		height: 1.5rem;
		min-height: 0;
		padding: 0;
		border: 2px solid var(--success);
		border-radius: 50%;
		background: var(--background);
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 850;
		line-height: 1;
		transform: translate(-50%, -50%);
		transition: transform .18s cubic-bezier(.25, 1, .5, 1), background-color .18s;
		z-index: 1;
	}
	/* 44px hit area around the 24px marker. */
	.pin::before { content: ''; position: absolute; inset: -10px; }
	.pin.drop { border-color: var(--error); }
	.pin:hover, .pin.active { background: var(--text); color: var(--background); transform: translate(-50%, -50%) scale(1.2); }

	.axis { align-items: start; }
	.ticks { position: relative; height: 1rem; color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.ticks span { position: absolute; transform: translateX(-50%); }

	.plays { display: grid; gap: var(--space-5); align-content: start; min-width: 0; }
	.swing { display: grid; gap: var(--space-2); padding: var(--space-4); border: 1px solid transparent; border-radius: 8px; transition: border-color .18s, background-color .18s; }
	.swing + .swing { border-top-color: var(--border); }
	.swing.active { border-color: var(--border); background: var(--surface); }
	.swing-for { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
	.badge { display: inline-grid; place-items: center; width: 1.5rem; height: 1.5rem; border: 2px solid var(--success); border-radius: 50%; letter-spacing: 0; }
	.drop .badge { border-color: var(--error); }
	.swing-when, .swing-score { color: var(--muted); font-size: var(--text-sm); }
	.swing-play { max-width: 60ch; font-size: var(--text-lg); font-weight: 650; line-height: 1.35; }
	.swing-chance { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; font-variant-numeric: tabular-nums; }
	.swing-chance span { color: var(--success); font-size: var(--text-sm); font-weight: 700; }
	.drop .swing-chance span { color: var(--error); }

	@media (prefers-reduced-motion: reduce) {
		.pin, .swing { transition: none; }
	}
	@media (min-width: 48rem) {
		.strip { height: 4.5rem; }
		.row { grid-template-columns: 3.5rem minmax(0, 1fr); }
	}
	@media (min-width: 64rem) {
		.layout { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: start; }
	}
</style>
