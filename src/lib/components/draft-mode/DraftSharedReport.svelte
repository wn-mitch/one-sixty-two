<script lang="ts">
 import Standings from './Standings.svelte';
 import type { DraftSharedReport, SharedLine } from '../../draft/share-report.ts';

 /** A shared Draft Mode season, read-only: the record and grade, standings, moments, final roster and the run's identity. */
 let { report }: { report: DraftSharedReport } = $props();
 const rows = $derived(report.standings.map((row, seat) => ({ seat, wins: row.wins, losses: row.losses, runsFor: row.runsFor, runsAgainst: row.runsAgainst, gamesBack: row.gamesBack })));
 const human = $derived(report.standings.findIndex(row => row.you));
 const rival = $derived(report.standings.findIndex(row => row.rival));
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
 const columns = (away: SharedLine, home: SharedLine) => Array.from({ length: Math.max(away.innings.length, home.innings.length) }, (_, index) => index + 1);
 const runs = (value: number | null | undefined) => value == null ? '–' : String(value);
</script>

<article class="shared" aria-labelledby="shared-heading">
 <header>
  <p class="kicker">Draft Mode season</p>
  <h1 id="shared-heading">{report.club} <span class="record">{report.record.wins}–{report.record.losses}</span></h1>
  <dl class="ledger">
   <div><dt>Grade</dt><dd>{report.grade}</dd></div>
   <div><dt>Finish</dt><dd>{ordinal(report.place)} of {report.standings.length}</dd></div>
   <div><dt>vs {report.rival.club}</dt><dd>{report.rival.wins}–{report.rival.losses}</dd></div>
   <div><dt>Runs</dt><dd>{report.record.runsFor}–{report.record.runsAgainst}</dd></div>
  </dl>
  <a class="button primary" href="/draft">Play Draft Mode</a>
 </header>

 <section aria-labelledby="shared-standings">
  <h2 id="shared-standings">Final standings</h2>
  <Standings {rows} {human} {rival} clubName={seat => report.standings[seat].club} />
 </section>

 {#if report.moments.length}
  <section aria-labelledby="shared-moments">
   <h2 id="shared-moments">Season moments</h2>
   {#each report.moments as moment (moment.kind)}
    <div class="moment">
     <p class="kicker">{moment.kind === 'highlight' ? 'Highlight' : 'Lowlight'}</p>
     <h3>{moment.title}</h3>
     <p class="muted">Played under {moment.decree}.</p>
     <div class="stat-table-scroll" role="region" aria-label={`${moment.kind} line score`} tabindex="-1">
      <table class="stat-table">
       <thead><tr><th scope="col">Team</th>{#each columns(moment.away, moment.home) as inning}<th scope="col">{inning}</th>{/each}<th scope="col">R</th></tr></thead>
       <tbody>
        {#each [moment.away, moment.home] as side}
         <tr><th scope="row">{side.club}</th>{#each columns(moment.away, moment.home) as inning}<td>{runs(side.innings[inning - 1])}</td>{/each}<td class="total">{side.runs}</td></tr>
        {/each}
       </tbody>
      </table>
     </div>
    </div>
   {/each}
  </section>
 {/if}

 <section aria-labelledby="shared-roster">
  <h2 id="shared-roster">Final roster</h2>
  <ul class="roster">
   {#each report.roster as card, index (index)}
    <li><span class="slot">{card.slot}</span><span class="name">{card.label}</span><span class="muted">{card.line}</span></li>
   {/each}
  </ul>
 </section>

 <section aria-labelledby="shared-decrees">
  <h2 id="shared-decrees">Decrees</h2>
  <ol class="decrees">{#each report.decrees as decree, chapter (chapter)}<li>Chapter {chapter + 1}: {decree}</li>{/each}</ol>
 </section>

 <footer class="muted">
  A snapshot of a finished season, not a replay. Seed {report.seed} · {report.franchiseId} · {report.runVersion} · {report.leagueVersion} · {report.modelVersion} · {report.rulesVersion} · data {report.dataVersion.slice(0, 12)}
 </footer>
</article>

<style>
 .shared { display: grid; gap: var(--space-8); min-width: 0; }
 .shared > * { min-width: 0; }
 header { display: grid; gap: var(--space-3); }
 h1 { margin: 0; font-size: var(--text-2xl); }
 .record { color: var(--accent); white-space: nowrap; }
 h2 { margin: 0 0 var(--space-3); font-size: var(--text-xl); }
 h3 { margin: 0; font-size: var(--text-lg); }
 .kicker { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
 .muted { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .ledger { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); margin: 0; }
 .ledger div { display: grid; }
 dt { color: var(--muted); font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
 dd { margin: 0; font-size: var(--text-lg); font-weight: 700; font-variant-numeric: tabular-nums; }
 .button { justify-self: start; }
 .moment { display: grid; gap: var(--space-2); padding-top: var(--space-4); border-top: 1px solid var(--border); }
 .stat-table-scroll { overflow-x: auto; min-width: 0; }
 .total { font-weight: 700; }
 .roster { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
 .roster li { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); column-gap: var(--space-2); }
 .roster .muted { grid-column: 2; font-size: var(--text-xs); }
 .slot { color: var(--muted); font-size: var(--text-xs); font-weight: 700; padding-top: .15rem; }
 .name { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
 .decrees { margin: 0; padding-left: var(--space-5); display: grid; gap: var(--space-1); }
 footer { font-size: var(--text-xs); overflow-wrap: anywhere; }
</style>
