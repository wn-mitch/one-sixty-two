<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
	import type { Draft, Manifest, Profile } from '../game/types.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import { innings } from '../game/format.ts';
	import { MVP_TIE_RULE, SERIES_TIE_RULE, type SeriesAward, type SeriesGame, type SeriesResult, type SeriesSuperlative, type SeriesSuperlativeKind, type SeriesTeamId } from '../sim/series-types.ts';
	import GameBoxScore from './GameBoxScore.svelte';
	import SeriesSwings from './SeriesSwings.svelte';
	import { tableScroll } from './table-scroll.ts';
	import TeamBoxTables from './TeamBoxTables.svelte';

	interface Props {
		result: SeriesResult;
		manifest: Manifest;
		profiles: Record<SeriesTeamId, Profile[]>;
		drafts: Record<SeriesTeamId, Draft>;
		copyStatus: string;
		onCopy: () => void;
		onAgain: () => void;
	}
	let { result, manifest, profiles, drafts, copyStatus, onCopy, onAgain }: Props = $props();

	/** A best-of-five always reserves five game columns, so a sweep still shows its unplayed games. */
	const GAME_SLOTS = [1, 2, 3, 4, 5] as const;

	let media = $state.raw<MediaManifest | null>(null);
	let mediaStatus = $state<CardMediaStatus>('loading');
	onMount(() => {
		let live = true;
		loadMedia().then(value => { if (live) { media = value; mediaStatus = 'ready'; } }).catch(() => { if (live) mediaStatus = 'unavailable'; });
		return () => { live = false; };
	});

	const team = (id: SeriesTeamId) => result.teams.find(entry => entry.id === id)!;
	let champion = $derived(team(result.championId));
	let runnerUp = $derived(team(result.championId === 'team-a' ? 'team-b' : 'team-a'));
	let bySeed = $derived([...result.teams].sort((a, b) => a.seed - b.seed));
	let tiedRecords = $derived(result.teams[0].record.wins === result.teams[1].record.wins);
	let clincher = $derived(result.games.at(-1)!);

	const runsFor = (game: SeriesGame, id: SeriesTeamId) => game.homeTeamId === id ? game.result.home.runs : game.result.away.runs;
	const gameAt = (number: number) => result.games.find(entry => entry.number === number);

	/** Series state after a game, as a broadcast would read it. */
	function seriesState(score: Record<SeriesTeamId, number>): string {
		const a = score['team-a'];
		const b = score['team-b'];
		if (a === b) return `Series tied ${a}–${b}`;
		const leader = team(a > b ? 'team-a' : 'team-b');
		return `${leader.name} ${Math.max(a, b) === 3 ? 'win' : 'lead'} ${Math.max(a, b)}–${Math.min(a, b)}`;
	}

	function award(value: SeriesAward | null) {
		if (!value) return null;
		const profile = profiles[value.teamId].find(entry => entry.seasonId === value.seasonId);
		const slot = drafts[value.teamId].picks.find(pick => pick.seasonId === value.seasonId)?.slot ?? null;
		return { value, profile, view: profile ? createCardViewModel({ profile, slot, media, manifest, mediaStatus }) : null };
	}
	let seriesMvp = $derived(award(result.mvp));

	function runs(value: number): string {
		return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
	}
	function components(value: SeriesAward) {
		return [['Batting', value.batting], ['Running', value.running], ['Defense', value.defense], ['Pitching', value.pitching]] as const;
	}

	const SUPERLATIVE_LABELS: Record<SeriesSuperlativeKind, { title: string; measure: string }> = {
		'top-bat': { title: 'Top bat', measure: 'batting runs' },
		ace: { title: 'Ace', measure: 'pitching runs' },
		glove: { title: 'Glove', measure: 'defensive runs' },
		wheels: { title: 'Wheels', measure: 'baserunning runs' },
		lvp: { title: 'LVP', measure: 'runs' }
	};

	/** The award's run value and a box-score line from the series totals. */
	function superlative({ kind, award }: SeriesSuperlative) {
		const box = team(award.teamId).totals;
		const bat = box.batting.find(line => line.seasonId === award.seasonId);
		const arm = box.pitching.find(line => line.seasonId === award.seasonId);
		const batLine = bat && bat.PA > 0 ? `${bat.H}-for-${bat.AB}, ${bat.HR} HR, ${bat.RBI} RBI` : '';
		const armLine = arm && arm.BF > 0 ? `${innings(arm.outs)} IP, ${arm.SO} K, ${arm.R} R` : '';
		const value = { 'top-bat': award.batting, ace: award.pitching, glove: award.defense, wheels: award.running, lvp: award.runs }[kind];
		const line = {
			'top-bat': batLine,
			ace: armLine,
			glove: bat ? `${bat.fieldingOuts} outs in the field` : '',
			wheels: bat ? `${bat.SB} SB, ${bat.CS} CS` : '',
			lvp: batLine || armLine
		}[kind];
		return { kind, award, value, line, ...SUPERLATIVE_LABELS[kind] };
	}
	let superlatives = $derived(result.superlatives.map(superlative));

	const noDetails = () => {};
