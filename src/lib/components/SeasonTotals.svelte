<script lang="ts">
	import type { BatterLine, PitcherLine } from '../sim/types.ts';
	import { tableScroll } from './table-scroll.ts';
	import { BATTING_COLUMNS, nextSort, PITCHING_COLUMNS, sortLines, type SortDirection, type StatColumn } from './stat-sort.ts';

	/** A club's season batting and pitching totals, each table sortable by any column. */
	let { batting, pitching, relievers = 'closer and named relievers' }: {
		batting: readonly BatterLine[];
		pitching: readonly PitcherLine[];
		/** Who the support note says the league-average pool backs up. */
		relievers?: string;
	} = $props();

	// Season totals open best first by estimated WAR; any header re-sorts its table.
	let battingSort = $state<{ key: string; direction: SortDirection }>({ key: 'war', direction: 'descending' });
	let pitchingSort = $state<{ key: string; direction: SortDirection }>({ key: 'war', direction: 'descending' });
	const battingLines = $derived(sortLines(batting, BATTING_COLUMNS.find(column => column.key === battingSort.key)!, battingSort.direction));
	const pitchingLines = $derived(sortLines(pitching, PITCHING_COLUMNS.find(column => column.key === pitchingSort.key)!, pitchingSort.direction));
	function ariaSort<T>(sort: { key: string; direction: SortDirection }, column: StatColumn<T>): 'ascending' | 'descending' | 'none' {
		return sort.key === column.key ? sort.direction : 'none';
	}
</script>

<section class="season-totals" aria-labelledby="batting-heading">
	<div class="section-heading">
		<div>
			<h4 id="batting-heading" tabindex="-1">Batting</h4>
		</div>
	</div>
	<div class="table-scroll stat-table-scroll" role="region" aria-label="Season batting totals" use:tableScroll>
		<table class="stat-table">
			<caption class="sr-only">Simulated season batting totals, sorted by {BATTING_COLUMNS.find(column => column.key === battingSort.key)!.title}</caption>
			<thead>
				<tr>
					<th scope="col">Batter</th>
					{#each BATTING_COLUMNS as column (column.key)}
						<th scope="col" class={column.className} aria-sort={ariaSort(battingSort, column)}>
							<button type="button" class="sort-header" class:sorted={battingSort.key === column.key} aria-label={`Sort by ${column.title}`} onclick={() => battingSort = nextSort(battingSort, column)}>{column.label}<span aria-hidden="true">{battingSort.key === column.key ? (battingSort.direction === 'descending' ? '▼' : '▲') : ''}</span></button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each battingLines as line (line.seasonId)}
					<tr>
						<th scope="row">
							<span class="stat-identity">{line.displayName}<small>{line.position} · {line.year}</small></span>
						</th>
						{#each BATTING_COLUMNS as column (column.key)}<td class={column.className}>{column.format(line)}</td>{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section class="season-totals" aria-labelledby="pitching-heading">
	<div class="section-heading">
		<div>
			<h4 id="pitching-heading" tabindex="-1">Pitching</h4>
		</div>
		<p>RA9 is runs allowed per nine innings. It is not simulated ERA.</p>
	</div>
	<div class="table-scroll stat-table-scroll" role="region" aria-label="Season pitching totals" use:tableScroll>
		<table class="stat-table pitching-table">
			<caption class="sr-only">Simulated season pitching totals, sorted by {PITCHING_COLUMNS.find(column => column.key === pitchingSort.key)!.title}</caption>
			<thead>
				<tr>
					<th scope="col">Pitcher</th>
					{#each PITCHING_COLUMNS as column (column.key)}
						<th scope="col" class={column.className} aria-sort={ariaSort(pitchingSort, column)}>
							<button type="button" class="sort-header" class:sorted={pitchingSort.key === column.key} aria-label={`Sort by ${column.title}`} onclick={() => pitchingSort = nextSort(pitchingSort, column)}>{column.label}<span aria-hidden="true">{pitchingSort.key === column.key ? (pitchingSort.direction === 'descending' ? '▼' : '▲') : ''}</span></button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each pitchingLines as line (line.seasonId)}
					<tr>
						<th scope="row">
							<span class="stat-identity">{line.displayName}<small>{line.role === 'support' ? 'BP' : line.role === 'closer' ? 'CL' : line.role === 'reliever' ? 'RP' : 'SP'} · {line.year}</small></span>
						</th>
						{#each PITCHING_COLUMNS as column (column.key)}<td class={column.className}>{column.format(line)}</td>{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="support-note muted">A league-average relief pool, listed as BP, covers every relief inning your {relievers} do not take.</p>
</section>

<style>
	.season-totals { display: grid; gap: var(--space-3); min-width: 0; }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); }
	.section-heading h4 { margin: 0; font-size: var(--text-base); font-weight: 750; }
	.section-heading > p { max-width: 60ch; margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.support-note { margin: 0; font-size: var(--text-xs); }
	.sort-header { display: inline-flex; align-items: center; justify-content: flex-end; gap: 2px; width: 100%; min-height: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; letter-spacing: 0; }
	.sort-header:hover:not(:disabled) { background: transparent; color: var(--text); }
	.sort-header.sorted { color: var(--text); }
	.sort-header span { font-size: .6em; }
</style>
