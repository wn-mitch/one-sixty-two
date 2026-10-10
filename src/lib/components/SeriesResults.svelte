<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
	import type { Draft, Manifest, Profile } from '../game/types.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import { MVP_TIE_RULE, SERIES_TIE_RULE, type SeriesAward, type SeriesMoment, type SeriesResult, type SeriesTeamId } from '../sim/series-types.ts';
	import GameBoxScore from './GameBoxScore.svelte';
	import { formatSeasonMoment } from './season-moment.ts';
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
	let tiedRecords = $derived(result.teams[0].record.wins === result.teams[1].record.wins);
	let labels = $derived({ challenge: team('team-a').name, opponent: team('team-b').name });

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
	function breakdown(value: SeriesAward): string {
		return [['batting', value.batting], ['running', value.running], ['defense', value.defense], ['pitching', value.pitching]]
			.filter(([, amount]) => Math.abs(amount as number) >= 0.05)
			.map(([name, amount]) => `${runs(amount as number)} ${name}`).join(' · ') || 'no measurable contribution';
	}
	function moment(value: SeriesMoment | null) {
		if (!value) return null;
		const game = result.games.find(entry => entry.number === value.gameNumber);
		return formatSeasonMoment(value, game?.result, labels);
	}
	let highlight = $derived(moment(result.highlight));
	let lowlight = $derived(moment(result.lowlight));
	const noDetails = () => {};
</script>

<section class="series-results" aria-labelledby="series-heading">
	<header class="verdict">
		<p class="eyebrow">Best-of-five final</p>
		<h1 id="series-heading" tabindex="-1">{champion.name} win {result.score[champion.id]}–{result.score[runnerUp.id]}</h1>
		<ul class="seeds">
			{#each [...result.teams].sort((a, b) => a.seed - b.seed) as entry (entry.id)}
				<li>
					<span class="seed">Seed {entry.seed}</span>
					<strong>{entry.name}</strong>
					<span class="muted">{entry.record.wins}–{entry.record.losses} · {entry.homeStadiumName}</span>
				</li>
			{/each}
		</ul>
		{#if tiedRecords}<p class="note muted">{SERIES_TIE_RULE}</p>{/if}
		<div class="actions">
			<button class="primary" type="button" onclick={onCopy}>Copy series link</button>
			<button class="secondary" type="button" onclick={onAgain}>Play another series</button>
		</div>
		<p class="copy-status muted" role="status">{copyStatus}</p>
	</header>

	{#if seriesMvp}
		<section class="mvp" aria-labelledby="series-mvp-heading">
			{#if seriesMvp.view}
				<div class="mvp-card"><Card s={seriesMvp.view} face="front" onDetails={noDetails} /></div>
			{/if}
			<div>
				<p class="eyebrow">Series MVP</p>
				<h2 id="series-mvp-heading">{seriesMvp.value.displayName}</h2>
				<p>{team(seriesMvp.value.teamId).name} · {runs(seriesMvp.value.runs)} runs</p>
				<p class="muted">{breakdown(seriesMvp.value)}</p>
				<p class="note muted">Most realized runs across the series: batting, baserunning, defense and pitching. {MVP_TIE_RULE}</p>
			</div>
		</section>
	{/if}

	{#if highlight || lowlight}
		<section class="moments" aria-labelledby="series-moments-heading">
			<h2 id="series-moments-heading">Series swings</h2>
			<p class="muted">Win chance is from {labels.challenge}'s side.</p>
			<div class="moment-grid">
				{#each [['Biggest lift for ' + labels.challenge, highlight], ['Biggest lift for ' + labels.opponent, lowlight]] as const as [title, copy] (title)}
					{#if copy}
						<article class="moment">
							<h3>{title}</h3>
							<p class="muted">{copy.matchup} · {copy.situation}</p>
							<p>{copy.action}</p>
							<p class="muted">{copy.score}</p>
							<p><strong>{copy.winChance}</strong> ({copy.swing}){#if copy.final} · {copy.final}{/if}</p>
						</article>
					{/if}
				{/each}
			</div>
		</section>
	{/if}

	<section class="games" aria-labelledby="series-games-heading">
		<h2 id="series-games-heading">Games</h2>
		{#each result.games as game (game.number)}
			{@const home = team(game.homeTeamId)}
			{@const away = team(game.awayTeamId)}
			<details>
				<summary>
					<span class="game-title">Game {game.number} · Day {game.day}</span>
					<span>{away.name} {game.result.away.runs}, {home.name} {game.result.home.runs}</span>
					<span class="muted">{game.stadiumName} · series {game.score['team-a']}–{game.score['team-b']}{#if game.mvp} · MVP {game.mvp.displayName}{/if}</span>
				</summary>
				<GameBoxScore game={game.result} idPrefix={`series-game-${game.number}`} />
			</details>
		{/each}
	</section>

	<section class="totals" aria-labelledby="series-totals-heading">
		<h2 id="series-totals-heading">Series totals</h2>
		<TeamBoxTables boxes={result.teams.map(entry => entry.totals)} label="the series" idPrefix="series-totals" />
	</section>
</section>

<style>
	.series-results { display: grid; gap: var(--space-10); padding-block: var(--space-8); min-width: 0; }
	.verdict { display: grid; gap: var(--space-3); }
	.eyebrow { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.5rem); line-height: 1.05; letter-spacing: -.03em; }
	h1:focus { outline: none; }
	h2 { margin: 0 0 var(--space-3); font-size: var(--text-xl); }
	h3 { margin: 0; font-size: var(--text-base); }
	.seeds { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
	.seeds li { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); align-items: baseline; }
	.seed { color: var(--accent); font-size: var(--text-xs); font-weight: 800; text-transform: uppercase; }
	.note { margin: 0; font-size: var(--text-xs); }
	.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
	.copy-status { min-height: 1.25rem; margin: 0; font-size: var(--text-xs); }
	.mvp { display: flex; flex-wrap: wrap; gap: var(--space-6); align-items: center; }
	.mvp p { margin: var(--space-1) 0; }
	.mvp-card { width: min(12rem, 45vw); }
	.moment-grid { display: grid; gap: var(--space-4); }
	.moment { display: grid; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
	.moment p { margin: 0; }
	details { border-top: 1px solid var(--border); min-width: 0; }
	details:last-of-type { border-bottom: 1px solid var(--border); }
	summary { display: grid; gap: var(--space-1); padding: var(--space-3) 0; cursor: pointer; }
	.game-title { font-weight: 750; }
	summary .muted { font-size: var(--text-xs); }
	.totals { display: grid; gap: var(--space-5); min-width: 0; }
	@media (min-width: 48rem) {
		.moment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
</style>
