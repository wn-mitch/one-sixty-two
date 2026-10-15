<script lang="ts">
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { LibraryView } from '../../game/library.ts';
	import { teamTitle } from '../../game/library-stats.ts';
	import { seasonGrade } from '../../game/grade.ts';
	import ClubCard from './ClubCard.svelte';

	/** One saved club as a team card. Ctrl/Cmd-click adds it to a comparison. */
	let { entry, stars, tally, selected, onSelect }: {
		entry: LibraryView;
		/** Star cards by value, best first; empty while profiles load or when the season is retired. */
		stars: readonly { seasonId: string; view: CardViewModel }[];
		tally: { won: number; lost: number };
		selected: boolean;
		onSelect: (event: MouseEvent | KeyboardEvent) => void;
	} = $props();

	const grade = $derived(seasonGrade(entry.record.wins, entry.record.losses));
	const played = $derived(new Date(entry.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
	const differential = $derived(entry.runs.scored - entry.runs.allowed);
	const stats = $derived([
		{ label: 'Runs', value: `${differential > 0 ? '+' : differential < 0 ? '−' : ''}${Math.abs(differential)}`, primary: true },
		{ label: 'Win %', value: (entry.record.wins / Math.max(1, entry.record.wins + entry.record.losses)).toFixed(3).replace(/^0/, '') },
		...(tally.won || tally.lost ? [{ label: 'H2H', value: `${tally.won}–${tally.lost}` }] : [])
	]);
</script>

<button type="button" class="tile" aria-pressed={selected} onclick={onSelect} data-entry={entry.key}>
	<ClubCard
		title={teamTitle(entry)}
		parkName={entry.stadium?.name ?? 'No home park'}
		recordLabel={`${entry.record.wins}–${entry.record.losses}`}
		{grade}
		{stats}
		footer={played}
		roster={entry.roster}
		{stars}
		retired={entry.status === 'retired'}
	/>
</button>

<style>
	.tile {
		display: block;
		width: 100%;
		min-height: 0;
		padding: 0;
		border: 0;
		border-radius: 2.4%;
		background: transparent;
		text-align: left;
		font-weight: inherit;
		transition: transform 220ms var(--ease-out);
	}
	.tile:hover:not(:disabled) { background: transparent; transform: translateY(-.2rem); }
	.tile:active:not(:disabled) { transform: translateY(0); }
	.tile[aria-pressed='true'] { outline: 3px solid var(--accent); outline-offset: 3px; }
	.tile:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
	@media (prefers-reduced-motion: reduce) { .tile { transition: none; } }
	:global([data-motion='off']) .tile { transition: none; }
</style>
