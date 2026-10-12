<script lang="ts">
 import type { Standing } from '../../draft/league.ts';
 let { rows, human, rival, clubName }: { rows: readonly Standing[]; human: number; rival: number; clubName: (seat: number) => string } = $props();
 const pct = (row: Standing) => row.wins + row.losses ? (row.wins / (row.wins + row.losses)).toFixed(3).replace(/^0/, '') : '.000';
 const diff = (row: Standing) => { const value = row.runsFor - row.runsAgainst; return value > 0 ? `+${value}` : String(value); };
</script>

<div class="stat-table-scroll" role="region" aria-label="Standings" tabindex="-1">
 <table class="stat-table standings">
  <thead><tr><th scope="col">Club</th><th scope="col">W</th><th scope="col">L</th><th scope="col">Pct</th><th scope="col">GB</th><th scope="col">RS</th><th scope="col">RA</th><th scope="col">Diff</th></tr></thead>
  <tbody>
   {#each rows as row (row.seat)}
    <tr class:you={row.seat === human}>
     <th scope="row">{clubName(row.seat)}{#if row.seat === human} <span class="tag">You</span>{:else if row.seat === rival} <span class="tag">Rival</span>{/if}</th>
     <td>{row.wins}</td><td>{row.losses}</td><td>{pct(row)}</td><td>{row.gamesBack === 0 ? '—' : row.gamesBack}</td>
     <td>{row.runsFor}</td><td>{row.runsAgainst}</td><td>{diff(row)}</td>
    </tr>
   {/each}
  </tbody>
 </table>
</div>

<style>
 .stat-table-scroll { overflow-x: auto; min-width: 0; }
 .standings { min-width: 30rem; }
 .you th, .you td { color: var(--accent); }
 .tag { margin-left: var(--space-1); color: var(--muted); font-size: var(--text-xs); font-weight: 600; }
</style>
