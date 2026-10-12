<script lang="ts">
 import Standings from './Standings.svelte';
 import { headToHead, seasonLines, standings, type LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { average, innings } from '../../game/format.ts';

 let { run, season, clubName, onNew }: { run: DraftRun; season: LeagueSeason; clubName: (seat: number) => string; onNew: () => void } = $props();
 const human = $derived(run.seating.humanSeat);
 const rival = $derived(season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!);
 const table = $derived(standings(season));
 const mine = $derived(table.find(row => row.seat === human)!);
 const champion = $derived(table[0]);
 const series = $derived(headToHead(season, human, rival));
 const lines = $derived(seasonLines(season, human));
 const batters = $derived([...lines.batting].sort((a, b) => b.PA - a.PA));
 const pitchers = $derived([...lines.pitching].filter(line => line.appearances > 0).sort((a, b) => b.outs - a.outs));
 const ratio = (top: number, bottom: number) => bottom ? average(top / bottom) : '—';
</script>

<div class="report">
 <header class="scoreboard">
  <p class="eyebrow">Final</p>
  <h1>{mine.wins}–{mine.losses}</h1>
  <p>{clubName(human)} finished {table.indexOf(mine) + 1} of 8. {champion.seat === human ? 'League champions.' : `${clubName(champion.seat)} won the league at ${champion.wins}–${champion.losses}.`}</p>
  <p>{clubName(rival)} season series {series.wins}–{series.losses}{mine.wins === 162 ? ' · 162-0' : ''}</p>
  <button class="primary" onclick={onNew}>New draft</button>
 </header>

 <section aria-labelledby="final-heading">
  <h2 id="final-heading">Final standings</h2>
  <Standings rows={table} {human} {rival} {clubName} />
 </section>

 <section aria-labelledby="batting-heading">
  <h2 id="batting-heading">Batting</h2>
  <div class="stat-table-scroll" role="region" aria-label="Season batting" tabindex="-1">
   <table class="stat-table">
    <thead><tr><th scope="col">Player</th><th scope="col">PA</th><th scope="col">H</th><th scope="col">2B</th><th scope="col">3B</th><th scope="col">HR</th><th scope="col">BB</th><th scope="col">SO</th><th scope="col">SB</th><th scope="col">AVG</th><th scope="col">OBP</th><th scope="col">R</th><th scope="col">RBI</th></tr></thead>
    <tbody>
     {#each batters as line (line.seasonId)}
      <tr><th scope="row">{line.displayName} <small>{line.position} · {line.year}</small></th><td>{line.PA}</td><td>{line.H}</td><td>{line.doubles}</td><td>{line.triples}</td><td>{line.HR}</td><td>{line.BB}</td><td>{line.SO}</td><td>{line.SB}</td><td>{ratio(line.H, line.AB)}</td><td>{ratio(line.H + line.BB + line.HBP, line.AB + line.BB + line.HBP + line.SF)}</td><td>{line.R}</td><td>{line.RBI}</td></tr>
     {/each}
    </tbody>
   </table>
  </div>
 </section>

 <section aria-labelledby="pitching-heading">
  <h2 id="pitching-heading">Pitching</h2>
  <div class="stat-table-scroll" role="region" aria-label="Season pitching" tabindex="-1">
   <table class="stat-table pitching-table">
    <thead><tr><th scope="col">Pitcher</th><th scope="col">G</th><th scope="col">GS</th><th scope="col">IP</th><th scope="col">H</th><th scope="col">BB</th><th scope="col">SO</th><th scope="col">R</th><th scope="col">RA9</th></tr></thead>
    <tbody>
     {#each pitchers as line (line.seasonId)}
      <tr><th scope="row">{line.displayName} <small>{line.role === 'support' ? 'BP' : line.role} · {line.year}</small></th><td>{line.appearances}</td><td>{line.starts}</td><td>{innings(line.outs)}</td><td>{line.H}</td><td>{line.BB}</td><td>{line.SO}</td><td>{line.R}</td><td>{line.outs ? (line.R * 27 / line.outs).toFixed(2) : '—'}</td></tr>
     {/each}
    </tbody>
   </table>
  </div>
 </section>
</div>

<style>
 .report { display: grid; gap: var(--space-8); }
 .report > * { min-width: 0; }
 .stat-table-scroll { overflow-x: auto; }
 .scoreboard { display: grid; gap: var(--space-2); justify-items: start; padding-bottom: var(--space-6); border-bottom: 1px solid var(--border); }
 .eyebrow { margin: 0; color: var(--accent); font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
 h1 { margin: 0; font-size: var(--text-score); line-height: 1; font-family: 'Barlow Condensed', system-ui, sans-serif; font-style: italic; font-weight: 900; }
 .scoreboard p { margin: 0; color: var(--muted); max-width: 68ch; }
 h2 { margin: 0 0 var(--space-3); font-size: var(--text-base); }
 small { color: var(--muted); font-weight: 500; }
</style>
