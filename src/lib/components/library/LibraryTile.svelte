<script lang="ts">
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { LibraryView } from '../../game/library.ts';
	import { teamTitle } from '../../game/library-stats.ts';
	import { seasonGrade } from '../../game/grade.ts';
	import ClubCard from './ClubCard.svelte';
	import FlipIcon from '../../cards/FlipIcon.svelte';

	/** One saved club as a team card. Ctrl/Cmd-click adds it to a comparison. */
	let { entry, stars, tally, selected, onSelect }: {
		entry: LibraryView;
		/** Star cards by value, best first; empty while profiles load. */
		stars: readonly { seasonId: string; view: CardViewModel }[];
		tally: { won: number; lost: number };
		selected: boolean;
		onSelect: (event: MouseEvent | KeyboardEvent) => void;
	} = $props();

	let face = $state<'front' | 'back'>('front');
	const grade = $derived(seasonGrade(entry.record.wins, entry.record.losses));
	const played = $derived(new Date(entry.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
	const differential = $derived(entry.runs.scored - entry.runs.allowed);
	const stats = $derived([
		{ label: 'Runs', value: `${differential > 0 ? '+' : differential < 0 ? '−' : ''}${Math.abs(differential)}`, primary: true },
		{ label: 'Win %', value: (entry.record.wins / Math.max(1, entry.record.wins + entry.record.losses)).toFixed(3).replace(/^0/, '') },
		...(tally.won || tally.lost ? [{ label: 'H2H', value: `${tally.won}–${tally.lost}` }] : [])
	]);
</script>

<div class="club-tile">
<button type="button" class="tile" aria-pressed={selected} onclick={onSelect} data-entry={entry.key}>
	<ClubCard
		title={teamTitle(entry)}
		parkName={entry.stadium?.name ?? 'No home park'}
		recordLabel={`${entry.record.wins}–${entry.record.losses}`}
		{grade}
		{face}
		{stats}
		footer={played}
		roster={entry.roster}
		{stars}
		retired={entry.status === 'retired'}
	/>
</button>
	<button type="button" class="turn" aria-label={`${face === 'front' ? 'Turn over' : 'Show front'} ${teamTitle(entry)}`} aria-pressed={face === 'back'} onclick={() => face = face === 'front' ? 'back' : 'front'}>
		<FlipIcon />
	</button>
</div>

<style>
	.club-tile { position: relative; min-width: 0; container-type: inline-size; --club-control-space: 24px; --club-control-height: clamp(12px, 7cqw, 18px); }
	.turn { position: absolute; z-index: 2; right: 2%; bottom: .5%; display: grid; place-items: center; width: 32px; height: clamp(24px, 16cqw, 32px); min-height: 0; padding: 0; border: 0; border-radius: .25rem; background: transparent; color: var(--muted); cursor: pointer; }
	.turn :global(svg) { width: var(--club-control-height); height: var(--club-control-height); }
	.turn:hover { background: transparent; color: var(--text); }
	.turn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
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
	}
	.tile[aria-pressed='true'] { outline: 3px solid var(--accent); outline-offset: 3px; }
	.tile:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
</style>
