<script lang="ts">
	import type { GameResult } from '#lib/sim/types.ts';
	import GameBoxScore from './GameBoxScore.svelte';
	import TeamLogo from './TeamLogo.svelte';

	interface Props {
		game: GameResult;
	}

	let { game }: Props = $props();
	let expanded = $state(false);
</script>

<details class="game-detail" bind:open={expanded}>
	<summary>
		<span class="game-number">Game {game.number}</span>
		<span class="opponent"><TeamLogo franchiseId={game.opponentId} year={2025} label={game.opponentName} size="small" /><span>{game.isHome ? 'vs.' : 'at'} {game.opponentName}</span></span>
		<span class:win={game.win} class:loss={!game.win} class="decision">{game.win ? 'W' : 'L'}</span>
		<strong class="score">{game.challengeRuns}–{game.opponentRuns}</strong>
		<span class="expand-cue" aria-hidden="true">{expanded ? '−' : '+'}</span>
	</summary>

	{#if expanded}
	<GameBoxScore {game} />
	{/if}
</details>

<style>
	.game-detail { border-bottom: 1px solid var(--border); min-width: 0; }
	summary { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr) 1rem 3rem .75rem; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: .35rem var(--space-2); list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary:hover { background: var(--surface); }
	.game-detail[open] > summary { background: var(--surface); }
	.game-number { color: var(--muted); font-size: var(--text-xs); font-weight: 650; }
	.opponent { display: flex; gap: var(--space-2); align-items: center; min-width: 0; font-size: var(--text-xs); }
	.opponent > span { min-width: 0; overflow-wrap: anywhere; }
	.decision { font-weight: 800; text-align: center; }
	.win { color: var(--success); }
	.loss { color: var(--error); }
	.score { text-align: right; font-size: var(--text-sm); }
	.expand-cue { color: var(--muted); font-size: var(--text-base); text-align: center; }
	@media (max-width: 30rem) {
		summary { grid-template-columns: 3rem minmax(0, 1fr) 1rem 2.5rem .75rem; gap: .375rem; padding-inline: 0; }
		.opponent { gap: var(--space-2); font-size: var(--text-xs); }
	}
</style>
