<script lang="ts">
	import { innings } from '#lib/game/format.ts';
	import type { PitcherLine } from '#lib/sim/types.ts';
	import type { GameResult } from '#lib/sim/types.ts';
	import TeamLogo from './TeamLogo.svelte';

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
		return line.role === 'support' ? 'Support bullpen' : line.displayName;
	}

	function ra9(line: PitcherLine): string {
		return line.outs > 0 ? (line.R * 27 / line.outs).toFixed(2) : '–';
	}
</script>

<details class="game-detail" bind:open={expanded}>
	<summary>
		<span class="game-number">Game {game.number}<small aria-hidden="true">{expanded ? 'Close −' : 'Box +'}</small></span>
		<span class="opponent"><TeamLogo franchiseId={game.opponentId} year={2025} label={game.opponentName} size="small" /><span>{game.isHome ? 'vs.' : 'at'} {game.opponentName}</span></span>
		<span class:win={game.win} class:loss={!game.win} class="decision">{game.win ? 'W' : 'L'}</span>
		<strong class="score">{game.challengeRuns}–{game.opponentRuns}</strong>
	</summary>

	{#if expanded}
	<div class="game-content">
		<div class="table-scroll line-score" tabindex="0" role="region" aria-label={`Game ${game.number} inning line score`}>
			<table>
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

				<div class="table-scroll" tabindex="0" role="region" aria-label={`${box.name} batting box score for game ${game.number}`}>
					<table>
						<caption>{box.name} batting</caption>
						<thead>
							<tr>
								<th scope="col">Batter</th><th scope="col">PA</th><th scope="col">AB</th><th scope="col">H</th>
								<th scope="col">2B</th><th scope="col">3B</th><th scope="col">HR</th><th scope="col">BB</th>
								<th scope="col">HBP</th><th scope="col">SO</th><th scope="col">R</th><th scope="col">RBI</th>
								<th scope="col">SB</th><th scope="col">CS</th><th scope="col">SF</th>
							</tr>
						</thead>
						<tbody>
							{#each box.batting as line}
								<tr>
									<th scope="row">{line.displayName}</th><td>{line.PA}</td><td>{line.AB}</td><td>{line.H}</td>
									<td>{line.doubles}</td><td>{line.triples}</td><td>{line.HR}</td><td>{line.BB}</td>
									<td>{line.HBP}</td><td>{line.SO}</td><td>{line.R}</td><td>{line.RBI}</td>
									<td>{line.SB}</td><td>{line.CS}</td><td>{line.SF}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="table-scroll" tabindex="0" role="region" aria-label={`${box.name} pitching box score for game ${game.number}`}>
					<table>
						<caption>{box.name} pitching</caption>
						<thead>
							<tr>
								<th scope="col">Pitcher</th><th scope="col">IP</th><th scope="col">H</th><th scope="col">BB</th>
								<th scope="col">HBP</th><th scope="col">SO</th><th scope="col">R</th><th scope="col">RA9</th>
							</tr>
						</thead>
						<tbody>
							{#each box.pitching as line}
								<tr>
									<th scope="row">{pitcherName(line)}</th><td>{innings(line.outs)}</td><td>{line.H}</td><td>{line.BB}</td>
									<td>{line.HBP}</td><td>{line.SO}</td><td>{line.R}</td><td>{ra9(line)}</td>
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
	summary { display: grid; grid-template-columns: 4rem minmax(0, 1fr) 1.5rem 3.5rem; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-2); list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary:hover { background: var(--surface); }
	.game-detail[open] > summary { background: var(--surface); }
	.game-number { color: var(--muted); font-size: var(--text-xs); font-weight: 650; }
	.game-number small { display: block; font-size: var(--text-xs); font-weight: 400; margin-top: var(--space-1); }
	.opponent { display: flex; gap: var(--space-3); align-items: center; min-width: 0; font-size: var(--text-sm); }
	.opponent > span { min-width: 0; overflow-wrap: anywhere; }
	.decision { font-weight: 800; text-align: center; }
	.win { color: var(--success); }
	.loss { color: var(--error); }
	.score { text-align: right; }
	.game-content { display: grid; gap: var(--space-6); padding: var(--space-4) 0 var(--space-8); min-width: 0; }
	.box { display: grid; gap: var(--space-4); min-width: 0; }
	.box-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
	h4 { margin: 0; font-size: var(--text-base); }
	.box-heading > span { color: var(--muted); font-size: var(--text-xs); white-space: nowrap; }
	table { width: 100%; min-width: 44rem; font-size: var(--text-xs); }
	.line-score table { min-width: max-content; }
	caption { padding: 0 0 var(--space-2); color: var(--muted); font-weight: 700; text-align: left; }
	th, td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
	th:first-child { position: sticky; left: 0; z-index: 1; max-width: 13rem; background: var(--background); text-align: left; overflow: hidden; text-overflow: ellipsis; }
	thead th { color: var(--muted); font-size: var(--text-xs); text-transform: uppercase; }
	tbody th { color: var(--text); }
	.total { font-weight: 800; }
	@media (max-width: 30rem) {
		summary { grid-template-columns: 3rem minmax(0, 1fr) 1rem 3rem; gap: var(--space-2); padding-inline: 0; }
		.opponent { gap: var(--space-2); font-size: var(--text-xs); }
	}
</style>
