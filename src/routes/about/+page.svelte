<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchJson, loadManifest } from '#lib/game/data.ts';
	import type { Attribution } from '#lib/game/types.ts';
	import MediaCredits from '#lib/components/MediaCredits.svelte';

	let attribution = $state<Attribution | null>(null);
	let archiveUrl = $state('');
	let loading = $state(true);
	let error = $state('');
	let mounted = $state(false);
	let request = 0;

	async function loadAttribution(): Promise<void> {
		const current = ++request;
		loading = true;
		error = '';
		try {
			const manifest = await loadManifest();
			const loaded = await fetchJson<Attribution>(manifest.attributionUrl);
			if (current !== request) return;
			attribution = loaded;
			archiveUrl = manifest.archiveUrl;
		} catch (caught) {
			if (current !== request) return;
			error = caught instanceof Error ? caught.message : 'The data notice could not be loaded.';
		} finally {
			if (current === request) loading = false;
		}
	}

	onMount(() => {
		mounted = true;
		void loadAttribution();
		return () => { request++; };
	});
</script>

<svelte:head>
	<title>Rules and data | 162-0</title>
	<meta name="description" content="How the 162-0 historical baseball draft and plate-appearance simulation work." />
</svelte:head>

<article class="about">
	<header class="intro">
		<a class="back-link" href="/">← Back to the draft</a>
		<p class="eyebrow">Rules, model, and data</p>
		<h1>What happens under the hood</h1>
		<p class="lede">162-0 turns real historical team-seasons into a transparent plate-appearance game. The choices are yours; the approximations are published here.</p>
		<nav aria-label="About page sections">
			<a href="#draft">Draft</a><a href="#season">Season</a><a href="#simulation">Simulation</a><a href="#rankings">Rankings</a><a href="#attribution">Data and licence</a><a href="#image-credits">Image credits</a>
		</nav>
	</header>

	<section id="draft">
		<p class="section-number" aria-hidden="true">01</p>
		<div>
			<h2>Draft thirteen exact seasons</h2>
			<p>The pool covers American and National League seasons from 1961 through 2025 that belong to the histories of the thirty current franchises. A profile stays attached to its exact historical team, league, and year. Franchise history follows the source franchise identifier, so a relocated or renamed predecessor can roll for its present-day franchise.</p>

			<h3>Who is eligible</h3>
			<ul>
				<li><strong>Hitters:</strong> at least 200 plate appearances, where PA is AB + BB + HBP + SH + SF. Every qualifying hitter can play DH. A fielding slot requires at least ten appearances at that exact position for that same team-season. Generic outfield appearances never create center-field eligibility.</li>
				<li><strong>Starting pitchers:</strong> at least ten starts, at least 180 outs pitched, and starts in 60% or more of appearances.</li>
				<li><strong>Closers:</strong> at least 60 outs pitched and starts in 20% or fewer appearances. Saves are shown for context, but do not determine eligibility.</li>
			</ul>
			<p>You fill C, 1B, 2B, 3B, SS, LF, CF, RF, DH, three starting-pitcher slots, and one closer slot. One athlete can appear only once, even if another season or a two-way role is available, and each franchise can be drafted only once per roster. A relocated or renamed predecessor is the same franchise, so drafting a 1987 New York Mets season also uses up the franchise history that reaches the present-day Mets. Picks are permanent for that draft.</p>

			<h3>How a roll stays legal</h3>
			<p>The game draws uniformly from franchises that still have an unused candidate for an open slot, then uniformly from that franchise’s viable decades. Used franchises and used athletes leave the pool, so a roll never repeats a team or a player. The legal-candidate index prevents the roll from stranding the roster. You still choose the exact season and any eligible open slot; the game never auto-picks.</p>
		</div>
	</section>

	<section id="season">
		<p class="section-number" aria-hidden="true">02</p>
		<div>
			<h2>A full 162-game challenge</h2>
			<p>The opponent set is the thirty actual 2025 clubs. The schedule contains five games against every club, plus a seeded, distinct twelve-club sample for a sixth game. It is shuffled once and alternates home and away for exactly 81 games each. It is a challenge schedule, not an official MLB schedule.</p>
			<p>All 162 games are played, even after the first loss. Results report the final W–L record, first loss, longest winning streak, runs for and against, season totals, and every inning and box score. Traditional extra innings begin with empty bases. There is no ghost runner, tie, mercy rule, reroll, or hidden strength adjustment.</p>
			<p>Each 2025 opponent uses nine distinct recorded position players selected by a complete assignment search, five real starters in rotation, its selected relief closer, and pooled support relief. Drafted-team home games use a neutral park; road games use the opponent’s clamped 2025 batting park factor.</p>
		</div>
	</section>

	<section id="simulation">
		<p class="section-number" aria-hidden="true">03</p>
		<div>
			<h2>The plate-appearance model</h2>
			<p>Every matchup samples exactly one of BB, HBP, SO, 1B, 2B, 3B, HR, or OUT. Batter and pitcher event rates are combined against the 2025 league rate and normalized into one categorical distribution. Outcomes are not a chain of independent coin flips.</p>

			<h3>Era and park adjustment</h3>
			<p>Rates start from all AL/NL records in the player’s year and league, not only draft-eligible players. Each profile receives a 100 PA or BFP league prior, is expressed relative to its source league, and is translated into the combined 2025 AL/NL batting-event environment. Hitter hit weights are divided by the source batting park factor; pitcher allowed-hit weights are divided by the source pitching park factor. Those broad run-park factors are only proxies, not event-specific home-run measurements.</p>
			<p>Pitcher doubles and triples allowed are inferred from that source league’s non-home-run hit mix because the source does not record them directly. Missing BFP is estimated as IP outs + H + BB + HBP. Any estimate is labelled in the generated profile.</p>

			<h3>Matchup assumptions</h3>
			<ul>
				<li>Same-side left/left or right/right matchups multiply hit and walk weights by 0.95 and strikeout weight by 1.05.</li>
				<li>Opposite-side matchups multiply hit and walk weights by 1.025 and strikeout weight by 0.975. Switch hitters bat opposite; unknown handedness is neutral.</li>
				<li>In an opponent park, hit weights use the home club batting park factor clamped from 0.80 to 1.20. K, BB, and HBP receive no direct park modifier.</li>
			</ul>

			<details>
				<summary>Runner advancement, outs, and steals</summary>
				<div class="details-body">
					<ul>
						<li><strong>BB, HBP, and error:</strong> runners advance only when forced. A bases-loaded forced runner scores. An error is not a hit or RBI.</li>
						<li><strong>Home run:</strong> every runner and the hitter score. <strong>Triple:</strong> every existing runner scores and the hitter reaches third.</li>
						<li><strong>Double:</strong> runners on second and third score. A runner on first scores with probability 0.35 + 0.40 × speed; otherwise that runner reaches third.</li>
						<li><strong>Single:</strong> a runner on third scores. A runner on second scores with probability 0.45 + 0.40 × speed; otherwise that runner reaches third. A runner on first reaches third only when it is vacant, with probability 0.15 + 0.35 × speed; otherwise that runner reaches second.</li>
						<li><strong>Strikeout:</strong> one out and runners hold. On another out with first occupied and fewer than two outs, double-play probability is clamp(4 × GIDP / non-strikeout outs, 0, 0.40). Otherwise, a runner on third tags and scores with probability 0.25 when there were fewer than two outs.</li>
						<li><strong>Steal:</strong> before a plate appearance, a runner on first may attempt second only when second is empty. Attempt probability is clamp((SB + CS) / max(1, H + BB + HBP), 0, 0.25). Success uses (SB + 10 × league success) / (SB + CS + 10), adjusted by −0.25 × (catcher CS rate − league catcher CS rate), then clamped from 0.35 to 0.95. A caught stealing can end the inning before the batter appears.</li>
					</ul>
					<p>Speed is the selected season’s steal-attempt rate percentile among eligible hitters. A non-home-run walk-off stops when the winning run scores. A walk-off home run counts every run.</p>
				</div>
			</details>

			<details>
				<summary>Fielding and run prevention</summary>
				<div class="details-body">
					<p>On a ball-in-play out, responsibility is sampled at C/1B/2B/3B/SS/LF/CF/RF weights of 0.05/0.10/0.15/0.10/0.20/0.13/0.14/0.13. Position error probability is (E + 100 × league position error rate) / (PO + A + E + 100). An error forces one-base advancement and records no hit or RBI.</p>
					<p>Exact position fielding rows are preferred. A missing LF, CF, or RF row can use that athlete’s generic outfield reliability, then the league position estimate. This models fielding reliability only. It does not invent range, defensive runs saved, or unavailable historical tracking.</p>
				</div>
			</details>

			<details>
				<summary>Pitching workload and support bullpen</summary>
				<div class="details-body">
					<p>Each drafted starter receives exactly 54 starts in the chosen three-pitcher order. A start’s out budget is the rounded selected-season IP outs per start, clamped from 12 to 24. The starter leaves after the plate appearance that reaches the budget, or at an inning boundary after six runs charged in that appearance. Recovery is abstracted; injuries and seasonal fatigue are not modeled.</p>
					<p>The closer may enter at the start of inning nine or later when tied or leading by one to three runs, with at least three seasonal outs remaining, unless used in both previous challenge games. The closer works only that half inning, at most three outs, and has a season cap of floor(source IP outs × 162 / source team games).</p>
					<p>League-average 2025 relief covers every other inning and is labelled <strong>Support bullpen</strong>. Opponent closers use the same cap and rest rules. Pitching results show outs-based baseball IP notation and RA9. They do not claim simulated ERA, wins, or saves.</p>
				</div>
			</details>

			<h3>Scoring boundaries</h3>
			<p>Walks and hit batters are not at-bats. Hits, strikeouts, ordinary outs, and errors are at-bats. A successful tag-up is a sacrifice fly and not an at-bat. RBI are credited on hits, forced walks or hit batters, and tag-ups, but not on errors or double plays. Runs remain charged to the pitcher responsible for the runner, including inherited runners. A half inning is limited to 1,000 plate appearances and a game to 100 innings; exceeding either bound reports a simulation error instead of manufacturing a winner.</p>

			<h3>What this model is not</h3>
			<p>This is a transparent, arcade-scale approximation. It is not an OOTP-level simulation, an official scoring reconstruction, or a claim about how an athlete would literally perform in another era. Generic platoon effects, inferred hit types, park proxies, reliability-only defense, and fixed advancement probabilities are deliberate limits.</p>
		</div>
	</section>

	<section id="rankings">
		<p class="section-number" aria-hidden="true">04</p>
		<div>
			<h2>How the season list is ranked</h2>
			<p>By default the draft list sorts by a composite wins-above-replacement rate called JEFFBAGWELL, taken from Neil Paine’s pinned historical WAR dataset. It averages Baseball-Reference and FanGraphs WAR, and for pitchers it also averages a runs-allowed-based estimate, then expresses every season per 162 team games. Hitters rank by its batting value and pitchers by its pitching value, so the two groups are never compared against each other on one scale. You can switch the list back to the batting and pitching metrics the simulator actually uses.</p>

			<h3>What the ranking is not</h3>
			<p>WAR is context and comparison only. It does not feed the simulation: no drafted season becomes stronger or weaker in play because of its WAR. Rate statistics from a shortened season are not adjusted for games played, a season with no published value shows as unavailable rather than zero, and a player’s best listed season is not necessarily his best legal season for your open slot. A season whose source rows cover fewer scheduled games than the shortest completed season in the covered window is treated as an incomplete capture and shows as unavailable, because a per-162 rate from part of a season would outrank full seasons.</p>

			<div class="ranking-source">
				<dl>
					<div><dt>Dataset</dt><dd>JEFFBAGWELL historical WAR, 1901–2025</dd></div>
					<div><dt>Credit</dt><dd>Neil Paine, averaging Baseball-Reference and FanGraphs WAR</dd></div>
					<div><dt>Licence</dt><dd><a href="https://github.com/Neil-Paine-1/MLB-WAR-data-historical/blob/master/LICENSE.txt" rel="license">MIT</a></dd></div>
					<div><dt>Source</dt><dd><a href="https://github.com/Neil-Paine-1/MLB-WAR-data-historical">github.com/Neil-Paine-1/MLB-WAR-data-historical</a></dd></div>
				</dl>
				<p class="muted">This ranking file is separate from the simulated statistics, which remain the Lahman data described below. Baseball-Reference and FanGraphs each publish their own WAR definition; the composite is a third-party average of the two and is labelled as such everywhere it appears.</p>
			</div>
		</div>
	</section>

	<section id="attribution">
		<p class="section-number" aria-hidden="true">05</p>
		<div>
			<h2>Source, attribution, and download</h2>
			<p>The browser loads the full required source notice from the same versioned dataset used by the game. The downloadable transformed archive is distributed under Creative Commons Attribution-ShareAlike 3.0 and includes the machine-readable payload, source revision, licence, attribution, and a description of changes.</p>

			<div class="attribution-panel" aria-busy={loading}>
				{#if loading}
					<div class="source-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
					<p class="muted" role="status">Loading the versioned source notice…</p>
				{:else if error}
					<p class="error" role="alert">{error}</p>
					<button class="secondary" type="button" onclick={loadAttribution}>Retry source notice</button>
				{:else if attribution}
					<p class="notice" role="status">Attribution data loaded from the current game dataset.</p>
					<dl>
						<div><dt>Dataset</dt><dd>{attribution.title}</dd></div>
						<div><dt>Credit</dt><dd>{attribution.credit}</dd></div>
						<div><dt>Licence</dt><dd><a href={attribution.licenseUrl} rel="license">{attribution.license}</a></dd></div>
						<div><dt>Source revision</dt><dd><code>{attribution.sourceCommit}</code></dd></div>
						<div><dt>Changes</dt><dd>{attribution.changes}</dd></div>
					</dl>
					<div class="data-actions">
						<a class="button primary button-link" href={archiveUrl} download>Download transformed data</a>
						<a class="button secondary button-link" href={attribution.sourceUrl}>Open source dataset</a>
					</div>
					<details class="full-notice">
						<summary>Read the full source notice</summary>
						<pre>{attribution.fullNotice}</pre>
					</details>
				{/if}
			</div>
			{#if !mounted}
				<p class="muted ssr-note">The current versioned source notice loads after this page starts in your browser. All game rules above are available in the prerendered page.</p>
			{/if}
		</div>
	</section>

	<section id="image-credits">
		<p class="section-number" aria-hidden="true">06</p>
		<div>
			<h2>Image provenance and licences</h2>
			<MediaCredits />
		</div>
	</section>
</article>

<style>
	.about {
		width: min(100% - 2rem, 70rem);
		margin: 0 auto;
		padding: 2rem 0 5rem;
	}

	.intro {
		max-width: 48rem;
		padding: 1rem 0 clamp(3rem, 9vw, 6rem);
	}

	.back-link {
		display: inline-flex;
		margin-bottom: 3rem;
		color: var(--muted);
		font-weight: 700;
		text-decoration: none;
	}

	.back-link:hover { color: var(--text); }

	h1 {
		max-width: 12ch;
		margin: 0.2rem 0 1rem;
		font-size: clamp(2.8rem, 8vw, 5.8rem);
		font-weight: 950;
		line-height: 0.94;
		letter-spacing: -0.055em;
	}

	.lede {
		max-width: 62ch;
		color: var(--muted);
		font-size: 1.08rem;
		line-height: 1.65;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 2rem;
	}

	nav a {
		padding: 0.55rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 700;
		text-decoration: none;
	}

	.about > section {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 46rem);
		gap: 1.25rem;
		padding: clamp(2.5rem, 7vw, 5rem) 0;
		border-top: 1px solid var(--border);
	}

	.section-number {
		margin: 0.35rem 0 0;
		color: var(--accent);
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	h2 {
		margin: 0 0 1.5rem;
		font-size: 2rem;
		line-height: 1.1;
	}

	h3 {
		margin: 2rem 0 0.6rem;
		font-size: 1.15rem;
	}

	p,
	li {
		line-height: 1.68;
	}

	li + li { margin-top: 0.6rem; }

	details {
		margin-top: 1.5rem;
		padding: 0.9rem 0;
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}

	details + details { margin-top: -1px; }

	summary {
		cursor: pointer;
		font-size: 1rem;
		font-weight: 800;
	}

	.details-body {
		padding-top: 0.6rem;
		color: var(--muted);
	}

	.attribution-panel {
		min-height: 10rem;
		margin-top: 1.5rem;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 1rem;
		background: var(--surface);
	}

	.source-skeleton {
		display: grid;
		gap: 0.65rem;
		padding: 0.5rem 0;
	}

	.source-skeleton span {
		display: block;
		width: 100%;
		height: 0.85rem;
		border-radius: 999px;
		background: var(--surface-raised);
		animation: pulse 1.2s ease-in-out infinite alternate;
	}

	.source-skeleton span:nth-child(2) { width: 82%; }
	.source-skeleton span:nth-child(3) { width: 57%; }

	.attribution-panel dl {
		display: grid;
		gap: 0;
		margin: 1.25rem 0;
	}

	.ranking-source {
		margin-top: 1.75rem;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 1rem;
		background: var(--surface);
	}

	.ranking-source dl { margin-top: 0; }

	.attribution-panel dl div {
		display: grid;
		grid-template-columns: 8rem minmax(0, 1fr);
		gap: 1rem;
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--border);
	}

	dt {
		color: var(--muted);
		font-size: 0.74rem;
		font-weight: 750;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	dd {
		min-width: 0;
		margin: 0;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	code { font-size: 0.78rem; }

	.data-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin: 1.25rem 0;
	}

	.button-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0 1rem;
		text-decoration: none;
	}

	.full-notice pre {
		max-height: 26rem;
		margin: 1rem 0 0;
		padding: 1rem;
		overflow: auto;
		border-radius: 0.65rem;
		background: var(--background);
		color: var(--muted);
		font: 0.72rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
		white-space: pre-wrap;
	}

	.ssr-note { font-size: 0.82rem; }

	@keyframes pulse {
		from { opacity: 0.45; }
		to { opacity: 0.9; }
	}

	@media (prefers-reduced-motion: reduce) {
		.source-skeleton span { animation: none; }
	}

	@media (max-width: 38rem) {
		.about { width: min(100% - 1.25rem, 70rem); }
		.about > section { grid-template-columns: 1fr; gap: 0.4rem; }
		.section-number { margin-bottom: 0.5rem; }
		.attribution-panel { padding: 1rem; }
		.attribution-panel dl div { grid-template-columns: 1fr; gap: 0.2rem; }
		.data-actions { display: grid; }
	}
</style>
