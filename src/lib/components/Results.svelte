<script lang="ts">
	import { onMount } from 'svelte';
	import type { Draft, Profile } from '#lib/game/types.ts';
	import { draftRules } from '#lib/game/rules.ts';
	import { innings } from '#lib/game/format.ts';
	import type { PitcherLine, SeasonResult } from '#lib/sim/types.ts';
	import GameDetails from './GameDetails.svelte';
	import PlayerPhoto from './PlayerPhoto.svelte';
	import PlayerCard from './PlayerCard.svelte';
	import AtmosphereImage from './AtmosphereImage.svelte';
	import SeasonMoments from './SeasonMoments.svelte';
	import { loadRankings } from '#lib/rankings/client.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';
	import { isHitter, warValue } from './candidate-ranking.ts';

	interface Props {
		result: SeasonResult;
		draft: Draft;
		profiles: Profile[];
		onNew: () => void;
		onShare: () => void;
		shareLink: string;
		shareStatus: string;
	}

	let { result, draft, profiles, onNew, onShare, shareLink, shareStatus }: Props = $props();

	let profileById = $derived(new Map(profiles.map((profile) => [profile.seasonId, profile])));
	let rosterOpen = $state(false);
	let rankings = $state.raw<WarRankings | null>(null);
	onMount(() => {
		let active = true;
		void loadRankings(draft.dataVersion).then(value => { if (active) rankings = value; })
			.catch(() => { if (active) rankings = null; });
		return () => { active = false; };
	});

	function pitcherName(line: PitcherLine): string {
		return line.displayName;
	}

	function ra9(line: PitcherLine): string {
		return line.outs > 0 ? (line.R * 27 / line.outs).toFixed(2) : '–';
	}

	function selectShareLink(event: FocusEvent | MouseEvent): void {
		(event.currentTarget as HTMLTextAreaElement).select();
	}

	function jumpTo(id: string): void {
		const heading = document.getElementById(id);
		heading?.focus({ preventScroll: true });
		heading?.scrollIntoView({ block: 'start' });
	}
</script>

