<script lang="ts">
 import Standings from './Standings.svelte';
 import DecreeMemo from './DecreeMemo.svelte';
 import { segmentDecree } from '../../draft/decrees.ts';
 import { conditionFamiliarity, FAMILIAR_LABELS, FREEZE_CALENDAR, familiarUnder, franchisePackage, FUNDINGS, homeCondition, knowHowCount, knowHowFor, parkHost, strongDollar, suitedFunding, type Funding } from '../../draft/packages.ts';
 import { fill, paydayTotal } from '../../draft/fans.ts';
 import { canVoteFunding, headToHead, nextChapter, seasonExchange, standings, type LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import type { Profile } from '../../game/types.ts';
 import { LEAGUE_CHAPTERS, LEAGUE_SEGMENTS, MAX_CROWD_HYPE, SEGMENT_MATCHDAYS, type LeagueGame } from '../../sim/league-types.ts';

 /**
  * A stop above the lineup: the club's record and rival series, the decree in force for the next
  * games, its crowd and cash, how many active players know the home park, the standings, and the
  * last nine games. A club with funding votes casts its vote for the next chapter's grounds here.
  */
 let { run, season, revision, profiles, clubName, working = false, onVote }: {
  run: DraftRun; season: LeagueSeason; revision: number; profiles: ReadonlyMap<string, Profile>; clubName: (seat: number) => string;
  working?: boolean; onVote?: (funding: Funding) => void;
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
 const share = $derived.by(() => { void revision; return fill(run.seating.seats[human], fans, seasonExchange(run, season, human)); });
 const MOODS: [number, string][] = [[-.5, 'Hostile'], [-.15, 'Restless'], [.15, 'Steady'], [.5, 'Buzzing'], [Infinity, 'Euphoric']];
 const mood = $derived(MOODS.find(([bound]) => fans.sentiment < bound)![1]);
 const pct = (value: number) => value.toFixed(3).replace(/^0/, '');
 const won = (game: LeagueGame) => game.home === human ? game.homeRuns > game.awayRuns : game.awayRuns > game.homeRuns;
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
 const pack = $derived(franchisePackage(run.seating.seats[human]));
 const decree = $derived(segmentDecree(run.setup.seed, Math.min(played, LEAGUE_SEGMENTS - 1)));
 // A trigger that fills a meter shows how full it is; front-runners have no meter.
 const hype = $derived.by(() => { void revision; return pack?.crowd && pack.crowd !== 'frontRunners' ? Math.round((season.segments.at(-1)?.hype[human] ?? 0) / MAX_CROWD_HYPE * 100) : null; });
 // The next games' lineup as printed, once every card has loaded.
 const printed = $derived.by(() => {
  void revision;
  const active = season.lineups[human].active;
  const roster = run.pool.rules.activeSlots.map(slot => ({ profile: profiles.get(active[slot]), slot }));
  return roster.some(pick => !pick.profile) ? null : roster as { profile: Profile; slot: typeof roster[number]['slot'] }[];
 });
 // The franchise whose park condition plays at home this chapter: its own, or a relocating club's host.
 const host = $derived.by(() => { void revision; return parkHost(run.seating.seats[human], run.setup.seed, nextChapter(season)); });
 const hostPack = $derived(franchisePackage(host));
 // A relocating club's park this chapter and, while there is one, the next.
 const venue = $derived.by(() => {
  void revision;
  if (!pack?.relocation || !hostPack?.familiar) return null;
  const chapter = nextChapter(season);
  return { name: hostPack.name, fits: FAMILIAR_LABELS[hostPack.familiar.rule], next: chapter + 1 < LEAGUE_CHAPTERS ? franchisePackage(parkHost(run.seating.seats[human], run.setup.seed, chapter + 1))?.name ?? null : null };
 });
 // The next chapter's grounds under funding votes: the vote cast, else the state the lineup knows better.
 const chapter = $derived.by(() => { void revision; return nextChapter(season); });
 const funding = $derived.by(() => { void revision; return pack?.funding && printed ? season.funding[chapter] ?? suitedFunding(run.seating.seats[human], printed) : null; });
 const voted = $derived.by(() => { void revision; return season.funding[chapter] !== undefined; });
 const voting = $derived.by(() => { void revision; return !!onVote && canVoteFunding(run, season); });
 // The park condition at home games and the players in that lineup who know it.
 const home = $derived(pack?.funding && !funding ? null : homeCondition(run.seating.seats[human], run.setup.seed, chapter, funding));
 const familiar = $derived(home?.condition.familiar && printed ? { count: familiarUnder(home.condition.familiar.rule, printed), edge: conditionFamiliarity(home.condition, printed, home.scale) } : null);
 const GROUNDS = { funded: 'fast grass, ground balls through quicker', shutdown: 'long grass, every ball on the ground slower' } as const;
 // Fielders in that lineup whose gloves give the club its know-how.
 const knowHow = $derived(pack?.knowHow && printed ? { count: knowHowCount(run.seating.seats[human], printed)!, edge: knowHowFor(run.seating.seats[human], printed) } : null);
 // The free hitting trainings the last payday brought, and the longest streak behind one.
 const ironMan = $derived.by(() => {
  void revision;
  if (!pack?.ironMan || !played) return null;
  const free = season.upgrades.filter(upgrade => upgrade.paidBy === human && upgrade.free && upgrade.stop === played);
  return { count: free.length, longest: free.reduce((most, upgrade) => Math.max(most, Math.round((upgrade.scale ?? 0) / pack.ironMan!.step)), 0) };
 });
 // The exchange rate this chapter and, while there is one, the next.
 const dollar = $derived.by(() => {
  void revision;
  if (!pack?.exchangeRate) return null;
  const chapter = nextChapter(season);
  return { strong: strongDollar(run.setup.seed, chapter), next: chapter + 1 < LEAGUE_CHAPTERS ? strongDollar(run.setup.seed, chapter + 1) : null };
 });
 // The Deep Freeze's weather this chapter and, while there is one, the next.
 const weather = $derived.by(() => {
  void revision;
  if (home?.condition.park !== 'deepFreeze') return null;
  return { now: FREEZE_CALENDAR[chapter], next: FREEZE_CALENDAR[chapter + 1] ?? null };
 });
 const WEATHER = { cold: 'starters tire far sooner, the air is heavy', thaw: 'starters tire sooner, the air is a little heavy', cool: 'starters tire sooner, the air is a little heavy', warm: 'ordinary conditions' } as const;
 // Sale bonuses the club has banked this season.
 const sales = $derived.by(() => { void revision; return pack?.saleBonus ? season.sales.filter(sale => sale.seat === human) : null; });
 const segmentRecord = $derived(`${recent.filter(won).length}–${recent.filter(game => !won(game)).length}`);
</script>

<div class="season">
 <p class="status">{[clubName(human), ...(played ? [`${mine.wins}–${mine.losses}`, ordinal(place)] : []), `rival ${clubName(rival)}`, ...(played ? [`series ${series.wins}–${series.losses}`] : [])].join(' · ')}</p>

 {#if played < LEAGUE_SEGMENTS}<DecreeMemo {decree} label="Decree in force" />{/if}

 <section class="crowd" aria-labelledby="crowd-heading">
  <h3 id="crowd-heading">Crowd and cash</h3>
  <dl>
   <div><dt>Mood</dt><dd data-mood={mood.toLowerCase()}>{mood}</dd></div>
   <div><dt>Fans expect</dt><dd>{pct(fans.expectation)}</dd></div>
   <div><dt>Seats filled</dt><dd>{Math.round(share * 100)}%</dd></div>
   {#if payday}<div><dt>Payday</dt><dd>+{paydayTotal(payday)} <small>{payday.salary} salary + {payday.gate} gate{payday.homeGames ? '' : ' (all road)'} + {payday.winBonus} for {payday.wins} {payday.wins === 1 ? 'win' : 'wins'}{payday.franchise ? ` + ${payday.franchise} ${pack?.name ?? 'franchise'}` : ''}</small></dd></div>{/if}
   {#if hype !== null}<div><dt>Hype</dt><dd>{hype}% <small>of the most the crowd can lean</small></dd></div>{/if}
   {#if knowHow}<div><dt>Know-how</dt><dd>{knowHow.count} {knowHow.count === 1 ? 'glove' : 'gloves'} <small>every fielder {(knowHow.edge * 15).toFixed(1)}% quicker to the ball</small></dd></div>{/if}
   {#if ironMan}<div><dt>Iron Man</dt><dd>{ironMan.count} free <small>hitting trainings at the last payday{ironMan.count ? `, longest streak ${ironMan.longest} ${ironMan.longest === 1 ? 'stop' : 'stops'}` : ''}</small></dd></div>{/if}
   {#if venue}<div><dt>Home park</dt><dd>{venue.name} <small>{venue.fits} know it{venue.next ? `; next chapter ${venue.next}` : ''}</small></dd></div>{/if}
   {#if funding && pack?.funding}
    {@const grounds = pack.funding[funding]}
    <div><dt>Grounds</dt><dd>{funding === 'funded' ? 'Funded' : 'Shutdown'} <small>{GROUNDS[funding]}; {grounds?.familiar ? `${FAMILIAR_LABELS[grounds.familiar.rule]} know them · ` : ''}{voting ? (voted ? 'your vote' : 'the vote your lineup suits, until you vote') : 'this chapter'}</small>
     {#if voting}<span class="vote" role="group" aria-label="Funding vote">{#each FUNDINGS as option (option)}<button type="button" class="push" class:on={voted && funding === option} aria-pressed={voted && funding === option} disabled={working} onclick={() => onVote?.(option)}>{option === 'funded' ? 'Fund' : 'Shut down'}</button>{/each}</span>{/if}
    </dd></div>
   {/if}
   {#if familiar}<div><dt>Know the park</dt><dd>{familiar.count} active <small>home batted balls {(familiar.edge * 100).toFixed(1)}% harder, visitors' {(familiar.edge * 100).toFixed(1)}% softer</small></dd></div>{/if}
   {#if dollar && pack?.exchangeRate}<div><dt>Dollar</dt><dd>{dollar.strong ? 'Strong' : 'Weak'} <small>training {Math.round(pack.exchangeRate.price * 100)}% {dollar.strong ? 'cheaper, stands thinner' : 'dearer, stands fuller'}{dollar.next === null ? '' : `; next chapter ${dollar.next ? 'strong' : 'weak'}`}</small></dd></div>{/if}
   {#if weather}<div><dt>Weather</dt><dd>{weather.now[0].toUpperCase() + weather.now.slice(1)} <small>{WEATHER[weather.now]} at home{weather.next ? `; next chapter ${weather.next}` : ''}</small></dd></div>{/if}
   {#if sales}<div><dt>Sale bonuses</dt><dd>+{sales.reduce((sum, sale) => sum + sale.cash, 0)} <small>{sales.length} trained {sales.length === 1 ? 'card' : 'cards'} traded away</small></dd></div>{/if}
   <div><dt>Bank</dt><dd>{cash}</dd></div>
  </dl>
  {#if pack}<p class="note"><strong>{pack.name}.</strong> {pack.summary}</p>{/if}
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
 .vote { display: flex; gap: var(--space-1); margin-top: var(--space-1); }
 .push { min-height: 2.25rem; padding-inline: var(--space-3); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: var(--text-xs); white-space: nowrap; }
 .push.on { background: var(--accent); color: var(--background); }
 .push:disabled { border-color: var(--border); color: var(--muted); }
</style>
