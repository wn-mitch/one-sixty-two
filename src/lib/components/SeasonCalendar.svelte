<script lang="ts">
	import { tick } from 'svelte';
	import { dateGames, formatGameDate, opponentSeries, seasonMonths } from '#lib/game/season-calendar.ts';
	import type { GameResult } from '#lib/sim/types.ts';
	import GameBoxScore from './GameBoxScore.svelte';
	import TeamLogo from './TeamLogo.svelte';

	/**
	 * The season as a pocket schedule: month cards with every date, home games shaded, and each
	 * result printed in its square; a doubleheader prints both games in one date. "By opponent"
	 * regroups the same games into season series.
	 * Choosing any game opens its inning line and box score beneath.
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

	function abbreviation(game: GameResult): string {
		return game.opponentId.slice(0, 3).toUpperCase();
	}

	function gameLabel(game: GameResult): string {
		const date = dates.get(game.number);
		return `Game ${game.number}${date ? `, ${formatGameDate(date)}` : ''}, ${game.isHome ? 'vs.' : 'at'} ${game.opponentName}, ${game.win ? 'won' : 'lost'} ${game.challengeRuns}–${game.opponentRuns}`;
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

{#snippet doubleheader(first: GameResult, second: GameResult, day: number)}
	<span class="cell doubleheader" class:home={first.isHome}>
		<span class="date" aria-hidden="true">{day}</span>
		<b aria-hidden="true">{first.isHome ? '' : '@'}{abbreviation(first)} <small>DH</small></b>
		{#each [first, second] as game (game.number)}
			<button
				type="button"
				class="half"
				class:win={game.win}
				class:loss={!game.win}
				aria-label={`${gameLabel(game)}, doubleheader game ${game === first ? 1 : 2}`}
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
		aria-label={gameLabel(game)}
		aria-pressed={selectedNumber === game.number}
		aria-controls="season-game-detail"
		onclick={() => void choose(game)}
	>
		{#if day !== undefined}<span class="date" aria-hidden="true">{day}</span>{/if}
		<b aria-hidden="true">{game.isHome ? '' : '@'}{abbreviation(game)}</b>
		<span class="result" aria-hidden="true">{game.win ? 'W' : 'L'} {game.challengeRuns}-{game.opponentRuns}</span>
	</button>
{/snippet}

<div class="season-calendar">
	<div class="toolbar">
		<div class="view-toggle" role="group" aria-label="Game log view">
			<button type="button" aria-pressed={view === 'calendar'} onclick={() => view = 'calendar'}>Calendar</button>
			<button type="button" aria-pressed={view === 'opponents'} onclick={() => view = 'opponents'}>By opponent</button>
		</div>
		<p class="legend" aria-hidden="true"><span class="swatch home"></span>Home <span class="swatch"></span>Away <b>@</b></p>
	</div>

	{#if view === 'calendar'}
		<div class="months">
			{#each months as month (month.month)}
				<section class="month" aria-label={`${month.name}, ${month.wins}–${month.losses}`}>
					<header><h4>{month.name}</h4><span>{month.wins}–{month.losses}</span></header>
					<div class="grid">
						{#each WEEKDAYS as weekday}<span class="weekday" aria-hidden="true">{weekday}</span>{/each}
						{#each { length: month.lead } as _}<span class="cell blank" aria-hidden="true"></span>{/each}
						{#each month.days as entry (entry.day)}
							{#if entry.games.length === 2}{@render doubleheader(entry.games[0], entry.games[1], entry.day)}
							{:else if entry.games.length}{@render gameCell(entry.games[0], entry.day)}
							{:else}<span class="cell off" aria-hidden="true"><span class="date">{entry.day}</span></span>{/if}
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<ol class="opponents">
			{#each series as entry (entry.opponentId)}
				<li class="opponent">
					<span class="club"><TeamLogo franchiseId={entry.opponentId} year={2025} label={entry.opponentName} size="small" /><span>{entry.opponentName}</span></span>
					<strong class="record" class:winning={entry.wins > entry.losses} class:losing={entry.wins < entry.losses}>{entry.wins}–{entry.losses}</strong>
					<span class="runs">{entry.runsFor}–{entry.runsAgainst} runs</span>
					<span class="series-games">{#each entry.games as game (game.number)}{@render gameCell(game)}{/each}</span>
				</li>
			{/each}
		</ol>
	{/if}

	<div bind:this={detail} id="season-game-detail" class="detail" class:open={!!selected} aria-live="polite">
		{#if selected}
			{@const date = dates.get(selected.number)}
			<header>
				<h4>Game {selected.number}{#if date}<span> · {formatGameDate(date)}</span>{/if} · {selected.isHome ? 'vs.' : 'at'} {selected.opponentName}</h4>
				<strong class:win={selected.win} class:loss={!selected.win}>{selected.win ? 'W' : 'L'} {selected.challengeRuns}–{selected.opponentRuns}</strong>
				<button type="button" class="quiet" onclick={() => selectedNumber = null}>Close</button>
			</header>
			{#key selected.number}<GameBoxScore game={selected} idPrefix="season-game-{selected.number}" collapseBoxes />{/key}
		{/if}
	</div>
</div>

<style>
	.season-calendar { --home-ground: color-mix(in oklch, var(--accent) 20%, var(--surface)); display: grid; gap: var(--space-4); min-width: 0; }
	.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
	.view-toggle { display: inline-flex; padding: 2px; border: 1px solid var(--border); border-radius: 999px; }
	.view-toggle button { min-height: 2.5rem; padding: 0 var(--space-4); border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: var(--text-sm); }
	.view-toggle button[aria-pressed='true'] { background: var(--text); color: var(--background); }
	.legend { display: flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.swatch { width: .8rem; height: .8rem; border: 1px solid var(--border); border-radius: 2px; }
	.swatch.home { background: var(--home-ground); }

	.months { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16.5rem), 1fr)); gap: var(--space-4); align-items: start; }
	.month { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	.month header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--space-2); }
	.month h4 { margin: 0; font: italic 900 1.25rem/1 'Barlow Condensed', sans-serif; text-transform: uppercase; }
	.month header span { color: var(--muted); font-size: var(--text-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
	.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
	.weekday { color: var(--muted); font-size: .625rem; font-weight: 700; text-align: center; }
	.cell { position: relative; display: grid; place-items: center; align-content: center; min-width: 0; aspect-ratio: 1 / 1.05; border-radius: 3px; }
	.cell .date { position: absolute; top: 2px; left: 3px; color: var(--muted); font-size: .5625rem; line-height: 1; }
	.cell.off { background: color-mix(in oklch, var(--surface-raised) 35%, transparent); }
	.cell.game { min-height: 0; padding: .55rem 0 0; border: 1px solid var(--border); background: transparent; color: var(--text); font: inherit; gap: 1px; }
	.cell.game.home { background: var(--home-ground); border-color: transparent; }
	.cell.game:hover { background: var(--surface-raised); }
	.cell.game[aria-pressed='true'] { outline: 2px solid var(--focus); outline-offset: 1px; z-index: 1; }
	.cell.doubleheader { padding-top: .55rem; gap: 0; background: transparent; border: 1px solid var(--border); }
	.cell.doubleheader.home { background: var(--home-ground); border-color: transparent; }
	.cell b small { color: var(--accent); font-size: .5rem; }
	.half { display: block; min-height: 0; width: 100%; padding: 0; border: 0; border-radius: 2px; background: transparent; line-height: 1; }
	.half:hover { background: var(--surface-raised); }
	.half[aria-pressed='true'] { outline: 2px solid var(--focus); }
	.half .result { font-size: .5rem; }
	.cell b { font: 800 .6875rem/1 'Barlow Condensed', sans-serif; letter-spacing: .02em; }
	.cell .result { font-size: .5625rem; font-weight: 750; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.win .result, strong.win { color: var(--success); }
	.loss .result, strong.loss { color: var(--error); }

	.opponents { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 30rem), 1fr)); gap: 0 var(--space-6); margin: 0; padding: 0; list-style: none; }
	.opponent { display: grid; grid-template-columns: minmax(0, 1fr) 3rem 5.5rem auto; align-items: center; gap: var(--space-3); min-height: 2.75rem; border-bottom: 1px solid var(--border); font-size: var(--text-sm); }
	.club { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
	.club > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.record { font-variant-numeric: tabular-nums; text-align: right; }
	.record.winning { color: var(--success); }
	.record.losing { color: var(--error); }
	.runs { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.series-games { display: grid; grid-template-columns: repeat(6, 2.4rem); gap: 2px; }
	.series-games .cell { aspect-ratio: auto; height: 2.1rem; padding-top: 0; }

	.detail { display: none; }
	.detail.open { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); scroll-margin-block: var(--space-6); }
	.detail header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
	.detail h4 { flex: 1; margin: 0; font-size: var(--text-base); }
	.detail h4 span { color: var(--muted); font-weight: 600; }

	@media (max-width: 40rem) {
		.opponent { grid-template-columns: minmax(0, 1fr) 3rem; padding-block: var(--space-2); }
		.runs { display: none; }
		.series-games { grid-column: 1 / -1; grid-template-columns: repeat(6, minmax(0, 1fr)); }
	}
</style>