</script>

<section class="series-results" aria-labelledby="series-heading">
	<header class="scorebug">
		<div class="verdict">
			<p class="eyebrow">Best-of-five · Final</p>
			<h1 id="series-heading" tabindex="-1">{champion.name} win {result.score[champion.id]}–{result.score[runnerUp.id]}</h1>
			<p class="clinch">Clinched in Game {clincher.number} at {clincher.stadiumName}.</p>
		</div>

		<div class="actions">
			<button class="primary" type="button" onclick={onCopy}>Copy series link</button>
			<button class="secondary" type="button" onclick={onAgain}>Play another series</button>
			<p class="copy-status" role="status">{copyStatus}</p>
		</div>

		<div class="table-scroll series-line" role="region" aria-label="Series line score" use:tableScroll>
			<table>
				<caption class="sr-only">Runs by game and series wins for each club</caption>
				<thead>
					<tr>
						<th scope="col"><span class="sr-only">Club</span></th>
						{#each GAME_SLOTS as number (number)}<th scope="col" class="game-col">G{number}</th>{/each}
						<th scope="col" class="wins-col"><abbr title="Series wins">W</abbr></th>
					</tr>
				</thead>
				<tbody>
					{#each bySeed as entry (entry.id)}
						<tr class:champion={entry.id === champion.id}>
							<th scope="row" class="seeds">
								<span class="seed">Seed {entry.seed}</span>
								<span class="club">{entry.name}</span>
								<span class="club-meta">{entry.record.wins}–{entry.record.losses} · {entry.homeStadiumName}</span>
							</th>
							{#each GAME_SLOTS as number (number)}
								{@const game = gameAt(number)}
								{#if game}
									<td class="game-col" class:won={game.winnerId === entry.id}>
										{runsFor(game, entry.id)}<span class="sr-only">{game.winnerId === entry.id ? ', won' : ', lost'}</span>
									</td>
								{:else}
									<td class="game-col unplayed"><span aria-hidden="true">·</span><span class="sr-only">Not played</span></td>
								{/if}
							{/each}
							<td class="wins-col">{result.score[entry.id]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if tiedRecords}<p class="note">{SERIES_TIE_RULE}</p>{/if}
	</header>

	{#if seriesMvp}
		<section class="mvp" aria-labelledby="series-mvp-heading">
			{#if seriesMvp.view}
				<div class="mvp-card"><Card s={seriesMvp.view} face="front" onDetails={noDetails} /></div>
			{/if}
			<div class="mvp-copy">
				<p class="eyebrow">Series MVP · {team(seriesMvp.value.teamId).name}</p>
				<h2 id="series-mvp-heading">{seriesMvp.value.displayName}</h2>
				<p class="mvp-total"><strong>{runs(seriesMvp.value.runs)}</strong> runs</p>
				<dl class="mvp-split">
					{#each components(seriesMvp.value) as [name, amount] (name)}
						<div class:quiet={Math.abs(amount) < 0.05}><dt>{name}</dt><dd>{runs(amount)}</dd></div>
					{/each}
				</dl>
				<p class="note">Realized runs across the series. {MVP_TIE_RULE}</p>
			</div>
		</section>
	{/if}

	{#if superlatives.length}
		<section class="awards" aria-labelledby="series-awards-heading">
			<h2 id="series-awards-heading" class="sr-only">Series superlatives</h2>
			<ul class="award-row">
				{#each superlatives as item (item.kind)}
					<li class="award" class:lvp={item.kind === 'lvp'}>
						<p class="award-title">{item.title}</p>
						<p class="award-name">{item.award.displayName}</p>
						<p class="award-team">{team(item.award.teamId).name}</p>
						<p class="award-value"><strong>{runs(item.value)}</strong> {item.measure}</p>
						{#if item.line}<p class="award-line">{item.line}</p>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<SeriesSwings {result} />

	<section class="games" aria-labelledby="series-games-heading">
		<div class="section-heading">
			<h2 id="series-games-heading">Box scores</h2>
			<p>{result.games.length} games</p>
		</div>
		<div class="game-list">
			{#each result.games as game (game.number)}
				{@const sides = [game.awayTeamId, game.homeTeamId]}
				<article class="game" aria-labelledby={`series-game-${game.number}-heading`}>
					<header class="game-head">
						<h3 class="game-number" id={`series-game-${game.number}-heading`}><strong>Game {game.number}</strong><small>Day {game.day}</small></h3>
						<p class="game-score">
							{#each sides as id, index (id)}
								<span class="side" class:won={game.winnerId === id}>
									<span class="side-name">{index === 0 ? '' : '@ '}{team(id).name}</span>
									<span class="side-runs">{runsFor(game, id)}</span>
								</span>
							{/each}
						</p>
						<p class="game-meta">
							<span class="game-state">{seriesState(game.score)}</span>
							{#if game.mvp}<span>MVP {game.mvp.displayName}</span>{/if}
						</p>
					</header>
					<GameBoxScore game={game.result} label={`Game ${game.number}`} idPrefix={`series-game-${game.number}`} collapseBoxes />
				</article>
			{/each}
		</div>
	</section>

	<section class="totals" aria-labelledby="series-totals-heading">
		<div class="section-heading">
			<h2 id="series-totals-heading">Series totals</h2>
			<p>{result.games.length} games</p>
		</div>
		<TeamBoxTables boxes={result.teams.map(entry => entry.totals)} label="the series" idPrefix="series-totals" />
	</section>
</section>

<style>
	.series-results { display: grid; gap: var(--space-12); padding-block: var(--space-6) var(--space-10); min-width: 0; }
	p { margin: 0; }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, var(--text-score)); font-weight: 850; line-height: 1; letter-spacing: -.04em; text-wrap: balance; }
	h1:focus { outline: none; }
	h2 { margin: 0; font-size: var(--text-xl); }
	.note { max-width: 68ch; color: var(--muted); font-size: var(--text-xs); }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-1) var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border); }
	.section-heading > p { color: var(--muted); font-size: var(--text-xs); }

	/* Scorebug: verdict, actions, and the series line score on one tonal ground. */
	.scorebug { display: grid; gap: var(--space-6); padding: var(--space-6) var(--space-4); background: var(--surface); border-block: 1px solid var(--border); }
	.verdict { display: grid; gap: var(--space-3); }
	.verdict .eyebrow { margin: 0; }
	.clinch { color: var(--muted); }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
	.copy-status { flex-basis: 100%; min-height: 1.25rem; color: var(--muted); font-size: var(--text-xs); }
	.copy-status:empty { display: none; }

	.series-line { min-width: 0; }
	.series-line table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
	.series-line th, .series-line td { padding: var(--space-2) var(--space-1); text-align: center; }
	.series-line thead th { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; border-bottom: 1px solid var(--border); }
	.series-line tbody tr + tr { border-top: 1px solid var(--border); }
	.series-line abbr { text-decoration: none; }
	.series-line .seeds { display: grid; gap: 2px; padding-left: 0; text-align: left; }
	.seed { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
	.club { color: var(--text); font-size: var(--text-base); font-weight: 750; overflow-wrap: anywhere; }
	.club-meta { color: var(--muted); font-size: var(--text-xs); font-weight: 500; }
	.game-col { width: 1.75rem; color: var(--muted); font-size: var(--text-sm); }
	.game-col.won { color: var(--text); font-weight: 800; }
	.game-col.unplayed { color: var(--border); }
	.wins-col { width: 2.75rem; padding-right: 0 !important; border-left: 1px solid var(--border); }
	tbody .wins-col { color: var(--muted); font-size: var(--text-2xl); font-weight: 850; line-height: 1; }
	tr.champion .wins-col { color: var(--accent); }
	tr.champion .seed { color: var(--accent); }

	.mvp { display: flex; flex-wrap: wrap; gap: var(--space-6); align-items: center; }
	.mvp-card { flex: none; width: min(13rem, 52vw); }
	.mvp-copy { display: grid; flex: 1 1 15rem; gap: var(--space-2); max-width: 36rem; min-width: 0; }
	.mvp-copy .eyebrow { margin: 0; }
	.mvp-copy h2 { font-size: var(--text-2xl); line-height: 1.1; }
	.mvp-total { color: var(--muted); }
	.mvp-total strong { color: var(--accent); font-size: var(--text-xl); font-variant-numeric: tabular-nums; }
	.mvp-split { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: var(--space-2) 0; border-block: 1px solid var(--border); }
	.mvp-split div { padding: var(--space-2) var(--space-1); }
	.mvp-split div + div { border-left: 1px solid var(--border); padding-left: var(--space-3); }
	.mvp-split dt { color: var(--muted); font-size: var(--text-xs); }
	.mvp-split dd { margin: var(--space-1) 0 0; font-weight: 750; font-variant-numeric: tabular-nums; }
	.mvp-split .quiet dd { color: var(--muted); font-weight: 500; }

	.awards { min-width: 0; margin-top: calc(-1 * var(--space-6)); }
	/* Two columns on phones; one divided row from 48rem. */
	.award-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 var(--space-4); margin: 0; padding: 0; list-style: none; border-block: 1px solid var(--border); }
	.award { display: grid; align-content: start; gap: 2px; min-width: 0; padding-block: var(--space-4); }
	.award-title { margin-bottom: var(--space-1); color: var(--accent); font-size: var(--text-xs); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
	.award.lvp .award-title { color: var(--error); }
	.award-name { font-size: var(--text-base); font-weight: 750; overflow-wrap: anywhere; }
	.award-team, .award-line { color: var(--muted); font-size: var(--text-xs); }
	.award-value { margin-top: var(--space-1); color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.award-value strong { color: var(--text); font-size: var(--text-base); }
	.games, .totals { display: grid; gap: var(--space-4); min-width: 0; }
	.game-list { display: grid; gap: var(--space-8); min-width: 0; }
	.game { display: grid; min-width: 0; }
	.game-head { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: var(--space-2) var(--space-4); align-items: center; padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
	.game-number { display: grid; grid-row: span 2; align-self: start; margin: 0; font-size: inherit; }
	.game-number strong { font-size: var(--text-lg); font-weight: 850; }
	.game-number small { color: var(--muted); font-size: var(--text-xs); font-weight: 500; }
	.game-score { display: grid; gap: 2px; color: var(--muted); }
	.side { display: flex; justify-content: space-between; gap: var(--space-3); }
	.side-name { min-width: 0; overflow-wrap: anywhere; }
	.side-runs { font-variant-numeric: tabular-nums; }
	.side.won { color: var(--text); font-weight: 750; }
	.game-meta { display: grid; gap: 2px; grid-column: 2; color: var(--muted); font-size: var(--text-xs); }
	.game-state { color: var(--text); font-weight: 650; }

	@media (min-width: 48rem) {
		.award-row { grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0; }
		.award { padding-right: var(--space-4); }
		.award + .award { padding-left: var(--space-4); border-left: 1px solid var(--border); }
		.scorebug { grid-template-columns: minmax(0, 1fr) auto; align-items: end; padding: var(--space-8); }
		.actions { justify-content: flex-end; }
		.copy-status { text-align: right; }
		.series-line, .scorebug > .note { grid-column: 1 / -1; }
		.game-col { width: 3.5rem; font-size: var(--text-lg); }
		.wins-col { width: 5rem; }
		tbody .wins-col { font-size: var(--text-3xl); }
		.game-head { grid-template-columns: 5rem minmax(12rem, 22rem) minmax(0, 1fr); }
		.game-number { grid-row: auto; align-self: center; }
		.game-meta { grid-column: 3; }
	}
</style>
