<script lang="ts">
 import LeagueLineup from './LeagueLineup.svelte';
 import Standings from './Standings.svelte';
 import { headToHead, seasonLines, standings, type ClubLineup, type LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import type { Profile } from '../../game/types.ts';
 import { CHAPTER_MATCHDAYS, LEAGUE_CHAPTERS, LEAGUE_CLUBS, type LeagueGame } from '../../sim/league-types.ts';

 let { run, season, revision, profiles, playing, completed, clubName, onLineup, onPlay }: {
  run: DraftRun; season: LeagueSeason; revision: number; profiles: ReadonlyMap<string, Profile>;
  playing: boolean; completed: number; clubName: (seat: number) => string;
  onLineup: (lineup: ClubLineup) => Promise<string | null>; onPlay: () => void;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const rival = $derived(season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!);
 const played = $derived.by(() => { void revision; return season.chapters.length; });
 const table = $derived.by(() => { void revision; return standings(season); });
 const mine = $derived(table.find(row => row.seat === human)!);
 const place = $derived(table.findIndex(row => row.seat === human) + 1);
 const series = $derived.by(() => { void revision; return headToHead(season, human, rival); });
 const recent = $derived.by(() => { void revision; return (season.chapters.at(-1)?.games ?? []).filter(game => game.home === human || game.away === human); });
 const lineup = $derived.by(() => { void revision; return season.lineups[human]; });
 const lines = $derived.by(() => { void revision; return seasonLines(season, human); });
 const gamesPerChapter = CHAPTER_MATCHDAYS * LEAGUE_CLUBS / 2;
 const won = (game: LeagueGame) => game.home === human ? game.homeRuns > game.awayRuns : game.awayRuns > game.homeRuns;
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
 const chapterRecord = $derived(`${recent.filter(won).length}–${recent.filter(game => !won(game)).length}`);
</script>

<div class="season">
 <header class="status">
  <div>
   <h1>{played === 0 ? 'Opening day' : `After chapter ${played} of ${LEAGUE_CHAPTERS}`}</h1>
   <p>{[clubName(human), ...(played ? [`${mine.wins}–${mine.losses}`, ordinal(place)] : []), `rival ${clubName(rival)}`, ...(played ? [`series ${series.wins}–${series.losses}`] : [])].join(' · ')}</p>
  </div>
 </header>

 <Standings rows={table} {human} {rival} {clubName} />

 {#if recent.length}
  <section aria-labelledby="recent-heading">
   <h2 id="recent-heading">Chapter {played}: {chapterRecord}</h2>
   <ol class="games">
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

 <section aria-labelledby="lineup-heading">
  <h2 id="lineup-heading">Lineup for chapter {played + 1}</h2>
  <p class="note">Changes apply from the next chapter. AI clubs keep their lineups.</p>
  <LeagueLineup {run} {lineup} {profiles} {lines} disabled={playing} onChange={onLineup} />
 </section>

 <footer class="play">
  {#if playing}
   <p aria-live="polite">Playing chapter {played + 1}… {completed} of {gamesPerChapter} games</p>
   <progress max={gamesPerChapter} value={completed}></progress>
  {:else}
   <p>Games {played * CHAPTER_MATCHDAYS + 1}–{(played + 1) * CHAPTER_MATCHDAYS} of 162</p>
   <button class="primary" onclick={onPlay}>Play chapter {played + 1}</button>
  {/if}
 </footer>
</div>

<style>
 .season > * { min-width: 0; }
 .season { display: grid; gap: var(--space-6); }
 .status { padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
 h1 { margin: 0; font-size: var(--text-xl); }
 h2 { margin: 0 0 var(--space-3); font-size: var(--text-base); }
 .status p, .note { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .note { margin-bottom: var(--space-3); }
 .games { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: var(--space-1); }
 .games li { display: grid; padding: var(--space-2); border: 1px solid var(--border); border-left: 3px solid var(--error); border-radius: var(--radius); font-size: var(--text-xs); }
 .games li.win { border-left-color: var(--success); }
 .day { color: var(--muted); }
 .play { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--background); border-top: 1px solid var(--border); }
 .play p { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 progress { flex: 1 1 12rem; accent-color: var(--accent); }
</style>
