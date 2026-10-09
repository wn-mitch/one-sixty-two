<script lang="ts">
	import { innings } from '#lib/game/format.ts';
	import type { PitcherLine } from '#lib/sim/types.ts';
	import type { GameResult } from '#lib/sim/types.ts';
	import TeamLogo from './TeamLogo.svelte';
	import { tableScroll } from './table-scroll.ts';

	interface Props {
		game: GameResult;
	}

	let { game }: Props = $props();
	let expanded = $state(false);

	let boxes = $derived([game.away, game.home]);
	let inningNumbers = $derived.by(() => {
		const count = Math.max(9, game.away.innings.length, game.home.innings.length);
		return Array.from({ length: count }, (_, index) => index + 1);
	});

	function inningRun(value: number | null | undefined): string {
		return value == null ? '–' : String(value);
	}

	function pitcherName(line: PitcherLine): string {
		return line.displayName;
	}

	function ra9(line: PitcherLine): string {
		return line.outs > 0 ? (line.R * 27 / line.outs).toFixed(2) : '–';
	}
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
	<div class="game-content">
		<div class="table-scroll stat-table-scroll line-score" use:tableScroll role="region" aria-label={`Game ${game.number} inning line score`}>
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

		{#each boxes as box}
			<section class="box" aria-labelledby={`game-${game.number}-${box.id}-heading`}>
				<div class="box-heading">
					<h4 id={`game-${game.number}-${box.id}-heading`}>{box.name}</h4>
					<span>{box.runs} {box.runs === 1 ? 'run' : 'runs'}</span>
				</div>

				<div class="table-scroll stat-table-scroll" use:tableScroll role="region" aria-label={`${box.name} batting box score for game ${game.number}`}>
					<table class="stat-table">
						<caption>{box.name} batting</caption>
						<thead>
							<tr>
								<th scope="col">Batter</th><th scope="col">PA</th><th scope="col">AB</th><th scope="col">H</th>
								<th scope="col">2B</th><th scope="col">3B</th><th scope="col" class="stat-key">HR</th><th scope="col" class="stat-group">BB</th>
								<th scope="col">HBP</th><th scope="col">SO</th><th scope="col" class="stat-group">R</th><th scope="col" class="stat-key">RBI</th>
								<th scope="col" class="stat-group">SB</th><th scope="col">CS</th><th scope="col">SF</th>
							</tr>
						</thead>
						<tbody>
							{#each box.batting as line}
								<tr>
									<th scope="row">{line.displayName}</th><td>{line.PA}</td><td>{line.AB}</td><td>{line.H}</td>
									<td>{line.doubles}</td><td>{line.triples}</td><td class="stat-key">{line.HR}</td><td class="stat-group">{line.BB}</td>
									<td>{line.HBP}</td><td>{line.SO}</td><td class="stat-group">{line.R}</td><td class="stat-key">{line.RBI}</td>
									<td class="stat-group">{line.SB}</td><td>{line.CS}</td><td>{line.SF}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="table-scroll stat-table-scroll" use:tableScroll role="region" aria-label={`${box.name} pitching box score for game ${game.number}`}>
					<table class="stat-table pitching-table">
						<caption>{box.name} pitching</caption>
						<thead>
							<tr>
								<th scope="col">Pitcher</th><th scope="col">IP</th><th scope="col">H</th><th scope="col">BB</th>
								<th scope="col">HBP</th><th scope="col">SO</th><th scope="col" class="stat-group">R</th><th scope="col" class="stat-key">RA9</th>
							</tr>
						</thead>
						<tbody>
							{#each box.pitching as line}
								<tr>
									<th scope="row">{pitcherName(line)}</th><td>{innings(line.outs)}</td><td>{line.H}</td><td>{line.BB}</td>
									<td>{line.HBP}</td><td>{line.SO}</td><td class="stat-group">{line.R}</td><td class="stat-key">{ra9(line)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/each}
	</div>
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
	.game-content { display: grid; gap: var(--space-5); padding: var(--space-4) 0 var(--space-6); min-width: 0; }
	.box { display: grid; gap: var(--space-3); min-width: 0; }
	.box-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
	h4 { margin: 0; font-size: var(--text-base); }
	.box-heading > span { color: var(--muted); font-size: var(--text-xs); white-space: nowrap; }
	.line-score table { min-width: 30rem; }
	.line-score .total { font-weight: 800; background: var(--surface-raised); }
	@media (max-width: 30rem) {
		summary { grid-template-columns: 3rem minmax(0, 1fr) 1rem 2.5rem .75rem; gap: .375rem; padding-inline: 0; }
		.opponent { gap: var(--space-2); font-size: var(--text-xs); }
	}
</style>
