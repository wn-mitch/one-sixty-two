<script lang="ts">
 import Standings from './Standings.svelte';
 import { headToHead, standings, type LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { type LeagueGame } from '../../sim/league-types.ts';

 /** A chapter stop above the lineup: the club's record and rival series, the standings, and the last chapter's games. */
 let { run, season, revision, clubName }: {
  run: DraftRun; season: LeagueSeason; revision: number; clubName: (seat: number) => string;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const rival = $derived(season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!);
 const played = $derived.by(() => { void revision; return season.chapters.length; });
 const table = $derived.by(() => { void revision; return standings(season); });
 const mine = $derived(table.find(row => row.seat === human)!);
 const place = $derived(table.findIndex(row => row.seat === human) + 1);
 const series = $derived.by(() => { void revision; return headToHead(season, human, rival); });
 const recent = $derived.by(() => { void revision; return (season.chapters.at(-1)?.games ?? []).filter(game => game.home === human || game.away === human); });
 const won = (game: LeagueGame) => game.home === human ? game.homeRuns > game.awayRuns : game.awayRuns > game.homeRuns;
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
 const chapterRecord = $derived(`${recent.filter(won).length}–${recent.filter(game => !won(game)).length}`);
</script>

<div class="season">
 <p class="status">{[clubName(human), ...(played ? [`${mine.wins}–${mine.losses}`, ordinal(place)] : []), `rival ${clubName(rival)}`, ...(played ? [`series ${series.wins}–${series.losses}`] : [])].join(' · ')}</p>

 <Standings rows={table} {human} {rival} {clubName} />

 {#if recent.length}
  <section aria-labelledby="recent-heading">
   <h3 id="recent-heading">Chapter {played}: {chapterRecord}</h3>
   <ol class="games" aria-label={`Chapter ${played} games`}>
    {#each recent as game (game.matchday)}
     {@const home = game.home === human}
     <li class:win={won(game)}>
      <span class="day">G{game.matchday + 1}</span>
      <span>{home ? 'vs' : '@'} {clubName(home ? game.away : game.home)}</span>
      <strong>{won(game) ? 'W' : 'L'} {home ? game.homeRuns : game.awayRuns}–{home ? game.awayRuns : game.homeRuns}</strong>
     </li>
    {/each}
   </ol>
  </section>
 {/if}

</div>

<style>
 .season > * { min-width: 0; }
 .season { display: grid; gap: var(--space-6); margin-bottom: var(--space-8); }
 h3 { margin: 0 0 var(--space-3); font-size: var(--text-lg); }
 .status { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 /* One scrolling row, so a chapter's games do not push the lineup down. */
 .games { list-style: none; margin: 0; padding: 0 0 var(--space-2); display: grid; grid-auto-flow: column; grid-auto-columns: 8.5rem; gap: var(--space-1); overflow-x: auto; overscroll-behavior-x: contain; }
 .games li { display: grid; padding: var(--space-2); border: 1px solid var(--border); border-left: 3px solid var(--error); border-radius: var(--radius); font-size: var(--text-xs); }
 .games li.win { border-left-color: var(--success); }
 .day { color: var(--muted); }
</style>
