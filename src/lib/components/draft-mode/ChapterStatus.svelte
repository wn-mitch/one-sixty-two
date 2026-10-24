<script lang="ts">
 import Standings from './Standings.svelte';
 import { fill, paydayTotal } from '../../draft/fans.ts';
 import { headToHead, standings, type LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { SEGMENT_MATCHDAYS, type LeagueGame } from '../../sim/league-types.ts';

 /**
  * A stop above the lineup: the club's record and rival series, its crowd and cash, the standings,
  * and the last nine games.
  */
 let { run, season, revision, clubName }: {
  run: DraftRun; season: LeagueSeason; revision: number; clubName: (seat: number) => string;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const rival = $derived(season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!);
 const played = $derived.by(() => { void revision; return season.segments.length; });
 const table = $derived.by(() => { void revision; return standings(season); });
 const mine = $derived(table.find(row => row.seat === human)!);
 const place = $derived(table.findIndex(row => row.seat === human) + 1);
 const series = $derived.by(() => { void revision; return headToHead(season, human, rival); });
 const recent = $derived.by(() => { void revision; return (season.segments.at(-1)?.games ?? []).filter(game => game.home === human || game.away === human); });
 // Fans and cash are replaced, not mutated, at each stop, but the season object is the same.
 const fans = $derived.by(() => { void revision; return season.fans[human]; });
 const cash = $derived.by(() => { void revision; return season.cash[human]; });
 const payday = $derived.by(() => { void revision; return season.segments.at(-1)?.paydays[human] ?? null; });
 const share = $derived(fill(run.seating.seats[human], fans));
 const MOODS: [number, string][] = [[-.5, 'Hostile'], [-.15, 'Restless'], [.15, 'Steady'], [.5, 'Buzzing'], [Infinity, 'Euphoric']];
 const mood = $derived(MOODS.find(([bound]) => fans.sentiment < bound)![1]);
 const pct = (value: number) => value.toFixed(3).replace(/^0/, '');
 const won = (game: LeagueGame) => game.home === human ? game.homeRuns > game.awayRuns : game.awayRuns > game.homeRuns;
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
 const segmentRecord = $derived(`${recent.filter(won).length}–${recent.filter(game => !won(game)).length}`);
</script>

<div class="season">
 <p class="status">{[clubName(human), ...(played ? [`${mine.wins}–${mine.losses}`, ordinal(place)] : []), `rival ${clubName(rival)}`, ...(played ? [`series ${series.wins}–${series.losses}`] : [])].join(' · ')}</p>

 <section class="crowd" aria-labelledby="crowd-heading">
  <h3 id="crowd-heading">Crowd and cash</h3>
  <dl>
   <div><dt>Mood</dt><dd data-mood={mood.toLowerCase()}>{mood}</dd></div>
   <div><dt>Fans expect</dt><dd>{pct(fans.expectation)}</dd></div>
   <div><dt>Seats filled</dt><dd>{Math.round(share * 100)}%</dd></div>
   {#if payday}<div><dt>Payday</dt><dd>+{paydayTotal(payday)} <small>{payday.salary} salary + {payday.gate} gate{payday.homeGames ? '' : ' (all road)'} + {payday.winBonus} for {payday.wins} {payday.wins === 1 ? 'win' : 'wins'}</small></dd></div>{/if}
   <div><dt>Bank</dt><dd>{cash}</dd></div>
  </dl>
  <p class="note">Every win pays, more the wider the margin. Win more than your fans expect and the stands fill, the gate grows and the home crowd leans the strike zone your way. Disappoint them and it turns.</p>
 </section>

 <Standings rows={table} {human} {rival} {clubName} />

 {#if recent.length}
  <section aria-labelledby="recent-heading">
   <h3 id="recent-heading">Games {(played - 1) * SEGMENT_MATCHDAYS + 1}–{played * SEGMENT_MATCHDAYS}: {segmentRecord}</h3>
   <ol class="games" aria-label="Last nine games">
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
 .note { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--text-xs); }
 dl { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); margin: 0; }
 dl div { display: grid; min-width: 0; }
 dt { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
 dd { margin: 0; font-size: var(--text-lg); font-weight: 700; font-variant-numeric: tabular-nums; }
 dd small { display: block; color: var(--muted); font-size: var(--text-xs); font-weight: 500; }
 dd[data-mood='hostile'], dd[data-mood='restless'] { color: var(--error); }
 dd[data-mood='buzzing'], dd[data-mood='euphoric'] { color: var(--success); }
 /* One scrolling row, so a segment's games do not push the lineup down. */
 .games { list-style: none; margin: 0; padding: 0 0 var(--space-2); display: grid; grid-auto-flow: column; grid-auto-columns: 8.5rem; gap: var(--space-1); overflow-x: auto; overscroll-behavior-x: contain; }
 .games li { display: grid; padding: var(--space-2); border: 1px solid var(--border); border-left: 3px solid var(--error); border-radius: var(--radius); font-size: var(--text-xs); }
 .games li.win { border-left-color: var(--success); }
 .day { color: var(--muted); }
</style>