<section class="results" aria-labelledby="results-heading">
	<header class="scoreboard">
		<div class="record-block"><p class="eyebrow">Your club · Season final</p>
		<h2 id="results-heading" tabindex="-1" aria-label={`Final record: ${result.wins} wins and ${result.losses} losses`}><span>{result.wins}<small>W</small></span><i>–</i><span>{result.losses}<small>L</small></span></h2>
		<p class:perfect={result.firstLoss === null} class="verdict">
			{result.firstLoss === null ? '162-0. Perfection.' : `First loss: Game ${result.firstLoss}`}
		</p>
		</div>
		<dl class="season-ledger">
			<div><dt>Longest streak</dt><dd>{result.longestWinningStreak} W</dd></div>
			<div><dt>Runs scored</dt><dd>{result.runsFor}</dd></div>
			<div><dt>Runs allowed</dt><dd>{result.runsAgainst}</dd></div>
			<div><dt>Run difference</dt><dd>{result.runsFor - result.runsAgainst > 0 ? '+' : ''}{result.runsFor - result.runsAgainst}</dd></div>
		</dl>
	</header>
	<section class="share-block" aria-labelledby="share-heading">
		<div>
			<p class="eyebrow">Run it back</p>
			<h3 id="share-heading">Share this roster</h3>
			<p class="muted">We save the draft and hand back a short link. Your friend’s browser recomputes the season from it.</p>
		</div>
		<button class="primary" type="button" onclick={onShare}>Share result</button>
		<button class="secondary" type="button" onclick={onNew}>New draft</button>
		{#if shareLink}
			<label for="share-link">Replay link</label>
			<textarea id="share-link" readonly rows="2" value={shareLink} onfocus={selectShareLink} onclick={selectShareLink}></textarea>
		{/if}
		{#if shareStatus}
			<p class="share-status" role="status" aria-live="polite">{shareStatus}</p>
		{/if}
	</section>
	<SeasonMoments {result} />
	<div class="baseball-atmosphere">
		<p class="eyebrow">Baseball atmosphere · Not the simulated venue</p>
		<AtmosphereImage id="camden-atmosphere" compact />
	</div>

	<nav class="result-nav" aria-label="Season results sections"><button class="quiet" type="button" onclick={() => jumpTo('batting-heading')}>Batting</button><button class="quiet" type="button" onclick={() => jumpTo('pitching-heading')}>Pitching</button><button class="quiet" type="button" onclick={() => jumpTo('game-log-heading')}>All 162 games <span aria-hidden="true">↓</span></button></nav>

	<section class="season-totals" aria-labelledby="batting-heading">
		<div class="section-heading">
			<div>
				<p class="eyebrow">162-game totals</p>
				<h3 id="batting-heading" tabindex="-1">Batting</h3>
			</div>
			<p>Every plate appearance, including all games after the first loss.</p>
		</div>
		<div class="table-scroll" tabindex="0" role="region" aria-label="Season batting totals">
			<table>
				<thead>
					<tr>
						<th scope="col">Batter</th><th scope="col">PA</th><th scope="col">AB</th><th scope="col">H</th>
						<th scope="col">2B</th><th scope="col">3B</th><th scope="col">HR</th><th scope="col">BB</th>
						<th scope="col">HBP</th><th scope="col">SO</th><th scope="col">R</th><th scope="col">RBI</th>
						<th scope="col">SB</th><th scope="col">CS</th><th scope="col">SF</th>
					</tr>
				</thead>
				<tbody>
					{#each result.batting as line}
						{@const profile = profileById.get(line.seasonId)}
						<tr>
							<th scope="row"><div class="stat-identity">{#if profile}<PlayerPhoto playerId={profile.playerId} year={profile.year} name={line.displayName} size="small" credits={false} />{/if}<span>{line.displayName}{#if profile}<small>Drafted {profile.year}</small>{/if}</span></div></th><td>{line.PA}</td><td>{line.AB}</td><td>{line.H}</td>
							<td>{line.doubles}</td><td>{line.triples}</td><td>{line.HR}</td><td>{line.BB}</td>
							<td>{line.HBP}</td><td>{line.SO}</td><td>{line.R}</td><td>{line.RBI}</td>
							<td>{line.SB}</td><td>{line.CS}</td><td>{line.SF}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="season-totals" aria-labelledby="pitching-heading">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Outs-based workload</p>
				<h3 id="pitching-heading" tabindex="-1">Pitching</h3>
			</div>
			<p>RA9 is runs allowed per nine innings. It is not simulated ERA.</p>
		</div>
		<div class="table-scroll" tabindex="0" role="region" aria-label="Season pitching totals">
			<table class="pitching-table">
				<thead>
					<tr>
						<th scope="col">Pitcher</th><th scope="col">IP</th><th scope="col">H</th><th scope="col">BB</th>
						<th scope="col">HBP</th><th scope="col">SO</th><th scope="col">R</th><th scope="col">RA9</th>
						<th scope="col">Starts</th><th scope="col">App.</th>
					</tr>
				</thead>
				<tbody>
					{#each result.pitching as line}
						{@const profile = profileById.get(line.seasonId)}
						<tr>
							<th scope="row"><div class="stat-identity">{#if profile && line.role !== 'support'}<PlayerPhoto playerId={profile.playerId} year={profile.year} name={line.displayName} size="small" credits={false} />{/if}<span>{pitcherName(line)}{#if profile && line.role !== 'support'}<small>Drafted {profile.year}</small>{/if}</span></div></th><td>{innings(line.outs)}</td><td>{line.H}</td><td>{line.BB}</td>
							<td>{line.HBP}</td><td>{line.SO}</td><td>{line.R}</td><td>{ra9(line)}</td>
							<td>{line.starts}</td><td>{line.appearances}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="support-note muted">Support bullpen covers every relief inning not assigned to your closer.</p>
	</section>

	<details class="roster-review" bind:open={rosterOpen}>
		<summary>Review the {draftRules(draft.schemaVersion).slots.length}-pick roster</summary>
		{#if rosterOpen}
		<ol>
			{#each draft.picks as pick}
				{@const profile = profileById.get(pick.seasonId)}
				<li>
					{#if profile}
						<PlayerCard {profile} assignedSlot={pick.slot} war={warValue({ profile, slots: [pick.slot] }, isHitter(pick.slot) ? 'Hitters' : 'Pitchers', rankings)} />
					{:else}
						<p>Unavailable profile · {pick.slot} · {pick.seasonId}</p>
					{/if}
				</li>
			{/each}
		</ol>
		{/if}
	</details>

	<section class="game-log" aria-label="All 162 games">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Every score counts</p>
				<h3 id="game-log-heading" tabindex="-1">All {result.games.length} games</h3>
			</div>
			<p>Open any game for its inning line and complete box score.</p>
		</div>
		<div class="game-list">
			{#each result.games as game (game.number)}
				<GameDetails {game} />
			{/each}
		</div>
	</section>

</section>

<style>
	.results { display: grid; gap: var(--space-8); min-width: 0; }
	.scoreboard { display: grid; gap: var(--space-6); padding: var(--space-6); background: var(--surface); border-block: 1px solid var(--border); }
	.record-block .eyebrow { margin: 0 0 var(--space-3); }
	.scoreboard h2 { display: flex; align-items: baseline; gap: var(--space-2); margin: 0; font-size: var(--text-score); font-weight: 850; line-height: 1; letter-spacing: -.05em; }
	.scoreboard h2 > span { display: inline-flex; align-items: baseline; gap: var(--space-2); }
	.scoreboard h2 small { color: var(--muted); font-size: var(--text-sm); font-weight: 650; letter-spacing: 0; }
	.scoreboard h2 i { color: var(--muted); font-size: var(--text-2xl); font-style: normal; font-weight: 500; }
	.verdict { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--text-sm); }
	.verdict.perfect { color: var(--success); }
	.season-ledger { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4) var(--space-6); margin: 0; padding-top: var(--space-4); border-top: 1px solid var(--border); }
	dt { color: var(--muted); font-size: var(--text-xs); }
	dd { margin: var(--space-1) 0 0; font-size: var(--text-lg); font-weight: 750; }
	.season-totals, .game-log { display: grid; gap: var(--space-4); min-width: 0; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-6); }
	.section-heading .eyebrow { margin: 0 0 var(--space-2); }
	.section-heading h3, .share-block h3 { font-size: var(--text-xl); }
	.section-heading > p { max-width: 32rem; margin: 0; color: var(--muted); font-size: var(--text-sm); text-align: right; }
	table { width: 100%; min-width: 50rem; font-size: var(--text-sm); }
	.pitching-table { min-width: 42rem; }
	th, td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
	th:first-child { position: sticky; left: 0; z-index: 1; max-width: 16rem; background: var(--background); text-align: left; }
	thead th { color: var(--muted); font-size: var(--text-xs); text-transform: uppercase; }
	tbody th { color: var(--text); }
	.stat-identity { display: flex; align-items: center; gap: var(--space-3); min-width: 10rem; max-width: 14rem; white-space: normal; }
	.stat-identity > span { min-width: 0; overflow-wrap: anywhere; }
	.stat-identity small { display: block; color: var(--muted); font-size: var(--text-xs); font-weight: 500; margin-top: var(--space-1); }
	.support-note { margin: 0; font-size: var(--text-xs); }
	.roster-review { border-block: 1px solid var(--border); }
	.roster-review summary { font-weight: 700; }
	.roster-review ol { display: grid; gap: var(--space-6); grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); margin: var(--space-4) 0; padding: 0; list-style: none; }
	.roster-review li { min-width: 0; }
	.game-list { border-top: 1px solid var(--border); min-width: 0; }
	.share-block { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
	.share-block > div { flex: 1 1 100%; }
	.share-block .eyebrow { margin: 0 0 var(--space-2); }
	.share-block p { max-width: 58ch; margin: var(--space-2) 0 0; font-size: var(--text-sm); }
	.share-block label, .share-block textarea, .share-status { flex: 1 1 100%; }
	.share-block label { color: var(--muted); font-size: var(--text-xs); font-weight: 700; }
	.share-block textarea { width: 100%; font-size: var(--text-sm); resize: vertical; }
	.share-status { color: var(--success); }
	.result-nav { display: flex; flex-wrap: wrap; gap: var(--space-4); border-block: 1px solid var(--border); }
	.result-nav button { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; font-size: var(--text-sm); }
	@media (min-width: 48rem) {
		.scoreboard { grid-template-columns: 1fr 1fr; align-items: center; gap: var(--space-8); }
		.season-ledger { padding-top: 0; border-top: 0; }
		.share-block > div { flex: 1; }
	}
	@media (max-width: 30rem) {
		.scoreboard { padding: var(--space-4); }
		.scoreboard h2 { font-size: var(--text-3xl); }
		.section-heading { display: block; }
		.section-heading > p { margin-top: var(--space-2); text-align: left; }
	}
</style>
