<script lang="ts">
	import type { GameResult } from '#lib/sim/types.ts';
	import { tableScroll } from './table-scroll.ts';
	import TeamBoxTables from './TeamBoxTables.svelte';

	/** Inning line score plus both clubs' batting and pitching boxes for one game. */
	let { game, label = `Game ${game.number}`, idPrefix = `game-${game.number}` }: { game: GameResult; label?: string; idPrefix?: string } = $props();

	let boxes = $derived([game.away, game.home]);
	let inningNumbers = $derived.by(() => {
		const count = Math.max(9, game.away.innings.length, game.home.innings.length);
		return Array.from({ length: count }, (_, index) => index + 1);
	});

	function inningRun(value: number | null | undefined): string {
		return value == null ? '–' : String(value);
	}
</script>

<div class="game-content">
	<p class="venue">{game.stadiumName}</p>
	<div class="table-scroll stat-table-scroll line-score" use:tableScroll role="region" aria-label={`${label} inning line score`}>
		<table class="stat-table">
			<caption>Inning line score</caption>
			<thead>
				<tr>
					<th scope="col">Team</th>
					{#each inningNumbers as inning}
						<th scope="col">{inning}</th>
					{/each}
					<th scope="col">R</th>
				</tr>
			</thead>
			<tbody>
				{#each boxes as box}
					<tr>
						<th scope="row">{box.name}</th>
						{#each inningNumbers as inning}
							<td>{inningRun(box.innings[inning - 1])}</td>
						{/each}
						<td class="total">{box.runs}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<TeamBoxTables {boxes} {label} {idPrefix} />
</div>

<style>
	.game-content { display: grid; gap: var(--space-5); padding: var(--space-4) 0 var(--space-6); min-width: 0; }
	.venue { margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.line-score table { min-width: 30rem; }
	.line-score .total { font-weight: 800; background: var(--surface-raised); }
</style>
