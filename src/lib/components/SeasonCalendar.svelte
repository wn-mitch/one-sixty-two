<script lang="ts">
	import { tick } from 'svelte';
	import { dateGames, formatGameDate, opponentSeries, seasonMonths, streakEnds, venueRecords, type CalendarMonth } from '#lib/game/season-calendar.ts';
	import type { GameResult } from '#lib/sim/types.ts';
	import GameBoxScore from './GameBoxScore.svelte';
	import TeamLogo from './TeamLogo.svelte';

	/**
	 * The season as a pocket schedule: month cards with every date, home games shaded, and each
	 * result printed in its square; a doubleheader prints both games in one date. "By opponent"
	 * regroups the same games into season series.
	 * Choosing any game opens its inning line and box score directly under its week or series.
	 * The last game of every streak of three or more carries the streak's length.
	 */
	let { games, seed }: { games: GameResult[]; seed: number } = $props();

	const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
	let view = $state<'calendar' | 'opponents'>('calendar');
	let selectedNumber = $state<number | null>(null);
	let detail = $state<HTMLElement>();
	const months = $derived(seasonMonths(games, seed));
	const series = $derived(opponentSeries(games));
	const dates = $derived(new Map(dateGames(games, seed).map(entry => [entry.game.number, entry.date])));
	const selected = $derived(selectedNumber === null ? null : games.find(game => game.number === selectedNumber) ?? null);
	const streaks = $derived(streakEnds(games));
	const venues = $derived(venueRecords(games));

	/** True for the day after which the selected game's detail opens: the end of its week, or the month's last day. */
	function detailAfter(month: CalendarMonth, index: number): boolean {
		if (selectedNumber === null) return false;
		const chosen = month.days.findIndex(entry => entry.games.some(game => game.number === selectedNumber));
		if (chosen < 0) return false;
		const weekEnd = Math.ceil((month.lead + chosen + 1) / 7) * 7 - month.lead - 1;
		return index === Math.min(weekEnd, month.days.length - 1);
	}

	function abbreviation(game: GameResult): string {
		return game.opponentId.slice(0, 3).toUpperCase();
	}

	function gameLabel(game: GameResult): string {
		const date = dates.get(game.number);
		return `Game ${game.number}${date ? `, ${formatGameDate(date)}` : ''}, ${game.isHome ? 'vs.' : 'at'} ${game.opponentName}, ${game.win ? 'won' : 'lost'} ${game.challengeRuns}–${game.opponentRuns}`;
	}

	function streakLabel(game: GameResult): string {
		const streak = streaks.get(game.number);
		return streak ? `, ends a ${streak.length}-game ${streak.win ? 'winning' : 'losing'} streak` : '';
	}

	async function choose(game: GameResult): Promise<void> {
		if (selectedNumber === game.number) {
			selectedNumber = null;
			return;
		}
		selectedNumber = game.number;
		await tick();
		detail?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
</script>

{#snippet streakTag(game: GameResult)}
	{@const streak = streaks.get(game.number)}
	{#if streak}<span class="streak" class:win={streak.win} class:loss={!streak.win} aria-hidden="true">{streak.win ? 'W' : 'L'}{streak.length}</span>{/if}
{/snippet}

{#snippet detailPanel(game: GameResult)}
	{@const date = dates.get(game.number)}
	<div bind:this={detail} id="season-game-detail" class="detail" aria-live="polite">
		<header>
			<h4>Game {game.number}{#if date}<span> · {formatGameDate(date)}</span>{/if} · {game.isHome ? 'vs.' : 'at'} {game.opponentName}</h4>
			<strong class:win={game.win} class:loss={!game.win}>{game.win ? 'W' : 'L'} {game.challengeRuns}–{game.opponentRuns}</strong>
			<button type="button" class="quiet" onclick={() => selectedNumber = null}>Close</button>
		</header>
		{#key game.number}<GameBoxScore {game} idPrefix="season-game-{game.number}" collapseBoxes />{/key}
	</div>
{/snippet}

{#snippet doubleheader(first: GameResult, second: GameResult, day: number)}
	<span class="cell doubleheader" class:home={first.isHome}>
		<span class="date" aria-hidden="true">{day}</span>
		{@render streakTag(streaks.has(second.number) ? second : first)}
		<b aria-hidden="true">{first.isHome ? '' : '@'}{abbreviation(first)} <small>DH</small></b>
		{#each [first, second] as game (game.number)}
			<button
				type="button"
				class="half"
				class:win={game.win}
				class:loss={!game.win}
				aria-label={`${gameLabel(game)}, doubleheader game ${game === first ? 1 : 2}${streakLabel(game)}`}
				aria-pressed={selectedNumber === game.number}
				aria-controls="season-game-detail"
				onclick={() => void choose(game)}
			><span class="result" aria-hidden="true">{game.win ? 'W' : 'L'} {game.challengeRuns}-{game.opponentRuns}</span></button>
		{/each}
	</span>
{/snippet}

{#snippet gameCell(game: GameResult, day?: number)}
	<button
		type="button"
		class="cell game"
		class:home={game.isHome}
		class:win={game.win}
		class:loss={!game.win}
		aria-label={`${gameLabel(game)}${streakLabel(game)}`}
		aria-pressed={selectedNumber === game.number}
		aria-controls="season-game-detail"
		onclick={() => void choose(game)}
	>
		{#if day !== undefined}<span class="date" aria-hidden="true">{day}</span>{/if}
		{@render streakTag(game)}
		<b aria-hidden="true">{game.isHome ? '' : '@'}{abbreviation(game)}</b>
		<span class="result" aria-hidden="true">{game.win ? 'W' : 'L'} {game.challengeRuns}-{game.opponentRuns}</span>
	</button>
{/snippet}

{#snippet seriesGame(game: GameResult)}
	<button
		type="button"
		class="chip"
		class:win={game.win}
		class:loss={!game.win}
		aria-label={gameLabel(game)}
		aria-pressed={selectedNumber === game.number}
		aria-controls="season-game-detail"
		onclick={() => void choose(game)}
	><span class="venue" aria-hidden="true">{game.isHome ? 'vs' : '@'}</span><span class="score" aria-hidden="true">{game.challengeRuns}–{game.opponentRuns}</span></button>
{/snippet}

<div class="season-calendar">
	<div class="toolbar">
		<div class="view-toggle" role="group" aria-label="Game log view">
			<button type="button" aria-pressed={view === 'calendar'} onclick={() => view = 'calendar'}>Calendar</button>
			<button type="button" aria-pressed={view === 'opponents'} onclick={() => view = 'opponents'}>By opponent</button>
		</div>
		<p class="venues"><span>Home <b>{venues.home.wins}–{venues.home.losses}</b></span><span>Away <b>{venues.away.wins}–{venues.away.losses}</b></span></p>
		{#if view === 'calendar'}<p class="legend" aria-hidden="true"><span class="swatch home"></span>Home <span class="swatch"></span>Away <b>@</b> <span class="streak win">W5</span>streak</p>{/if}
	</div>

	{#if view === 'calendar'}
		<div class="months">
			{#each months as month (month.month)}
				<section class="month" class:expanded={!!selected && month.days.some(entry => entry.games.some(game => game.number === selectedNumber))} aria-label={`${month.name}, ${month.wins}–${month.losses}`}>
					<header><h4>{month.name}</h4><span>{month.wins}–{month.losses}</span></header>
					<div class="weekdays" aria-hidden="true">{#each WEEKDAYS as weekday}<span class="weekday">{weekday}</span>{/each}</div>
					<div class="grid">
						{#each { length: month.lead } as _}<span class="cell blank" aria-hidden="true"></span>{/each}
						{#each month.days as entry, index (entry.day)}
							{#if entry.games.length === 2}{@render doubleheader(entry.games[0], entry.games[1], entry.day)}
							{:else if entry.games.length}{@render gameCell(entry.games[0], entry.day)}
							{:else}<span class="cell off" aria-hidden="true"><span class="date">{entry.day}</span></span>{/if}
							{#if selected && detailAfter(month, index)}<div class="detail-row">{@render detailPanel(selected)}</div>{/if}
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<ol class="opponents">
			{#each series as entry (entry.opponentId)}
				<li class="opponent">
					<span class="club"><TeamLogo franchiseId={entry.opponentId} year={2025} label={entry.opponentName} size="small" /><span class="club-copy"><span class="club-name">{entry.opponentName}</span><span class="runs">{entry.runsFor}–{entry.runsAgainst} runs</span></span></span>
					<strong class="record" class:winning={entry.wins > entry.losses} class:losing={entry.wins < entry.losses}>{entry.wins}–{entry.losses}</strong>
					<span class="series-games">{#each entry.games as game (game.number)}{@render seriesGame(game)}{/each}</span>
				</li>
				{#if selected && entry.games.some(game => game.number === selectedNumber)}<li class="detail-row">{@render detailPanel(selected)}</li>{/if}
			{/each}
		</ol>
	{/if}

</div>

<style>
	.season-calendar { --home-ground: color-mix(in oklch, var(--accent) 20%, var(--surface)); display: grid; gap: var(--space-4); min-width: 0; }
	.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
	.view-toggle { display: inline-flex; padding: 2px; border: 1px solid var(--border); border-radius: 999px; }
	.view-toggle button { min-height: 2.5rem; padding: 0 var(--space-4); border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: var(--text-sm); }
	.view-toggle button[aria-pressed='true'] { background: var(--text); color: var(--background); }
	.venues { display: flex; gap: var(--space-4); margin: 0 auto 0 0; color: var(--muted); font-size: var(--text-sm); }
	.venues b { color: var(--text); font-variant-numeric: tabular-nums; }
	.streak { position: absolute; top: 2px; right: 3px; font: 800 clamp(.5rem, 2.3cqi, .6875rem)/1 'Barlow Condensed', sans-serif; letter-spacing: .02em; }
	.legend .streak { position: static; }
	.streak.win { color: var(--success); }
	.streak.loss { color: var(--error); }
	.legend { display: flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.swatch { width: .8rem; height: .8rem; border: 1px solid var(--border); border-radius: 2px; }
	.swatch.home { background: var(--home-ground); }

	.months { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: var(--space-4); align-items: start; }
	.month { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface);  container-type: inline-size;}
	.month > header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--space-2); }
	.month > header h4 { margin: 0; font: italic 900 1.25rem/1 'Barlow Condensed', sans-serif; text-transform: uppercase; }
	.month > header span { color: var(--muted); font-size: var(--text-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
	/*
	 * Cell type scales with the month's width within readable bounds. Every week row takes the height of
	 * the tallest square in the month, so a doubleheader never leaves uneven squares.
	 */
	.weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; margin-bottom: 2px; }
	.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: minmax(calc((100cqi - 12px) / 7 * 1.1), 1fr); gap: 2px; }
	/* An open game detail is its own row; week rows then size to their own squares. */
	.grid:has(.detail-row) { grid-auto-rows: minmax(calc((100cqi - 12px) / 7 * 1.1), auto); }
	.weekday { color: var(--muted); font-size: .625rem; font-weight: 700; text-align: center; }
	.cell { position: relative; display: grid; place-items: center; align-content: center; min-width: 0; min-height: 0; overflow: hidden; border-radius: 3px; }
	.cell .date { position: absolute; top: 2px; left: 3px; color: var(--muted); font-size: clamp(.5rem, 2.4cqi, .6875rem); line-height: 1; }
	.cell.off { background: color-mix(in oklch, var(--surface-raised) 35%, transparent); }
	.cell.game { min-height: 0; padding: clamp(.55rem, 3.2cqi, .8rem) 0 0; border: 1px solid var(--border); background: transparent; color: var(--text); font: inherit; gap: 2px; }
	.cell.game.home { background: var(--home-ground); border-color: transparent; }
	.cell.game:hover { background: var(--surface-raised); }
	.cell.game[aria-pressed='true'] { outline: 2px solid var(--focus); outline-offset: 1px; z-index: 1; }
	.cell.doubleheader { align-content: center; grid-template-rows: auto auto auto; padding: clamp(.5rem, 2.8cqi, .75rem) 0 1px; gap: 0; background: transparent; border: 1px solid var(--border); }
	.cell.doubleheader.home { background: var(--home-ground); border-color: transparent; }
	.cell b small { color: var(--accent); font-size: .8em; }
	.half { display: block; min-height: 0; width: 100%; padding: 0; font: inherit; font-size: clamp(.5rem, 2.3cqi, .6875rem); border: 0; border-radius: 2px; background: transparent; line-height: 1; }
	.half:hover { background: var(--surface-raised); }
	.half[aria-pressed='true'] { outline: 2px solid var(--focus); }
	.half .result { font-size: clamp(.5rem, 2.3cqi, .6875rem); }
	.cell.doubleheader b { font-size: clamp(.5625rem, 2.6cqi, .8125rem); }
	.cell b { font: 800 clamp(.625rem, 3cqi, .875rem)/1 'Barlow Condensed', sans-serif; letter-spacing: .02em; white-space: nowrap; }
	.cell .result { font-size: clamp(.5rem, 2.5cqi, .75rem); font-weight: 750; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.win .result, strong.win { color: var(--success); }
	.loss .result, strong.loss { color: var(--error); }

	.opponents { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 34rem), 1fr)); gap: 0 var(--space-6); margin: 0; padding: 0; list-style: none; }
	.opponent { display: grid; grid-template-columns: minmax(0, 1fr) 2.5rem auto; align-items: center; gap: var(--space-3); min-height: 3rem; border-bottom: 1px solid var(--border); font-size: var(--text-sm); }
	.club { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
	.club-copy { display: grid; min-width: 0; line-height: 1.25; }
	.club-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.record { font-variant-numeric: tabular-nums; text-align: right; }
	.record.winning { color: var(--success); }
	.record.losing { color: var(--error); }
	.runs { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; white-space: nowrap; }
	/* Each series game is a result-tinted chip: venue marker, then the score with this club's runs first. */
	.series-games { display: grid; grid-template-columns: repeat(6, 3.125rem); gap: 3px; }
	.chip { display: flex; align-items: center; justify-content: center; gap: .25em; min-width: 0; min-height: 2rem; padding: 0 .25rem; border: 1px solid transparent; border-radius: 999px; font: inherit; font-size: var(--text-xs); line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.chip.win { background: color-mix(in oklch, var(--success) 16%, transparent); border-color: color-mix(in oklch, var(--success) 35%, transparent); }
	.chip.loss { background: color-mix(in oklch, var(--error) 14%, transparent); border-color: color-mix(in oklch, var(--error) 32%, transparent); }
	.chip:hover { border-color: var(--text); }
	.chip[aria-pressed='true'] { outline: 2px solid var(--focus); outline-offset: 1px; }
	.venue { color: var(--muted); font-size: .625rem; font-weight: 700; text-transform: uppercase; }
	.score { font-weight: 800; }
	.chip.win .score { color: var(--success); }
	.chip.loss .score { color: var(--error); }

	.detail-row { grid-column: 1 / -1; list-style: none; padding-block: var(--space-2); }
	.month.expanded { grid-column: 1 / -1; }
	.detail { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); scroll-margin-block: var(--space-6); }
	.detail header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
	.detail h4 { flex: 1; margin: 0; font-size: var(--text-base); }
	.detail h4 span { color: var(--muted); font-weight: 600; }

	@media (max-width: 40rem) {
		.opponent { grid-template-columns: minmax(0, 1fr) 3rem; padding-block: var(--space-2); }
		.series-games { grid-column: 1 / -1; grid-template-columns: repeat(6, minmax(0, 1fr)); }
	}
</style>
