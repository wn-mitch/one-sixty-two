<script lang="ts">
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { LibraryView } from '../../game/library.ts';
	import { average, innings, onBase, ra9, rate, slugging, teamTitle, teamTotals } from '../../game/library-stats.ts';
	import type { SeriesRecord } from '../../game/series-history.ts';
	import { tableScroll } from '../table-scroll.ts';

	/** One saved club: its roster as cards, season lines, head-to-head history, and its actions. */
	let { entry, cards, history, tally, onCopy, onRename, onDelete, onClose }: {
		entry: LibraryView;
		cards: ReadonlyMap<string, CardViewModel>;
		history: readonly SeriesRecord[];
		tally: { won: number; lost: number };
		onCopy: (entry: LibraryView) => void;
		onRename: (entry: LibraryView, nickname: string) => void;
		onDelete: (entry: LibraryView) => void;
		onClose: () => void;
	} = $props();

	let renaming = $state(false);
	let draftName = $state('');
	const totals = $derived(teamTotals(entry));
	const differential = $derived(totals.runDifferential);
	const saved = $derived(new Date(entry.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
	const noDetails = () => {};
	const war = (value: number) => value.toFixed(1);

	function startRename(): void {
		draftName = entry.nickname ?? '';
		renaming = true;
	}
	function submitRename(event: SubmitEvent): void {
		event.preventDefault();
		onRename(entry, draftName);
		renaming = false;
	}
	function outcome(record: SeriesRecord): { opponent: string; text: string } {
		const mine = record.teams.find(side => side.libraryKey === entry.key) ?? record.teams[0];
		const other = record.teams.find(side => side !== mine) ?? record.teams[1];
		const won = record.championKey === entry.key;
		return { opponent: other.name, text: `${won ? 'Won' : 'Lost'} ${mine.wins}–${other.wins}` };
	}
</script>

<section class="team" aria-labelledby="team-heading">
	<header>
		<div class="heading">
			<p class="eyebrow">{entry.status === 'retired' ? 'Retired club' : 'Saved club'} · {saved}</p>
			<h2 id="team-heading">{teamTitle(entry)}</h2>
			<p class="facts">
				<strong>{entry.record.wins}–{entry.record.losses}</strong>
				<span>{differential > 0 ? '+' : differential < 0 ? '−' : ''}{Math.abs(differential)} runs</span>
				<span>{entry.stadium?.name ?? 'No home park'}</span>
				{#if tally.won || tally.lost}<span>Head-to-head series {tally.won}–{tally.lost}</span>{/if}
			</p>
		</div>
		<button type="button" class="close" aria-label="Back to all-time leaders" onclick={onClose}>✕</button>
	</header>

	{#if entry.status === 'retired'}
		<p class="retired-note">Made with an older version of the game. It stays here as a memento but can no longer play head-to-head.</p>
	{/if}

	{#if renaming}
		<form class="rename" onsubmit={submitRename}>
			<label for={`name-${entry.key}`}>Nickname</label>
			<input id={`name-${entry.key}`} bind:value={draftName} maxlength="60" />
			<button class="primary small" type="submit">Save</button>
			<button class="small" type="button" onclick={() => renaming = false}>Cancel</button>
		</form>
	{:else}
		<div class="actions">
			{#if entry.status === 'playable'}<button type="button" class="small" onclick={() => onCopy(entry)}>Copy challenge link</button>{/if}
			<button type="button" class="small" onclick={startRename} aria-label={`Rename ${teamTitle(entry)}`}>Rename</button>
			<button type="button" class="small quiet danger" onclick={() => onDelete(entry)} aria-label={`Delete ${teamTitle(entry)}`}>Delete</button>
		</div>
	{/if}

	<ul class="roster" aria-label="Roster">
		{#each entry.roster as pick (pick.seasonId)}
			{@const view = cards.get(pick.seasonId)}
			<li>
				{#if view}
					<span class="card" aria-hidden="true"><Card s={view} face="front" compact thumbnail interactive={false} onDetails={noDetails} /></span>
				{:else}
					<span class="card placeholder" aria-hidden="true">{pick.slot}</span>
				{/if}
				<span class="caption"><span class="slot">{pick.slot}</span> {pick.label}</span>
			</li>
		{/each}
	</ul>

	<div class="table-scroll stat-table-scroll" use:tableScroll role="region" aria-label={`${teamTitle(entry)} batting`}>
		<table class="stat-table compact-table">
			<caption>Batting · team {rate(totals.avg)}/{rate(totals.obp)}/{rate(totals.slg)}</caption>
			<thead><tr><th scope="col">Batter</th><th scope="col">Pos</th><th scope="col">PA</th><th scope="col">AVG</th><th scope="col">OBP</th><th scope="col">SLG</th><th scope="col" class="stat-key">HR</th><th scope="col">RBI</th><th scope="col">SB</th><th scope="col" class="stat-key">WAR</th></tr></thead>
			<tbody>
				{#each entry.batting as line (line.seasonId)}
					<tr><th scope="row">{line.label}</th><td>{line.slot}</td><td>{line.PA}</td><td>{rate(average(line))}</td><td>{rate(onBase(line))}</td><td>{rate(slugging(line))}</td><td class="stat-key">{line.HR}</td><td>{line.RBI}</td><td>{line.SB}</td><td class="stat-key">{war(line.war)}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="table-scroll stat-table-scroll" use:tableScroll role="region" aria-label={`${teamTitle(entry)} pitching`}>
		<table class="stat-table compact-table">
			<caption>Pitching · {totals.SO} strikeouts</caption>
			<thead><tr><th scope="col">Pitcher</th><th scope="col">Pos</th><th scope="col">GS</th><th scope="col">IP</th><th scope="col" class="stat-key">RA9</th><th scope="col">SO</th><th scope="col">BB</th><th scope="col" class="stat-key">WAR</th></tr></thead>
			<tbody>
				{#each entry.pitching as line (line.seasonId)}
					<tr><th scope="row">{line.label}</th><td>{line.slot}</td><td>{line.starts}</td><td>{innings(line.outs)}</td><td class="stat-key">{ra9(line).toFixed(2)}</td><td>{line.SO}</td><td>{line.BB}</td><td class="stat-key">{war(line.war)}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<section class="series" aria-labelledby="team-series-heading">
		<h3 id="team-series-heading">Head-to-head history</h3>
		{#if history.length}
			<ol>
				{#each history as record (record.id)}
					{@const result = outcome(record)}
					<li><a href={record.link}>{result.text} vs {result.opponent}</a> <span class="muted">{new Date(record.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></li>
				{/each}
			</ol>
		{:else}
			<p class="muted">No series yet. Ctrl- or Cmd-click another club, or use Compare, to set one up.</p>
		{/if}
	</section>
</section>

<style>
	.team { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); min-width: 0; }
	header { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
	.heading { display: grid; gap: var(--space-1); min-width: 0; }
	.eyebrow { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	h2 { margin: 0; font: italic 900 clamp(1.6rem, 3vw, 2.1rem) / 1 'Barlow Condensed', sans-serif; text-transform: uppercase; overflow-wrap: anywhere; }
	.facts { display: flex; flex-wrap: wrap; gap: .25rem .75rem; margin: 0; color: var(--muted); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
	.facts strong { color: var(--text); }
	.close { display: grid; place-items: center; flex: none; width: 2.75rem; padding: 0; font-size: 1.1rem; }
	.retired-note { margin: 0; color: var(--muted); font-size: var(--text-sm); }
	.actions, .rename { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
	.small { min-height: 2.25rem; padding: .25rem .75rem; font-size: var(--text-sm); }
	.danger { color: var(--error); }
	.rename label { width: 100%; font-size: var(--text-sm); }
	.rename input { flex: 1 1 12rem; }
	.roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.75rem, 1fr)); gap: var(--space-3) var(--space-2); margin: 0; padding: 0; list-style: none; }
	.roster li { display: grid; gap: .3rem; align-content: start; min-width: 0; }
	.card { display: block; }
	.placeholder { display: grid; place-items: center; aspect-ratio: 5 / 7; border: 1px dashed var(--border); border-radius: .4rem; color: var(--muted); font-size: var(--text-xs); font-weight: 800; }
	.caption { font-size: .7rem; line-height: 1.2; overflow-wrap: anywhere; }
	.slot { color: var(--muted); font-weight: 800; }
	.compact-table { min-width: 34rem; }
	caption { padding: .5rem .6rem; text-align: left; font-size: var(--text-sm); font-weight: 750; }
	.series { display: grid; gap: var(--space-2); }
	h3 { margin: 0; font-size: var(--text-sm); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
	.series ol { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); }
	.series a { color: var(--text); font-weight: 650; }
	.series p { margin: 0; font-size: var(--text-sm); }
</style>
