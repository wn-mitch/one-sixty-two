<script lang="ts">
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import { POSITION_GLOSSARY, STAT_GLOSSARY } from '#lib/game/glossary.ts';

	const HITTERS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
	const PITCHERS = ['SP', 'SP', 'SP', 'CL', 'RP', 'RP', 'RP'];
	const hitterPositions = POSITION_GLOSSARY.filter(entry => entry.group === 'hitter');
	const pitcherPositions = POSITION_GLOSSARY.filter(entry => entry.group === 'pitcher');
</script>

<svelte:head>
	<title>How to play | 162-0</title>
	<meta name="description" content="Open 16 packs from baseball history, draft a full team, and see if you can survive a 162-game season without a loss." />
</svelte:head>

<article class="how">
	<header class="intro">
		<h1>How to play</h1>
		<p class="lede">Open 16 packs from baseball history, draft a full 16-player team, and see if you can win all 162 games.</p>
		<p class="sublede">New to baseball? You don’t need to know the players — the <a href="#baseball-basics">quick baseball guide below</a> explains every stat and position in plain English.</p>
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
			<h2><span class="number">1</span>Pick a home ballpark</h2>
			<p>Your team plays half its games (81 of 162) here. Fence distances and altitude affect how far the ball flies for both teams — not sure which to pick? Any ballpark is fine, or tap <strong>Pick a random park</strong>.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<div class="pack">
					<span class="pack-name">Orioles</span>
					<span class="pack-years">1960–1969</span>
				</div>
			</div>
			<h2><span class="number">2</span>Open a pack and draft a player</h2>
			<p>Tap the foil pack to reveal a real MLB team and decade, then tap the card to browse its players. Pick <strong>one player season</strong> and place them into an open spot they can play.</p>
			<p>At least twice per draft you’ll hit a <strong>Jackpot</strong> pack: six elite seasons from any team and era.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<div class="pack small"><span class="pack-name">Cubs</span><span class="pack-years">1980s</span></div>
				<div class="pack small extra"><span class="plus">+</span><span class="pack-years">2 left</span></div>
			</div>
			<h2><span class="number">3</span>Use extra packs when stuck</h2>
			<p>Twice per draft (three times on your first draft), you can tap <strong>Extra pack</strong> to open another team and pick between them. Extra packs don’t refill, so save them for a pack that doesn’t fit your open spots.</p>
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
			<h2><span class="number">4</span>Fill all 16 roster spots</h2>
			<p>You need <strong>9 hitters</strong> and <strong>7 pitchers</strong> (3 starters, 1 closer, 3 relievers). You can only use each team and each player once — and you can move hitters between eligible positions on your field anytime before the season starts.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<div class="scorebug">
					<span class="record">162<span>–</span>0</span>
					<span class="streak">{#each { length: 12 } as _, index (index)}<i></i>{/each}</span>
				</div>
			</div>
			<h2><span class="number">5</span>Set your lineup and play 162 games</h2>
			<p>Arrange your batting order, starting pitchers, and bullpen roles — or tap <strong>Smart all</strong> to set the best order automatically — then simulate all 162 games against the 2025 MLB clubs.</p>
			<p>Afterward, check your grade, awards, and game-by-game results. Every finished team is saved in <strong>My teams</strong>, and its cards join your <strong>Collection</strong>.</p>
		</li>

		<li class="step">
			<div class="art" aria-hidden="true">
				<span class="earn"><TokenAmount amount={1} /></span>
			</div>
			<h2><span class="number">6</span>Earn tokens and play the daily</h2>
			<p>Every finished season earns <strong>1 token</strong> (your first earns a bonus one). Spend tokens in the <strong>Shop</strong> to unlock foil and holo card finishes, then apply them in the <strong>Card factory</strong>. Finishes are purely cosmetic.</p>
			<p>Try the <strong>Daily</strong> for a shared challenge: everyone gets the same ballpark and opening pack each day, and finishing it earns 2 tokens.</p>
		</li>
	</ol>

	<section id="baseball-basics" class="basics" aria-labelledby="basics-heading">
		<header class="basics-intro">
			<h2 id="basics-heading">New to baseball? Quick guide</h2>
			<p>Don’t know the stats or positions? Sort players by <strong>WAR</strong> and pick the highest <strong>WAR/162</strong> number that fits an open spot — you’ll draft a great team right away.</p>
		</header>

		<div class="basics-grid">
			<section class="basics-panel" aria-labelledby="stats-guide-heading">
				<h3 id="stats-guide-heading">Reading the numbers on a card</h3>
				<ul class="stat-list">
					{#each STAT_GLOSSARY as stat (stat.code)}
						<li>
							<div class="stat-head">
								<strong>{stat.code}</strong>
								<span class="stat-name">{stat.name}</span>
								<span class="direction" class:lower={stat.direction === 'lower'}>
									{stat.direction === 'higher' ? 'Higher is better' : 'Lower is better'}
								</span>
							</div>
							<p>{stat.summary}</p>
						</li>
					{/each}
				</ul>
			</section>

			<section class="basics-panel" aria-labelledby="positions-guide-heading">
				<h3 id="positions-guide-heading">The 16 roster spots</h3>
				<div class="position-groups">
					<div>
						<h4>Hitters (9 spots)</h4>
						<dl>
							{#each hitterPositions as pos (pos.code)}
								<div>
									<dt><strong>{pos.code}</strong> {pos.name}</dt>
									<dd>{pos.summary}</dd>
								</div>
							{/each}
						</dl>
					</div>
					<div>
						<h4>Pitchers (7 spots)</h4>
						<dl>
							{#each pitcherPositions as pos (pos.code)}
								<div>
									<dt><strong>{pos.code}</strong> {pos.name}</dt>
									<dd>{pos.summary}</dd>
								</div>
							{/each}
						</dl>
					</div>
				</div>
			</section>
		</div>
	</section>

	<footer class="next">
		<a class="button primary" href="/">Start a draft</a>
		<a class="button secondary" href="/about">Rules &amp; model</a>
	</footer>
</article>

<style>
	.how { width: min(100% - 2rem, 72rem); margin: 0 auto; padding: var(--space-8) 0 var(--space-16); }
	.intro { max-width: 44rem; padding-bottom: var(--space-8); }
	h1 { font-size: clamp(var(--text-2xl), 7vw, var(--text-score)); }
	.lede { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--text-lg); line-height: 1.45; max-width: 40ch; }
	.sublede { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.5; max-width: 56ch; }
	.sublede a { color: var(--accent); font-weight: 650; }

	.steps { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
	.step { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	.step h2 { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--text-lg); letter-spacing: -.01em; }
	.step p { margin: 0; color: var(--muted); max-width: 52ch; line-height: 1.55; }
	.step p strong { color: var(--text); }
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

	.basics { margin-top: var(--space-12); padding-top: var(--space-8); border-top: 1px solid var(--border); display: grid; gap: var(--space-6); }
	.basics-intro { max-width: 44rem; display: grid; gap: var(--space-2); }
	.basics-intro h2 { margin: 0; font-size: var(--text-2xl); }
	.basics-intro p { margin: 0; color: var(--muted); line-height: 1.55; }
	.basics-intro p strong { color: var(--text); }
	.basics-grid { display: grid; gap: var(--space-5); }
	.basics-panel { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	.basics-panel h3 { margin: 0; font-size: var(--text-lg); }
	.basics-panel h4 { margin: 0 0 var(--space-2); color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
	.stat-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
	.stat-list li { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
	.stat-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-2); margin-bottom: var(--space-1); }
	.stat-head strong { font-size: var(--text-sm); }
	.stat-name { color: var(--muted); font-size: var(--text-xs); font-weight: 650; }
	.direction { margin-left: auto; padding: .1rem .5rem; border-radius: 999px; background: color-mix(in oklch, var(--success) 16%, transparent); color: var(--success); font-size: var(--text-xs); font-weight: 700; }
	.direction.lower { background: color-mix(in oklch, var(--focus) 16%, transparent); color: var(--focus); }
	.stat-list p { margin: 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.5; }
	.position-groups { display: grid; gap: var(--space-5); }
	dl { display: grid; gap: var(--space-2); margin: 0; }
	dl > div { display: grid; gap: 2px; }
	dt { font-size: var(--text-sm); font-weight: 650; }
	dt strong { display: inline-block; min-width: 2.25rem; color: var(--accent); font-variant-numeric: tabular-nums; }
	dd { margin: 0; color: var(--muted); font-size: var(--text-xs); line-height: 1.45; }

	.next { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-8); }
	.next .button { min-width: 10rem; }

	@media (min-width: 40rem) { .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (min-width: 56rem) { .basics-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); } }
	@media (min-width: 64rem) { .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 22rem) {
		.slots { grid-template-columns: repeat(9, 1.35rem); }
		.slots.pitchers { grid-template-columns: repeat(7, 1.35rem); }
	}
	@media (max-width: 30rem) {
		.next { display: grid; }
	}
</style>
