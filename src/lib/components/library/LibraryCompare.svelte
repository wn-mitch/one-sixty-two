<script lang="ts">
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import { libraryLink, type LibraryView } from '../../game/library.ts';
	import { rate, stars, teamTitle, teamTotals } from '../../game/library-stats.ts';
	import { seriesHash } from '../../game/replay-link.ts';
	import { seriesBetween, type SeriesRecord } from '../../game/series-history.ts';

	/** Tale of the tape for two saved clubs, their past meetings, and the way into a new series. */
	let { a, b, cards, history, onClose }: {
		a: LibraryView;
		b: LibraryView;
		cards: ReadonlyMap<string, ReadonlyMap<string, CardViewModel>>;
		history: readonly SeriesRecord[];
		onClose: () => void;
	} = $props();

	const sides = $derived([a, b].map(entry => ({ entry, totals: teamTotals(entry), star: stars(entry, 1)[0] })));
	const meetings = $derived(seriesBetween(history, a.key, b.key));
	const playable = $derived(a.status === 'playable' && b.status === 'playable');
	const href = $derived(`/h2h${seriesHash({
		'team-a': { link: libraryLink(a), name: a.nickname ?? '' },
		'team-b': { link: libraryLink(b), name: b.nickname ?? '' }
	})}`);
	const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
	const rows = $derived([
		{ label: 'Record', values: sides.map(side => `${side.entry.record.wins}–${side.entry.record.losses}`), scores: sides.map(side => side.entry.record.wins) },
		{ label: 'Run differential', values: sides.map(side => signed(side.totals.runDifferential)), scores: sides.map(side => side.totals.runDifferential) },
		{ label: 'Runs per game', values: sides.map(side => side.totals.runsPerGame.toFixed(2)), scores: sides.map(side => side.totals.runsPerGame) },
		{ label: 'Allowed per game', values: sides.map(side => side.totals.allowedPerGame.toFixed(2)), scores: sides.map(side => -side.totals.allowedPerGame) },
		{ label: 'Team OPS', values: sides.map(side => rate(side.totals.ops)), scores: sides.map(side => side.totals.ops) },
		{ label: 'Home runs', values: sides.map(side => String(side.totals.HR)), scores: sides.map(side => side.totals.HR) },
		{ label: 'Stolen bases', values: sides.map(side => String(side.totals.SB)), scores: sides.map(side => side.totals.SB) },
		{ label: 'Strikeouts', values: sides.map(side => String(side.totals.SO)), scores: sides.map(side => side.totals.SO) },
		{ label: 'Estimated WAR', values: sides.map(side => side.totals.war.toFixed(1)), scores: sides.map(side => side.totals.war) }
	]);
	const edge = (scores: number[], index: number) => scores[index] > scores[1 - index];
	const wins = (key: string) => meetings.filter(record => record.championKey === key).length;
	const noDetails = () => {};
</script>

<section class="compare" aria-labelledby="compare-heading">
	<header>
		<div>
			<p class="eyebrow">Tale of the tape</p>
			<h2 id="compare-heading">{teamTitle(a)} <span class="vs">vs</span> {teamTitle(b)}</h2>
		</div>
		<button type="button" class="close" aria-label="Back to all-time leaders" onclick={onClose}>✕</button>
	</header>

	<div class="stars">
		{#each sides as side (side.entry.key)}
			{@const view = side.star ? cards.get(side.entry.key)?.get(side.star) : undefined}
			{@const label = side.entry.roster.find(pick => pick.seasonId === side.star)?.label}
			<figure>
				{#if view}<span class="card" aria-hidden="true"><Card s={view} face="front" compact thumbnail interactive={false} onDetails={noDetails} /></span>{/if}
				<figcaption><span class="muted">Star</span> {label ?? '—'}</figcaption>
			</figure>
		{/each}
	</div>

	<table class="tape">
		<caption class="sr-only">Season comparison</caption>
		<thead><tr><th scope="col">{teamTitle(a)}</th><th scope="col"><span class="sr-only">Statistic</span></th><th scope="col">{teamTitle(b)}</th></tr></thead>
		<tbody>
			{#each rows as row (row.label)}
				<tr>
					<td class:edge={edge(row.scores, 0)}>{row.values[0]}</td>
					<th scope="row">{row.label}</th>
					<td class:edge={edge(row.scores, 1)}>{row.values[1]}</td>
				</tr>
			{/each}
			<tr class="meetings">
				<td class:edge={wins(a.key) > wins(b.key)}>{wins(a.key)}</td>
				<th scope="row">Series won head-to-head</th>
				<td class:edge={wins(b.key) > wins(a.key)}>{wins(b.key)}</td>
			</tr>
		</tbody>
	</table>

	{#if playable}
		<a class="button primary play" {href}>Play best-of-five</a>
	{:else}
		<p class="muted note">A retired club can’t play head-to-head.</p>
	{/if}

	{#if meetings.length}
		<section aria-labelledby="meetings-heading">
			<h3 id="meetings-heading">Past meetings</h3>
			<ol>
				{#each meetings as record (record.id)}
					{@const champion = record.teams.find(side => side.libraryKey === record.championKey) ?? record.teams[0]}
					{@const other = record.teams.find(side => side !== champion) ?? record.teams[1]}
					<li><a href={record.link}>{champion.name} won {champion.wins}–{other.wins}</a> <span class="muted">{new Date(record.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></li>
				{/each}
			</ol>
		</section>
	{/if}
</section>

<style>
	.compare { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); min-width: 0; }
	header { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
	.eyebrow { margin: 0 0 var(--space-1); color: var(--accent); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	h2 { margin: 0; font: italic 900 clamp(1.4rem, 2.6vw, 1.9rem) / 1.05 'Barlow Condensed', sans-serif; text-transform: uppercase; overflow-wrap: anywhere; }
	.vs { color: var(--muted); font-size: .7em; }
	.close { display: grid; place-items: center; flex: none; width: 2.75rem; padding: 0; font-size: 1.1rem; }
	.stars { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
	figure { display: grid; justify-items: center; gap: var(--space-2); margin: 0; text-align: center; }
	.card { display: block; width: min(7rem, 100%); }
	figcaption { font-size: var(--text-sm); font-weight: 650; overflow-wrap: anywhere; }
	.tape { width: 100%; table-layout: fixed; border-collapse: collapse; font-variant-numeric: tabular-nums; }
	.tape thead th { padding-bottom: var(--space-2); font-size: var(--text-xs); color: var(--muted); white-space: normal; overflow-wrap: anywhere; vertical-align: bottom; }
	.tape thead th:first-child, .tape td:first-child { text-align: left; }
	.tape thead th:last-child, .tape td:last-child { text-align: right; }
	.tape thead th:nth-child(2), .tape tbody th { width: 38%; }
	.tape tbody th { padding: .45rem var(--space-2); color: var(--muted); font-size: var(--text-xs); font-weight: 650; text-align: center; }
	.tape td { padding: .45rem 0; font-weight: 650; }
	.tape tbody tr { border-top: 1px solid color-mix(in oklch, var(--border) 60%, transparent); }
	.edge { color: var(--accent); font-weight: 850; }
	.meetings { border-top: 1px solid var(--border) !important; }
	.play { justify-self: start; display: inline-flex; align-items: center; text-decoration: none; }
	.note { margin: 0; font-size: var(--text-sm); }
	h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
	ol { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); }
	ol a { color: var(--text); font-weight: 650; }
</style>
