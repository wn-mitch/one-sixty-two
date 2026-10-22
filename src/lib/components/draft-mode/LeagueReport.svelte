<script lang="ts">
 import ResultsScoreboard from '../ResultsScoreboard.svelte';
 import SeasonTotals from '../SeasonTotals.svelte';
 import Standings from './Standings.svelte';
 import { headToHead, seasonLines, standings, type LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';

 /** The finished league season in the Results layout: the record and its facts, the final standings, then the club's season totals. */
 let { run, season, clubName, onNew }: { run: DraftRun; season: LeagueSeason; clubName: (seat: number) => string; onNew: () => void } = $props();
 const human = $derived(run.seating.humanSeat);
 const rival = $derived(season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!);
 const table = $derived(standings(season));
 const mine = $derived(table.find(row => row.seat === human)!);
 const place = $derived(table.indexOf(mine) + 1);
 const champion = $derived(table[0]);
 const series = $derived(headToHead(season, human, rival));
 const lines = $derived(seasonLines(season, human));
 const difference = $derived(mine.runsFor - mine.runsAgainst);
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
</script>

<section class="report" aria-labelledby="results-heading">
 <ResultsScoreboard wins={mine.wins} losses={mine.losses}>
  {#snippet record()}
   <p class="headline">{champion.seat === human ? `${clubName(human)} won the league.` : `${clubName(champion.seat)} won the league at ${champion.wins}–${champion.losses}.`}{mine.wins === 162 ? ' 162-0.' : ''}</p>
   <dl class="season-ledger">
    <div><dt>Finish</dt><dd>{ordinal(place)} of {table.length}</dd></div>
    <div><dt>vs {clubName(rival)}</dt><dd>{series.wins}–{series.losses}</dd></div>
    <div>
     <dt>Runs</dt>
     <dd aria-label={`${mine.runsFor} scored, ${mine.runsAgainst} allowed, difference ${difference > 0 ? '+' : ''}${difference}`}>{mine.runsFor}–{mine.runsAgainst} <span class="run-difference" class:up={difference > 0} class:down={difference < 0}>{difference > 0 ? '+' : difference < 0 ? '−' : '±'}{Math.abs(difference)}</span></dd>
    </div>
   </dl>
  {/snippet}
  {#snippet actions()}
   <button class="primary" type="button" onclick={onNew}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3.5v9M3.5 8h9"></path></svg>New draft</button>
  {/snippet}
 </ResultsScoreboard>

 <section class="block" aria-labelledby="final-heading">
  <h3 id="final-heading">Final standings</h3>
  <Standings rows={table} {human} {rival} {clubName} />
 </section>

 <section class="block season-review" aria-labelledby="season-review-heading">
  <h3 id="season-review-heading">Season in review</h3>
  <SeasonTotals batting={lines.batting} pitching={lines.pitching} relievers="named relievers" />
 </section>
</section>

<style>
 .report { display: grid; gap: var(--space-8); min-width: 0; }
 .report > * { min-width: 0; }
 .headline { flex: 1 1 16rem; margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .block { display: grid; gap: var(--space-3); }
 .season-review { gap: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--border); }
 h3 { margin: 0; font-size: var(--text-xl); }
</style>
