<svelte:head>
	<title>Rules and data | 162-0</title>
	<meta name="description" content="How the 162-0 historical baseball draft and plate-appearance simulation work." />
</svelte:head>

<article class="about">
	<header class="intro">
		<a class="back-link" href="/">← Back to Play</a>
		<h1>What happens under the hood</h1>
		<p class="lede">162-0 turns real historical team-seasons into a transparent plate-appearance game. The choices are yours; the approximations are published here.</p>
		<nav aria-label="About page sections">
			<a href="#draft">Draft</a><a href="#season">Season</a><a href="#simulation">Simulation</a><a href="#head-to-head">Head-to-head</a><a href="#rankings">Rankings</a><a href="/how-to-play">How to play</a><a href="/credits">Data and image credits</a>
		</nav>
	</header>

	<section id="draft">
		<p class="section-number" aria-hidden="true">01</p>
		<div>
			<h2>Draft sixteen exact selections</h2>
			<p>The pool covers American and National League seasons from 1950 through 2025 that belong to the histories of the thirty current franchises. A profile stays attached to its exact historical team, league, and year. Franchise history follows the source franchise identifier, so a relocated or renamed predecessor can roll for its present-day franchise.</p>

			<h3>Who is eligible</h3>
			<ul>
				<li><strong>Hitters:</strong> at least 200 plate appearances, where PA is AB + BB + HBP + SH + SF. Every qualifying hitter can play DH. A fielding slot requires at least ten appearances at that exact position for that same team-season. Generic outfield appearances never create center-field eligibility.</li>
				<li><strong>Starting pitchers:</strong> at least ten starts, at least 180 outs pitched, and starts in 60% or more of appearances.</li>
				<li><strong>Relievers:</strong> at least 60 outs pitched and starts in 20% or fewer appearances. A reliever qualifies for CL and for RP1, RP2 and RP3. Saves are shown for context, but do not determine eligibility.</li>
			</ul>
			<p>You fill nine hitter slots (C, 1B, 2B, 3B, SS, LF, CF, RF, DH), three starter slots, CL, and three named relievers (RP1, RP2, RP3). Each individual athlete can appear only once, even across seasons or two-way roles. Each franchise can be drafted only once, including any relocated predecessor. Team-season bullpen cards collected in earlier versions stay in your collection but are no longer drafted. Exact season selections are permanent; qualifying fielding and DH assignments can move or swap before simulation. Starter rotation order and each reliever's relief role and backup role remain editable.</p>

			<h3>How a roll stays legal</h3>
			<p>The game draws uniformly from franchises that still have an unused candidate for an open slot, then uniformly from that franchise’s viable decades. Used franchises and used athletes leave the pool, so a roll never repeats a team or a player. The legal-candidate index prevents the roll from stranding the roster. You still choose the exact season and any eligible open slot; the game never auto-picks. Twice per draft you may add another franchise pack to a pending roll before picking, both to one roll or one each to two rolls. The new draw comes from the same seeded stream and avoids franchises already on the table when anything else is legal. You keep one open pack and the others are discarded. Both the added packs and the choice are recorded in the replay.</p>
			<p>Some packs are jackpots: six elite seasons balanced across your open slots. Every jackpot season is a Gem card. For each choice, the game draws from the eight most valuable remaining legal Gem players at that slot, using each player’s best eligible season. One open slot can receive all six choices; two can receive three each. A pack never repeats an athlete, and drafted athletes and franchises stay excluded. Previously shown, undrafted players can return when a slot has no unseen candidates. Two of every draft’s sixteen rolls are jackpots, at positions set by the draft seed, and any other roll or added pack becomes one one time in five. The season you take still uses up its franchise.</p>
		</div>
	</section>

	<section id="season">
		<p class="section-number" aria-hidden="true">02</p>
		<div>
			<h2>A full 162-game challenge</h2>
			<p>The opponent set is the thirty actual 2025 clubs. The schedule contains five games against every club, plus a seeded, distinct twelve-club sample for a sixth game. It is shuffled once and alternates home and away for exactly 81 games each. It is a challenge schedule, not an official MLB schedule.</p>
			<p>All 162 games are played, even after the first loss. Results report the final W–L record, first loss, longest winning streak, runs for and against, season totals, every inning and box score, participant-wide awards, and role-specific card inspection. Traditional extra innings begin with empty bases. There is no ghost runner, tie, mercy rule, reroll, or hidden strength adjustment.</p>
			<p>Each 2025 opponent uses nine distinct recorded position players selected by a complete assignment search, five real starters in rotation, its selected relief closer, and pooled support relief. Every game is played in the home club’s stadium, and both teams play under its geometry.</p>

			<h3>Is 162–0 possible?</h3>
			<p>Not really, and that is by design: the season is played straight, with no hidden boost for a strong roster. The best roster our search has found averages about 156 wins and goes 162–0 roughly once in 400 seasons. A very good real draft averages 142 to 144 wins, where a perfect season is about a one-in-several-million event. The name is the dream; the grades measure how close you got, and an S or S+ season is already a great result.</p>

			<h3>The season headline</h3>
			<p>Every finished season gets a headline from a real sports page. Each phrase was copied as printed from a newspaper or magazine between 1906 and today, describing some other club's season, and the quote links to the page it came from. Your grade picks how glowing or grim the phrase is, and a season that beat or missed its draft by six or more wins draws from writing about overachievers and letdowns.</p>

			<h3>Your home stadium</h3>
			<p>Before the first roll you choose a home stadium from a deck of the thirty current MLB parks; the daily run assigns one instead, the same for everyone that day. Your 81 home games are played there; road games use each opponent’s own 2025 park. Each stadium card shows the field outline, line and center distances, wall heights, roof, and elevation; estimated measurements are labelled. A stadium has no rating or bonus. It changes play only through the ball-flight model described below.</p>

			<h3>Current replays and published sharing</h3>
			<p>Replay schema 8, model <code>contact-v2</code>, and rules <code>classic-v8</code> are the only supported gameplay contract. A replay stores versioned draft inputs, the chosen home stadium and its geometry version, the bullpen's relief roles, and the authoritative roll, added-pack, pack-choice, pick, and reassignment action history under an opaque ID. The recipient validates and recomputes that history; an older schema, model, rules version, or dataset is rejected with a new-draft path instead of being interpreted by a legacy engine.</p>
			<p>Simulation and share capture run in your browser. Starting a season prepares the artwork’s assets; once the season is computed, the browser stores the replay and prepares the Field, Cards and link-preview images. Drawing and encoding wait for playback to finish. The server checks the replay contract, PNG dimensions and season record, then stores the first publication immutably; it does not recompute the season. Links can be shared while images are preparing. A capture error preserves the replay for an explicit retry; unavailable image clipboard access offers Download PNG instead.</p>
		</div>
	</section>

	<section id="simulation">
		<p class="section-number" aria-hidden="true">03</p>
		<div>
			<h2>How games are played</h2>
			<p>Every game runs one plate appearance at a time. The batter’s and pitcher’s stats set the chances of a walk, hit batter, strikeout, or ball in play. For a ball in play, the game simulates its flight and the fielders’ attempt to reach it.</p>

			<ul>
				<li><strong>Players:</strong> each selected season is adjusted for its era and home park, so hitters from different decades face the same league conditions. Hitters get a small advantage against opposite-handed pitchers.</li>
				<li><strong>Ballparks:</strong> fence distance, wall height, and elevation affect where a ball lands. A home run has to clear the wall. Parks don’t give players a blanket stat bonus.</li>
				<li><strong>Defense and speed:</strong> fielders’ range, errors, and throwing affect balls in play. Runner speed and the opposing arm affect extra bases and steals.</li>
				<li><strong>Pitching:</strong> your three starters get 54 starts each. Their historical innings per start set their usual workload. Bullpen roles determine who takes over, and relievers need rest after long or consecutive outings.</li>
			</ul>

			<p>Season stats and awards come from the simulated plays, not the players’ historical totals. Ball flight and defensive skills are estimates built from the available records. There are no injuries or weather effects.</p>
		</div>
	</section>

	<section id="head-to-head">
		<p class="section-number" aria-hidden="true">04</p>
		<div>
			<h2>Head-to-head series</h2>
			<p>Choose two saved decks in <a href="/seasons">My teams</a> to play a best-of-five. My teams also accepts replay links, either short <code>/r/</code> links or inline replay links from this site. Both replays must use the same game version. Each regular season is recomputed first to set seeds: more wins is seed 1. Equal records give seed 1 to the replay whose canonical link sorts first; two identical replays give it to Team A.</p>
			<p>The series follows a 2-2-1 format. Seed 1 hosts games 1, 2, and 5, which fall on calendar days 1, 2, 4, 5, and 7. Each game is played in the host’s chosen home stadium. Rotations cycle through the three drafted starters, and the closer’s rest and workload carry across days under the season rules. The random seed comes from the unordered pair of replay keys, so the same two links always produce the same games in either order (rules <code>h2h-bo5-v1</code>, seed policy <code>replay-pair-v1</code>).</p>
			<p>Game and series MVP (<code>realized-runs-v1</code>) go to the individual on either team with the highest unrounded batting, baserunning, defense, and pitching runs above neutral. The pooled support bullpen is not a candidate. Ties go to the replay whose canonical link sorts first, then the season ID. Series superlatives (<code>realized-runs-awards-v1</code>) use the same tie rule on one component each: Top bat for batting runs, Ace for pitching runs, Glove for defensive runs, Wheels for baserunning runs, and LVP for the lowest total. Glove and Wheels are left out when no one reaches 0.05 runs. Highlights and lowlights are the largest win-expectancy swings from Team A’s side. A series link carries both replay links and optional team names, and recomputes the series when opened; nothing about a series is stored on the server.</p>

			<h3>Your saved seasons</h3>
			<p>Every season you complete is saved in this browser, separate from the draft in progress, and kept until you delete it. You can rename or delete a season, choose it for head-to-head in My teams, or copy a challenge link, which publishes the replay and copies its short link, or the inline replay link when publishing fails. A season from an older game version stays visible as retired, with its roster and record, but cannot play head-to-head.</p>
		</div>
	</section>

	<section id="rankings">
		<p class="section-number" aria-hidden="true">05</p>
		<div>
			<h2>How the season list is ranked</h2>
			<p>By default the draft list sorts by a composite wins-above-replacement rate called JEFFBAGWELL, taken from Neil Paine’s pinned historical WAR dataset. It averages Baseball-Reference and FanGraphs WAR, and for pitchers it also averages a runs-allowed-based estimate, then expresses every season per 162 team games. Hitters rank by its batting value and pitchers by its pitching value, so the two groups are never compared against each other on one scale. You can switch the list back to the batting and pitching metrics the simulator uses for matchup rates.</p>
			<p>A collected team bullpen card has no individual WAR; its included and excluded pitcher-seasons remain visible in its card details.</p>

			<h3>What the ranking is not</h3>
			<p>The composite batting/pitching WAR/162 scalar is context and comparison only: it orders draft choices and selects cosmetic finishes, but never makes a player stronger in a matchup. The same pinned file separately supplies <code>fld162</code> fielding evidence to <code>defense-v2</code>; that position-aware, residualized estimate is disclosed independently and must not be confused with the composite WAR scalar. Rate statistics from shortened seasons are not adjusted for games played, missing values show as unavailable rather than zero, and an incomplete latest-year capture is excluded rather than extrapolated. Neither external source is presented as an internally reproduced Baseball-Reference, FanGraphs, or proprietary scouting model.</p>

			<div class="ranking-source">
				<dl>
					<div><dt>Dataset</dt><dd>JEFFBAGWELL historical WAR, 1901–2025</dd></div>
					<div><dt>Credit</dt><dd>Neil Paine, averaging Baseball-Reference and FanGraphs WAR</dd></div>
					<div><dt>Licence</dt><dd><a href="https://github.com/Neil-Paine-1/MLB-WAR-data-historical/blob/master/LICENSE.txt" rel="license">MIT</a></dd></div>
					<div><dt>Source</dt><dd><a href="https://github.com/Neil-Paine-1/MLB-WAR-data-historical">github.com/Neil-Paine-1/MLB-WAR-data-historical</a></dd></div>
				</dl>
				<p class="muted">The historical WAR/162 scalar stays separate from simulated statistics and from the app’s realized <code>sim-war-v2</code> estimate. Most event and fielding counts come from the Lahman data described on <a href="/credits">Data and image credits</a>; the separately joined <code>fld162</code> column helps set the bounded aggregate defensive budget. Baseball-Reference and FanGraphs each publish their own WAR definition; JEFFBAGWELL is a third-party average and is labelled as such everywhere it appears.</p>
			</div>
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
	#simulation p + ul, #simulation ul + p { margin-top: 1.25rem; }

	.ranking-source {
		margin-top: 1.75rem;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 1rem;
		background: var(--surface);
	}

	.ranking-source dl { margin-top: 0; }


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






	@media (max-width: 38rem) {
		.about { width: min(100% - 1.25rem, 70rem); }
		.about > section { grid-template-columns: 1fr; gap: 0.4rem; }
		.section-number { margin-bottom: 0.5rem; }
	}
</style>
