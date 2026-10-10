<script lang="ts">
	import { innings } from '#lib/game/format.ts';
	import type { PitcherLine, TeamBox } from '#lib/sim/types.ts';
	import { tableScroll } from './table-scroll.ts';

	/** Batting and pitching tables for each club box, labelled for one game or a series total. */
	let { boxes, label, idPrefix }: { boxes: readonly TeamBox[]; label: string; idPrefix: string } = $props();

	function ra9(line: PitcherLine): string {
		return line.outs > 0 ? (line.R * 27 / line.outs).toFixed(2) : '–';
	}
</script>

{#each boxes as box}
	<section class="box" aria-labelledby={`${idPrefix}-${box.id}-heading`}>
		<div class="box-heading">
			<h4 id={`${idPrefix}-${box.id}-heading`}>{box.name}</h4>
			<span>{box.runs} {box.runs === 1 ? 'run' : 'runs'}</span>
		</div>

		<div class="table-scroll stat-table-scroll" use:tableScroll role="region" aria-label={`${box.name} batting box score for ${label}`}>
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

		<div class="table-scroll stat-table-scroll" use:tableScroll role="region" aria-label={`${box.name} pitching box score for ${label}`}>
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
							<th scope="row">{line.displayName}</th><td>{innings(line.outs)}</td><td>{line.H}</td><td>{line.BB}</td>
							<td>{line.HBP}</td><td>{line.SO}</td><td class="stat-group">{line.R}</td><td class="stat-key">{ra9(line)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/each}

<style>
	.box { display: grid; gap: var(--space-3); min-width: 0; }
	.box-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
	h4 { margin: 0; font-size: var(--text-base); }
	.box-heading > span { color: var(--muted); font-size: var(--text-xs); white-space: nowrap; }
</style>
