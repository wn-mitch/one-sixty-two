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
			<a href="#draft">Draft</a><a href="#season">Season</a><a href="#simulation">Simulation</a><a href="#head-to-head">Head-to-head</a><a href="#rankings">Rankings</a><a href="#attribution">Data and licence</a><a href="#image-credits">Image credits</a>
		</nav>
	</header>

	<section id="draft">
		<p class="section-number" aria-hidden="true">01</p>
		<div>
			<h2>Draft fourteen exact selections</h2>
			<p>The pool covers American and National League seasons from 1950 through 2025 that belong to the histories of the thirty current franchises. A profile stays attached to its exact historical team, league, and year. Franchise history follows the source franchise identifier, so a relocated or renamed predecessor can roll for its present-day franchise.</p>

			<h3>Who is eligible</h3>
			<ul>
				<li><strong>Hitters:</strong> at least 200 plate appearances, where PA is AB + BB + HBP + SH + SF. Every qualifying hitter can play DH. A fielding slot requires at least ten appearances at that exact position for that same team-season. Generic outfield appearances never create center-field eligibility.</li>
				<li><strong>Starting pitchers:</strong> at least ten starts, at least 180 outs pitched, and starts in 60% or more of appearances.</li>
				<li><strong>Closers:</strong> at least 60 outs pitched and starts in 20% or fewer appearances. Saves are shown for context, but do not determine eligibility.</li>
				<li><strong>Bullpen remainder:</strong> a historical team-season’s relief-dominant pitcher-seasons (positive appearances and starts in at most 20% of appearances), excluding the saves leader. Tied saves use pitching outs, then season ID. The remaining pool needs positive batters faced; small individual workloads remain included.</li>
			</ul>
			<p>You fill nine hitter slots (C, 1B, 2B, 3B, SS, LF, CF, RF, DH), three starter slots, CL, and BP. Each individual athlete can appear only once, even across seasons or two-way roles. Each franchise can be drafted only once, including a bullpen unit and any relocated predecessor. Exact season selections are permanent; qualifying fielding and DH assignments can move or swap before simulation. Starter rotation order remains editable.</p>

			<h3>How a roll stays legal</h3>
			<p>The game draws uniformly from franchises that still have an unused candidate for an open slot, then uniformly from that franchise’s viable decades. Used franchises and used athletes leave the pool, so a roll never repeats a team or a player. The legal-candidate index prevents the roll from stranding the roster. You still choose the exact season and any eligible open slot; the game never auto-picks.</p>
		</div>
	</section>

	<section id="season">
		<p class="section-number" aria-hidden="true">02</p>
		<div>
			<h2>A full 162-game challenge</h2>
			<p>The opponent set is the thirty actual 2025 clubs. The schedule contains five games against every club, plus a seeded, distinct twelve-club sample for a sixth game. It is shuffled once and alternates home and away for exactly 81 games each. It is a challenge schedule, not an official MLB schedule.</p>
			<p>All 162 games are played, even after the first loss. Results report the final W–L record, first loss, longest winning streak, runs for and against, season totals, every inning and box score, participant-wide awards, and role-specific card inspection. Traditional extra innings begin with empty bases. There is no ghost runner, tie, mercy rule, reroll, or hidden strength adjustment.</p>
			<p>Each 2025 opponent uses nine distinct recorded position players selected by a complete assignment search, five real starters in rotation, its selected relief closer, and pooled support relief. Every game is played in the home club’s stadium, and both teams play under its geometry.</p>

			<h3>Your home stadium</h3>
			<p>Before the first roll you choose a home stadium from a deck of the thirty current MLB parks. Your 81 home games are played there; road games use each opponent’s own 2025 park. Each stadium card shows the field outline, line and center distances, wall heights, roof, and elevation; estimated measurements are labelled. A stadium has no rating or bonus. It changes play only through the ball-flight model described below.</p>

			<h3>Current replays and published sharing</h3>
			<p>Replay schema 5, model <code>contact-v1</code>, and rules <code>classic-v1</code> are the only supported gameplay contract. A replay stores versioned draft inputs, the chosen home stadium and its geometry version, and the authoritative roll, pick, and reassignment action history under an opaque ID. The recipient validates and recomputes that history; an older schema, model, rules version, or dataset is rejected with a new-draft path instead of being interpreted by a legacy engine.</p>
			<p>Ordinary simulation remains in your browser. On the first share, copy, or PNG action, the server accepts only the replay ID, pins the current compatible data, media, rankings, and renderer, validates the action history, and deterministically recomputes the season. It then captures scorecard, diamond, and wide artwork from the real card components. Results labels the pre-publication artwork as a local preview, and no link is released until all three immutable PNGs exist. A capture error preserves the replay for an explicit retry; unavailable image clipboard access offers Download PNG instead.</p>
		</div>
	</section>

	<section id="simulation">
		<p class="section-number" aria-hidden="true">03</p>
		<div>
			<h2>The plate-appearance model</h2>
			<p>Batter and pitcher event rates for BB, HBP, SO, 1B, 2B, 3B, HR, and OUT are combined against the 2025 league rate and normalized into one matchup distribution. Each plate appearance first samples a walk, hit by pitch, strikeout, or ball in play from that distribution. A ball in play is then resolved physically: it receives an exit velocity, launch angle, and spray direction, flies through the stadium, and is fielded or not. The hit type is never chosen first and then decorated with a trajectory.</p>

			<h3>Era and park adjustment</h3>
			<p>Rates start from all AL/NL records in the player’s year and league, not only draft-eligible players. Each profile receives a 100 PA or BFP league prior, is expressed relative to its source league, and is translated into the combined 2025 AL/NL batting-event environment. Hitter hit weights are divided by the source batting park factor; pitcher allowed-hit weights are divided by the source pitching park factor. Those broad run-park factors are only proxies, not event-specific home-run measurements. They remove the source park from the historical rates; the simulated stadiums act separately, through ball flight.</p>
			<p>Pitcher doubles and triples allowed are inferred from that source league’s non-home-run hit mix because the source does not record them directly. Missing BFP is estimated as IP outs + H + BB + HBP. Any estimate is labelled in the generated profile.</p>
			<p>Sacrifice flies are unavailable in some early records. The compiler retains recorded counts (zero when absent) and uses conservative recorded plate-appearance components for eligibility. Cards label the incomplete SF denominator used by OBP and OPS; these are not reconstructed historical totals.</p>

			<h3>Matchup assumptions</h3>
			<ul>
				<li>Same-side left/left or right/right matchups multiply hit and walk weights by 0.95 and strikeout weight by 1.05.</li>
				<li>Opposite-side matchups multiply hit and walk weights by 1.025 and strikeout weight by 0.975. Switch hitters bat opposite; unknown handedness is neutral.</li>
				<li>No stadium multiplies any event rate. Venues affect only balls in play, through fences, walls, and air density.</li>
			</ul>

			<h3>Contact, flight, and stadiums</h3>
			<p>Batted balls are drawn from the 2025 Statcast exit-velocity, launch-angle, and spray distribution as continuous values. For each batter–pitcher matchup, the game fits a contact mix across exit-velocity and launch-angle regions plus a power shift, so that in a neutral reference park (330/380/400/380/330 ft, 10 ft walls, 500 ft elevation, <code>neutral-reference-v2</code>) the matchup reproduces its park-neutral rates for singles, doubles plus triples, home runs, and outs. Triples are matched only as closely as the physical regions allow, and a few slow, doubles-heavy seasons play with their closest fit; the compiled diagnostics count them. These are estimated profiles, not measured batted-ball data.</p>
			<p>Flight uses a declared drag-and-lift approximation fitted to 2025 Statcast distances. Air density comes from each venue’s elevation, and every ball draws a small carry factor, so equal launches do not always land in the same spot. Conditions are fixed and calm: there is no wind or weather, and retractable roofs are treated as open. A ball is a home run only if it clears the actual wall height where it reaches the fence; otherwise it can hit the wall, bounce, or be caught. Walls interpolate Statcast line, gap, and center distances and heights; foul territory and wall shapes between measured points are estimated.</p>
			<p>Fielders start from fixed positions. For each fair ball, every defender’s chance to reach a catch or a ground-ball pickup depends on when the ball arrives compared with that fielder’s reaction plus travel time. A ball that no one reaches is a hit; the batter takes extra bases when the retrieving throw would arrive after the batter. Reach, catch, and throw constants are fitted to 2025 Statcast outcomes in the neutral park.</p>

			<details>
				<summary>Runner advancement, outs, and steals</summary>
				<div class="details-body">
					<ul>
						<li><strong>BB, HBP, and error:</strong> runners advance only when forced. A bases-loaded forced runner scores. An error is not a hit or RBI.</li>
						<li><strong>Home run:</strong> every runner and the hitter score. <strong>Triple:</strong> every existing runner scores and the hitter reaches third.</li>
						<li><strong>Double:</strong> runners on second and third score. A runner on first may try to score with baseline probability 0.35 + 0.40 × speed; otherwise that runner holds at third. The selected outfielder’s throwing estimate adjusts whether the attempt is made and the chance of being thrown out.</li>
						<li><strong>Single:</strong> a runner on third scores. A runner on second may try to score with baseline probability 0.45 + 0.40 × speed. A runner on first may try for third, when open, with baseline probability 0.15 + 0.35 × speed. A declined attempt takes the required base; a failed attempt records a caught-advancing out, not caught stealing.</li>
						<li><strong>Ground-rule double:</strong> every runner advances two bases. <strong>Infield hit:</strong> the batter reaches first and runners advance only when forced.</li>
						<li><strong>Strikeout:</strong> one out and runners hold. A caught ball or fielded ground ball checks the fielder’s error estimate first; an error puts the batter on first with forced advancement. A ground ball fielded by an infielder with first occupied and fewer than two outs can become a double play; otherwise the batter is out and runners hold.</li>
						<li><strong>Outfield tag:</strong> after an ordinary outfield catch with third occupied and fewer than two outs, the runner’s attempt baseline is 0.625. A safe attempt is a sacrifice fly and RBI; a hold or throw-out is an at-bat with no sacrifice fly.</li>
						<li><strong>Steal:</strong> before a plate appearance, a runner on first may attempt second only when second is empty. Attempt propensity comes from that runner’s selected season. The runner’s smoothed success estimate is adjusted by the assigned catcher’s throwing evidence and clamped from 0.35 to 0.95. A caught stealing can end the inning before the batter appears.</li>
					</ul>
					<p>Speed is the selected season’s steal-attempt rate percentile among eligible hitters. It also sets a batter’s running time against fielders’ throws. A non-home-run walk-off stops when the winning run scores. A walk-off home run counts every run.</p>
				</div>
			</details>

			<details>
				<summary>Fielding and run prevention</summary>
				<div class="details-body">
					<p>The physical fielding model decides which fielder makes each play; there is no fixed responsibility table. Hit-prevention skill scales a fielder’s speed by 1 + .15 × skill and shortens reaction time by .08 seconds × skill. Outfield throwing scales an outfielder’s throw speed by 1 + .10 × skill. A caught or fielded ball then checks error avoidance, then eligible infield double-play participation, then an outfield tag-up. Defense does not affect walks, hit batters, or strikeouts.</p>
					<p><code>defense-v2</code> normalizes five skills from canonical evidence: hit prevention, error avoidance, double-play participation, outfield throwing, and catcher throwing. Errors use exact-position PO + A + E; DP and outfield assists use fielding outs as context-affected exposure proxies; catcher throwing uses SB + CS. Cohorts are year, league, and position, falling back to the same-year combined leagues only when needed. Minimum cohort exposure is 4,374 fielding outs for DP/arm, 1,000 handled chances for errors, and 100 steal attempts for catcher throwing. Player rates are shrunk by 2,700 fielding outs, 300 handled chances, or 50 steal attempts before normalization and bounding.</p>
					<p>Every normalized component is bounded from −1 to +1. Error avoidance is the cohort error-rate improvement divided by .02. DP and assist skills are the smoothed rate’s relative difference from the cohort divided by .50; a generic-OF arm result is then halved. Catcher throwing is the caught-stealing-rate difference divided by .20. In play, error probability is the position target minus .02 × skill; double-play probability adds .06 × the weighted lead/pivot/first-base skill; outfield arms also subtract .05 × skill from advance attempts and use .04 + .03 × skill for a conditional throw-out; catcher skill subtracts .05 × skill from the runner’s steal-success estimate. Every probability is explicitly bounded.</p>
					<p>Exact LF/CF/RF evidence takes precedence. Generic OF assists and innings are used only when the split position is absent, at half strength, and are never added to an exact split. Incomplete or zero exposure is explicitly neutral with its reason recorded; there is no modern-talent fallback. These inputs do not invent framing, blocking, throwing velocity, measured range, or a proprietary scouting grade.</p>
					<p>The pinned historical source’s <code>fld162</code> is fielding runs above average per 162 team games, not WAR. Complete joined stints and non-pitcher fielding exposure produce a smoothed aggregate budget capped at ±15 runs per 1,458 reference innings; <code>pos162</code> and <code>def162</code> are excluded. The compiler values the independently modelled error, DP, arm, and catcher effects in the same transition rules used by gameplay, then solves the remaining budget as hit prevention in the physical fielding model, bounded from −1 to +1. A budget beyond that bound is disclosed. If complete aggregate evidence is unavailable, hit prevention is neutral and <code>DEF est.</code> is —, while independently evidenced component skills still operate.</p>
					<p>On card fronts, <code>DEF est.</code> is this pre-season estimated run value at the assigned fielding position, or the profile’s primary hitter position before assignment. It is not realized season defense. An assigned DH keeps HR instead; pitcher and bullpen fronts keep WAR/162 · ERA · SO.</p>
				</div>
			</details>

			<details>
				<summary>Pitching workload and support bullpen</summary>
				<div class="details-body">
					<p>Each drafted starter receives exactly 54 starts in the chosen three-pitcher order. A start’s out budget is the rounded selected-season IP outs per start, clamped from 12 to 24. The starter leaves after the plate appearance that reaches the budget, or at an inning boundary after six runs charged in that appearance. Recovery is abstracted; injuries and seasonal fatigue are not modeled.</p>
					<p>The closer may enter at the start of inning nine or later when tied or leading by one to three runs, with at least three seasonal outs remaining, unless used in both previous challenge games. The closer works only that half inning, at most three outs, and has a season cap of floor(source IP outs × 162 / source team games).</p>
					<p>Your independently drafted bullpen remainder covers every other inning. Its fixed composition excludes the selected team-season’s saves leader, not your separately drafted closer. Rates are weighted by batters faced; the source does not reconstruct relief-only innings. Neutral handedness and unlimited support workload are transparent abstractions. The current fourteen-pick roster always uses its drafted BP; there is no legacy Support-bullpen path. Opponent closers use the same cap and rest rules. Results show outs-based IP notation and RA9, not simulated ERA, wins, or saves.</p>
				</div>
			</details>

			<h3>Scoring boundaries</h3>
			<p>Walks and hit batters are not at-bats. Hits, strikeouts, ordinary outs, and errors are at-bats. A successful tag-up is a sacrifice fly and not an at-bat. RBI are credited on hits, forced walks or hit batters, and tag-ups, but not on errors or double plays. Runs remain charged to the pitcher responsible for the runner, including inherited runners. A half inning is limited to 1,000 plate appearances and a game to 100 innings; exceeding either bound reports a simulation error instead of manufacturing a winner.</p>

			<h3>Realized value, awards, and ranks</h3>
			<p>Each plate appearance and attempted steal is valued from runs scored plus the change in neutral run expectancy, centered on the same current transition rules. The batter or runner receives offensive value. The active pitcher receives the opposing value after the play’s above-average defensive contribution is separated, and fielders receive telescoping hit-prevention, error, double-play, outfield-throwing, or catcher-throwing components. The accounting conserves offense + pitching + defense for each event; it is context dependent and is not an official earned-runs or historical-WAR reconstruction.</p>
			<p><code>sim-war-v2</code> estimates hitter value as batting + running + defense + 20 replacement runs per 600 PA, divided by ten runs per estimated win. Individual pitcher value is pitching above neutral + 20 replacement runs per 600 outs, divided by ten. Negative values are retained. Participation includes PA, BF, fielding workload, actual running events, and a pitcher who allows runs without recording an out. The pooled BP remains in team accounting but has no individual estimated WAR.</p>
			<p>Awards use unrounded values across every participating individual: MVP, batting title, fewest runs allowed by RA9, strikeout leader, and LVP. Every exact tied winner gets an inspection chip; stable season ID selects the one featured card, and multiple featured awards merge onto one card. Results inspection compares hitters only with roster hitters and pitchers/BP only with roster pitchers/BP. Competition ranks exclude missing, nonfinite, and invalid-denominator values; an all-equal cohort is tied first, while a distinct tied worst remains marked worst.</p>

			<h3>What this model is not</h3>
			<p>This is a transparent, arcade-scale approximation. It is not an OOTP-level simulation, an official scoring reconstruction, a proprietary-equivalent WAR or scouting product, or a claim about how an athlete would literally perform in another era. Generic platoon effects, estimated batted-ball profiles, a declared flight approximation, fixed calm conditions, coarse park-factor normalization, context-affected fielding proxies, bounded defensive effects, and explicit advancement probabilities are deliberate limits.</p>
		</div>
	</section>

	<section id="head-to-head">
		<p class="section-number" aria-hidden="true">04</p>
		<div>
			<h2>Head-to-head series</h2>
			<p>Head-to-head takes two replay links, either short <code>/r/</code> links or inline replay links from this site, and plays them against each other in a best-of-five. Both replays must use the same game version. Each regular season is recomputed first to set seeds: more wins is seed 1. Equal records give seed 1 to the replay whose canonical link sorts first; two identical replays give it to Team A.</p>
			<p>The series follows a 2-2-1 format. Seed 1 hosts games 1, 2, and 5, which fall on calendar days 1, 2, 4, 5, and 7. Each game is played in the host’s chosen home stadium. Rotations cycle through the three drafted starters, and the closer’s rest and workload carry across days under the season rules. The random seed comes from the unordered pair of replay keys, so the same two links always produce the same games in either order (rules <code>h2h-bo5-v1</code>, seed policy <code>replay-pair-v1</code>).</p>
			<p>Game and series MVP (<code>realized-runs-v1</code>) go to the individual on either team with the highest unrounded batting, baserunning, defense, and pitching runs above neutral. The pooled support bullpen is not a candidate. Ties go to the replay whose canonical link sorts first, then the season ID. Highlights and lowlights are the largest win-expectancy swings from Team A’s side. A series link carries both replay links and optional team names, and recomputes the series when opened; nothing about a series is stored on the server.</p>

			<h3>Your saved seasons</h3>
			<p>Every season you complete is saved in this browser, separate from the draft in progress. Beyond fifty seasons the oldest unnamed season is dropped; named seasons are always kept. You can rename or delete a season, start a head-to-head from it, or copy a challenge link, which publishes the replay and copies its short link, or the inline replay link when publishing fails. A season from an older game version stays visible as retired, with its roster and record, but cannot play head-to-head.</p>
		</div>
	</section>

	<section id="rankings">
		<p class="section-number" aria-hidden="true">05</p>
		<div>
			<h2>How the season list is ranked</h2>
			<p>By default the draft list sorts by a composite wins-above-replacement rate called JEFFBAGWELL, taken from Neil Paine’s pinned historical WAR dataset. It averages Baseball-Reference and FanGraphs WAR, and for pitchers it also averages a runs-allowed-based estimate, then expresses every season per 162 team games. Hitters rank by its batting value and pitchers by its pitching value, so the two groups are never compared against each other on one scale. You can switch the list back to the batting and pitching metrics the simulator uses for matchup rates.</p>
			<p>Bullpen units form their own section, sorted by pooled historical ERA, then pitching outs and stable season ID. A team remainder has no individual WAR; its included and excluded pitcher-seasons remain visible in card details.</p>

			<h3>What the ranking is not</h3>
			<p>The composite batting/pitching WAR/162 scalar is context and comparison only: it orders draft choices and selects cosmetic finishes, but never makes a player stronger in a matchup. The same pinned file separately supplies <code>fld162</code> fielding evidence to <code>defense-v2</code>; that position-aware, residualized estimate is disclosed independently and must not be confused with the composite WAR scalar. Rate statistics from shortened seasons are not adjusted for games played, missing values show as unavailable rather than zero, and an incomplete latest-year capture is excluded rather than extrapolated. Neither external source is presented as an internally reproduced Baseball-Reference, FanGraphs, or proprietary scouting model.</p>

			<div class="ranking-source">
				<dl>
					<div><dt>Dataset</dt><dd>JEFFBAGWELL historical WAR, 1901–2025</dd></div>
					<div><dt>Credit</dt><dd>Neil Paine, averaging Baseball-Reference and FanGraphs WAR</dd></div>
					<div><dt>Licence</dt><dd><a href="https://github.com/Neil-Paine-1/MLB-WAR-data-historical/blob/master/LICENSE.txt" rel="license">MIT</a></dd></div>
					<div><dt>Source</dt><dd><a href="https://github.com/Neil-Paine-1/MLB-WAR-data-historical">github.com/Neil-Paine-1/MLB-WAR-data-historical</a></dd></div>
				</dl>
				<p class="muted">The historical WAR/162 scalar stays separate from simulated statistics and from the app’s realized <code>sim-war-v2</code> estimate. Most event and fielding counts come from the Lahman data described below; the separately joined <code>fld162</code> column helps set the bounded aggregate defensive budget. Baseball-Reference and FanGraphs each publish their own WAR definition; JEFFBAGWELL is a third-party average and is labelled as such everywhere it appears.</p>
			</div>
		</div>
	</section>

	<section id="attribution">
		<p class="section-number" aria-hidden="true">06</p>
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
		<p class="section-number" aria-hidden="true">07</p>
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
