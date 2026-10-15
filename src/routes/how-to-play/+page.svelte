<script lang="ts">
	import TokenAmount from '#lib/components/TokenAmount.svelte';

	const HITTERS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
	const PITCHERS = ['SP', 'SP', 'SP', 'CL', 'RP', 'RP', 'RP'];
</script>

<svelte:head>
	<title>How to play | 162-0</title>
	<meta name="description" content="Draft sixteen exact historical player seasons, then try to survive 162 games without a loss." />
</svelte:head>

<article class="how">
	<header class="intro">
		<h1>How to play</h1>
		<p class="lede">Draft sixteen real player seasons from franchise packs, then see if your club can play all 162 games without a loss.</p>
	</header>

	<ol class="steps">
		<li class="step">
			<div class="art" aria-hidden="true">
				<svg class="park" viewBox="0 0 160 110">
					<path class="outfield" d="M80 104 L12 36 Q80 -14 148 36 Z" />
					<path class="infield" d="M80 98 L52 70 L80 42 L108 70 Z" />
					<circle class="base" cx="80" cy="98" r="3" />
					<rect class="base" x="105" y="67" width="6" height="6" transform="rotate(45 108 70)" />
					<rect class="base" x="77" y="39" width="6" height="6" transform="rotate(45 80 42)" />
					<rect class="base" x="49" y="67" width="6" height="6" transform="rotate(45 52 70)" />
				</svg>
			</div>
			<h2><span class="number">1</span>Choose a home park</h2>
			<p>You play 81 games there. Its fences, walls and elevation change how far the ball carries. No park is rated higher than another.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<div class="pack">
					<span class="pack-name">Orioles</span>
					<span class="pack-years">1960–1969</span>
				</div>
			</div>
			<h2><span class="number">2</span>Open a pack</h2>
			<p>Each pack is one franchise from one decade. Take one exact player season from it and put him in an open position he can play.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<div class="pack small"><span class="pack-name">Cubs</span><span class="pack-years">1980s</span></div>
				<div class="pack small extra"><span class="plus">+</span><span class="pack-years">2 left</span></div>
			</div>
			<h2><span class="number">3</span>Spend extra packs wisely</h2>
			<p>Twice per draft you can open a second franchise before picking, then keep one of the two. They do not refill.</p>
		</li>

		<li class="step">
			<div class="art roster-art" aria-hidden="true">
				<div class="slots">
					{#each HITTERS as slot, index (index)}<span class:filled={index < 5}>{slot}</span>{/each}
				</div>
				<div class="slots pitchers">
					{#each PITCHERS as slot, index (index)}<span class:filled={index < 2}>{slot}</span>{/each}
				</div>
			</div>
			<h2><span class="number">4</span>Fill all sixteen spots</h2>
			<p>Nine hitters, three starters, a closer and three relievers. Where a player fits matters as much as his numbers.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<div class="scorebug">
					<span class="record">162<span>–</span>0</span>
					<span class="streak">{#each { length: 12 } as _, index (index)}<i></i>{/each}</span>
				</div>
			</div>
			<h2><span class="number">5</span>Play the season</h2>
			<p>All 162 games are simulated, plate appearance by plate appearance. Your team is saved in My teams, and its cards join your Collection.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<span class="earn"><TokenAmount amount={1} /></span>
			</div>
			<h2><span class="number">6</span>Earn tokens</h2>
			<p>Each season you finish earns a token, and your first earns a bonus one. Spend them in the Shop on card finishes. Finishes never change statistics.</p>
		</li>
	</ol>

	<footer class="next">
		<a class="button primary" href="/">Start a draft</a>
		<a class="button secondary" href="/about">Rules &amp; model</a>
	</footer>
</article>

<style>
	.how { width: min(100% - 2rem, 72rem); margin: 0 auto; padding: var(--space-8) 0 var(--space-16); }
	.intro { max-width: 40rem; padding-bottom: var(--space-8); }
	h1 { font-size: clamp(var(--text-2xl), 7vw, var(--text-score)); }
	.lede { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--text-lg); line-height: 1.45; max-width: 36ch; }

	.steps { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
	.step { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	.step h2 { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--text-lg); letter-spacing: -.01em; }
	.step p { margin: 0; color: var(--muted); max-width: 52ch; }
	.number { color: var(--accent); font: italic 900 var(--text-xl)/1 'Barlow Condensed', sans-serif; font-variant-numeric: tabular-nums; }

	.art { display: flex; align-items: center; justify-content: center; gap: var(--space-3); height: 8.5rem; border-radius: var(--radius); background: var(--background); overflow: hidden; }

	.park { width: 9rem; height: auto; }
	.outfield { fill: oklch(40% .07 150); }
	.infield { fill: oklch(55% .07 65); }
	.base { fill: var(--text); }

	.pack { display: grid; place-content: center; justify-items: center; width: 5.5rem; padding-inline: var(--space-1); aspect-ratio: 5 / 7; border-radius: .3rem; background: linear-gradient(160deg, oklch(70% .17 50), oklch(58% .19 40)); box-shadow: inset 0 0 0 2px oklch(100% 0 0 / .35), 0 .5rem 1rem oklch(8% .01 255 / .4); color: oklch(15% .02 50); font-family: 'Barlow Condensed', sans-serif; font-style: italic; font-weight: 900; text-align: center; line-height: 1; }
	.pack-name { font-size: .9375rem; text-transform: uppercase; overflow-wrap: anywhere; }
	.pack-years { margin-top: var(--space-1); font-size: .75rem; }
	.pack.small { width: 4.25rem; }
	.pack.small:first-child { background: linear-gradient(160deg, oklch(45% .15 260), oklch(35% .15 260)); color: oklch(95% .02 260); }
	.pack.extra { background: transparent; box-shadow: inset 0 0 0 2px var(--border); color: var(--muted); }
	.plus { font-size: 1.75rem; font-style: normal; font-weight: 400; }

	.roster-art { flex-direction: column; gap: var(--space-2); }
	.slots { display: grid; grid-template-columns: repeat(9, 1.6rem); gap: 3px; }
	.slots.pitchers { grid-template-columns: repeat(7, 1.6rem); }
	.slots span { display: grid; place-items: center; height: 2.1rem; border: 1px dashed var(--border); border-radius: 3px; color: var(--muted); font: 700 .625rem/1 system-ui, sans-serif; }
	.slots span.filled { border: 0; background: var(--surface-raised); color: var(--text); }

	.scorebug { display: grid; justify-items: center; gap: var(--space-2); }
	.record { font: italic 900 var(--text-3xl)/1 'Barlow Condensed', sans-serif; letter-spacing: .01em; }
	.record span { color: var(--muted); }
	.streak { display: flex; gap: 3px; }
	.streak i { width: .5rem; height: .5rem; border-radius: 50%; background: var(--accent); }

	.earn { color: var(--accent); font: 800 var(--text-3xl)/1 'Barlow Condensed', sans-serif; }

	.next { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-8); }
	.next .button { min-width: 10rem; }

	@media (min-width: 40rem) { .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (min-width: 64rem) { .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 22rem) {
		.slots { grid-template-columns: repeat(9, 1.35rem); }
		.slots.pitchers { grid-template-columns: repeat(7, 1.35rem); }
	}
	@media (max-width: 30rem) {
		.next { display: grid; }
	}
</style>
