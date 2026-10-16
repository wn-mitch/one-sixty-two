<script lang="ts">
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { LibraryView } from '../../game/library.ts';
	import { teamTitle } from '../../game/library-stats.ts';
	import { seasonGrade } from '../../game/grade.ts';
	import ClubCard from './ClubCard.svelte';
	import { CLUB_MATERIALS } from './club-card-material.ts';
	import FlipIcon from '../../cards/FlipIcon.svelte';

	/** One saved club as a team card. Ctrl/Cmd-click adds it to a comparison. */
	let { entry, stars, tally, selected, onSelect, flippable = true }: {
		entry: LibraryView;
		/** Star cards by value, best first; empty while profiles load. */
		stars: readonly { seasonId: string; view: CardViewModel }[];
		tally: { won: number; lost: number };
		selected: boolean;
		onSelect: (event: MouseEvent | KeyboardEvent) => void;
		flippable?: boolean;
	} = $props();

	let face = $state<'front' | 'back'>('front');
	const grade = $derived(seasonGrade(entry.record.wins, entry.record.losses));
	const played = $derived(new Date(entry.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
	const differential = $derived(entry.runs.scored - entry.runs.allowed);
	const stats = $derived([
		{ label: 'Run differential', value: `${differential > 0 ? '+' : differential < 0 ? '−' : ''}${Math.abs(differential)}`, primary: true },
		{ label: 'Win %', value: `${(entry.record.wins / Math.max(1, entry.record.wins + entry.record.losses) * 100).toFixed(1)}%` },
		...(tally.won || tally.lost ? [{ label: 'H2H', value: `${tally.won}–${tally.lost}` }] : [])
	]);
</script>

<div class="club-tile" style:--club-edge-units={CLUB_MATERIALS[grade ?? 'ungraded'].edge}>
<button type="button" class="tile" aria-label={teamTitle(entry)} aria-pressed={selected} onclick={onSelect} data-entry={entry.key}>
	<ClubCard
		title={entry.nickname}
		parkName={entry.stadium?.name ?? 'No home park'}
		recordLabel={`${entry.record.wins}–${entry.record.losses}`}
		{grade}
		{face}
		{stats}
		footer={played}
		roster={entry.roster}
		{stars}
		retired={entry.status === 'retired'}
		interactive={flippable}
	/>
</button>
	{#if flippable}
	<button type="button" class="turn" aria-label={`${face === 'front' ? 'Turn over' : 'Show front'} ${teamTitle(entry)}`} aria-pressed={face === 'back'} onclick={() => face = face === 'front' ? 'back' : 'front'}>
		<FlipIcon />
	</button>
	{/if}
</div>

<style>
	/* The turn button sits in the slot ClubCard's footer row reserves: same card units, same edge, same row. */
	.club-tile {
		position: relative; min-width: 0; container-type: inline-size;
		--club-control-space: 7cqw;
		--icon: 4.8cqw;
		--inset: calc(.8cqw * var(--club-edge-units, 2) + 3.2cqw);
	}
	.turn { position: absolute; z-index: 2; right: calc(var(--inset) + 2.4cqw - 16px); bottom: calc(var(--inset) + 3cqw - 16px); display: grid; place-items: center; width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: .25rem; background: transparent; color: var(--paper, #fff); opacity: .72; cursor: pointer; }
	.turn :global(svg) { width: var(--icon); height: var(--icon); }
	.turn:hover { background: transparent; opacity: 1; }
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
