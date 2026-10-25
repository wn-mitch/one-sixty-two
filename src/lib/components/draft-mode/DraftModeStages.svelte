<script lang="ts">
 import { SvelteMap } from 'svelte/reactivity';
 import DraftBoard from '#lib/components/DraftBoard.svelte';
 import DraftEntry from '#lib/components/draft-mode/DraftEntry.svelte';
 import LeagueTab from '#lib/components/draft-mode/LeagueTab.svelte';
 import PileCaption from '#lib/components/draft-mode/PileCaption.svelte';
 import PileOpening from '#lib/components/draft-mode/PileOpening.svelte';
 import PileStatus from '#lib/components/draft-mode/PileStatus.svelte';
 import LeagueReport from '#lib/components/draft-mode/LeagueReport.svelte';
 import ChapterStatus from '#lib/components/draft-mode/ChapterStatus.svelte';
import TrainingShop from '#lib/components/draft-mode/TrainingShop.svelte';
 import WindowPanel from '#lib/components/draft-mode/WindowPanel.svelte';
 import Lineup from '#lib/components/Lineup.svelte';
 import Progress from '#lib/components/Progress.svelte';
 import type { CardMediaStatus } from '#lib/cards/view-model.ts';
 import { STACK_ROLES } from '#lib/draft/cleanup.ts';
 import { dealtProfile, pileBoardSource } from '#lib/draft/board-source.ts';
 import { effectiveCap } from '#lib/draft/rules.ts';
 import { heldPile, ownedBy, windowLineup, type WindowOrders } from '#lib/draft/run.ts';
 import { waiverCards } from '#lib/draft/market.ts';
 import { BENCH, placeFromKey, seasonForm, seasonLineupView, windowBlockers, windowLineupView } from '#lib/draft/lineup-view.ts';
 import { clubSchedule, seasonLines, swapPlaces, type ClubLineup, type Place } from '#lib/draft/league.ts';
import { developed, lastingUpgrades, trainedLine } from '#lib/draft/training.ts';
 import type { DraftSlot } from '#lib/draft/types.ts';
 import { LEAGUE_CLUBS, SEGMENT_MATCHDAYS, SEGMENTS_PER_CHAPTER } from '#lib/sim/league-types.ts';
 import type { DraftModeSession } from '#lib/draft/session.svelte.ts';
 import type { Profile, ReliefAssignment } from '#lib/game/types.ts';
 import type { DraftBullpenSlot } from '#lib/draft/rules.ts';
 import type { WarRankings } from '#lib/rankings/types.ts';
 import type { MediaManifest } from '#lib/media/types.ts';
 import { toasts } from '#lib/toast.svelte.ts';

 /** Draft Mode's screens inside the game shell, which owns loading, errors and New draft. */
 let { session, media, mediaStatus, rankings }: {
  session: DraftModeSession; media: MediaManifest | null; mediaStatus: CardMediaStatus; rankings: WarRankings | null;
 } = $props();
 const profiles = new SvelteMap<string, Profile>();
 const clubName = (seat: number) => session.clubName(seat);
 /** The seat's sealed packs were opened this visit; a reload before the first pick shows them sealed again. */
 let opened = $state(false);
 const board = $derived.by(() => {
  void session.revision;
  const run = session.run;
  if (!run || run.phase !== 'drafting') return null;
  const human = run.seating.humanSeat;
  const owned = ownedBy(run, human);
  const payroll = owned.reduce((sum, card) => sum + card.salary, 0);
  const cap = effectiveCap(run.budgets[human]);
  return {
   run, payroll, cap,
   source: pileBoardSource(run, profiles),
   rostered: owned.flatMap(card => { const profile = profiles.get(card.seasonId); return profile ? [dealtProfile(profile, card)] : []; }),
   cards: new Map(heldPile(run).map(card => [card.seasonId, card])),
   stadiumId: session.manifest?.stadiums.find(stadium => stadium.franchiseId === run.seating.seats[human])?.ref.id ?? null,
   rival: run.seating.rival ? clubName(run.seating.seats.indexOf(run.seating.rival)) : null
  };
 });

 /** Card ids the current screen names: piles and rosters while drafting, rosters and cleanup tops after. */
 const wanted = $derived.by(() => {
  void session.revision;
  const run = session.run;
  if (!run) return [];
  const ids = run.seating.seats.flatMap((_, seat) => ownedBy(run, seat).map(card => card.seasonId));
  if (run.phase === 'drafting') ids.push(...heldPile(run).map(card => card.seasonId));
  if (run.phase === 'window') ids.push(...STACK_ROLES.flatMap(role => run.pool.cleanup.peek(run.seating.humanSeat, role)?.seasonId ?? []), ...waiverCards(run));
  return ids.filter(id => !profiles.has(id));
 });
 $effect(() => {
  const ids = wanted;
  const store = session.profiles;
  if (!ids.length || !store) return;
  void store.load(ids).then(loaded => { for (const [id, profile] of loaded) profiles.set(id, profile); })
   .catch(() => toasts.show('Some cards could not load. Their names will appear when the data loads.', { id: 'draft-cards', tone: 'error' }));
 });

 /** The player's cards as dealt, finish and value included, for the lineup's card art. */
 const dealt = $derived.by(() => {
  void session.revision;
  const run = session.run;
  if (!run || run.phase === 'drafting') return [];
  return ownedBy(run, run.seating.humanSeat).flatMap(card => { const profile = profiles.get(card.seasonId); return profile ? [dealtProfile(profile, card)] : []; });
 });
 /** The lineup screen for the opening window or the next segment. */
 const stop = $derived.by(() => {
  void session.revision;
  const run = session.run;
  if (!run || !session.manifest) return null;
  if (session.screen === 'window') return { kind: 'window' as const, run, step: run.market?.step ?? 'cleanup', view: windowLineupView(run, profiles), blockers: windowBlockers(run, profiles) };
  const season = session.season;
  if (session.screen !== 'season' || !season) return null;
  const totals = seasonLines(season, run.seating.humanSeat);
  const lines = { batting: new Map(totals.batting.map(line => [line.seasonId, line])), pitching: new Map(totals.pitching.map(line => [line.seasonId, line])) };
  return { kind: 'season' as const, run, season, view: seasonLineupView(run, season, profiles), lines, played: season.segments.length };
 });
 let working = $state(false);
 async function step(result: Promise<string | null>) {
  working = true;
  try { await refusal(result); } finally { working = false; }
 }
 const gamesPerSegment = SEGMENT_MATCHDAYS * LEAGUE_CLUBS / 2;
 /** A stop's title: opening day, the end of a chapter, or the game count at a light stop. */
 const stopTitle = (played: number) => played === 0 ? 'Opening day'
  : played % SEGMENTS_PER_CHAPTER === 0 ? `Chapter ${played / SEGMENTS_PER_CHAPTER} complete` : `After game ${played * SEGMENT_MATCHDAYS}`;
 /** The broadcast while a segment plays and reveals: the player's whole schedule once it is known. */
 const broadcast = $derived.by(() => {
  void session.revision;
  const run = session.run;
  const season = session.season;
  if (session.screen !== 'playing' || !run || !season) return null;
  const played = season.segments.length - (session.playing ? 0 : 1);
  // While the segment simulates, its games count up from its league-wide progress.
  const count = session.playing ? played * SEGMENT_MATCHDAYS + Math.floor(session.completed / gamesPerSegment * SEGMENT_MATCHDAYS) : session.revealed;
  return {
   first: played * SEGMENT_MATCHDAYS + 1, last: (played + 1) * SEGMENT_MATCHDAYS, count,
   games: session.schedule ? clubSchedule(run, season, session.schedule, run.seating.humanSeat, clubName) : null
  };
 });

 /** A season row's form line, with a trained card's line in place of its printed one. */
 function trainedForm(id: string, season: NonNullable<typeof session.season>, lines: Parameters<typeof seasonForm>[1]) {
  const printed = profiles.get(id);
  const form = seasonForm(printed, lines, id);
  const note = printed ? trainedLine(printed, developed(printed, season.upgrades, season.segments.length)) : null;
  return note ? { ...form, card: form.card ? `${form.card} · ${note}` : note } : form;
 }

 function windowOrders(change: Partial<WindowOrders>): WindowOrders {
  const { battingOrder, starterOrder, reliefRoles } = windowLineup(session.run!);
  return { battingOrder, starterOrder, reliefRoles, ...change };
 }
 function seasonLineup(): ClubLineup {
  return session.season!.lineups[session.run!.seating.humanSeat];
 }
 function moveInSeason(seasonId: string, key: string) {
  const lineup = seasonLineup();
  const from: Place | undefined = (Object.entries(lineup.active).find(([, id]) => id === seasonId)?.[0] as DraftSlot | undefined) ?? (lineup.reserves.includes(seasonId) ? lineup.reserves.indexOf(seasonId) : undefined);
  if (from === undefined) return;
  void refusal(session.lineup(swapPlaces(lineup, from, placeFromKey(key))));
 }
 function submitWindow() {
  const lineup = windowLineup(session.run!);
  void step(session.submit(lineup as ClubLineup));
 }

 async function refusal(result: Promise<string | null>) {
  const message = await result;
  if (message) toasts.show(message, { tone: 'error' });
 }
 function clearHistorySelection() {
  const url = new URL(location.href);
  url.searchParams.delete('run');
  history.replaceState(history.state, '', url);
 }
</script>

{#if board && session.manifest}
 {@const current = board}
 <DraftBoard
  source={current.source}
  pile={{ opening, status, league }}
  manifest={session.manifest}
  profiles={current.rostered}
  homeStadiumId={current.stadiumId}
  phase={current.run.pick === 0 && !opened ? 'ready' : 'choosing'}
  loading={!!current.source.waiting}
  busy={session.busy}
  {rankings}
  rankingLoading={!rankings}
  rankingError={false}
  onRetryRankings={() => {}}
  onDraft={(id, slot) => void refusal(session.pick(id, slot))}
  onMove={(id, slot) => void refusal(session.place(id, slot))}
  onNew={() => session.requestNew()}
  {caption}
 />
 {#snippet opening()}<PileOpening packs={current.run.pool.rules.packsPerSeat} packSize={current.run.pool.rules.packSize} pickCount={current.source.pickCount} onOpen={() => opened = true} />{/snippet}
 {#snippet status()}<PileStatus club={clubName(current.run.seating.humanSeat)} rival={current.rival} payroll={current.payroll} cap={current.cap} />{/snippet}
 {#snippet league()}<LeagueTab run={current.run} revision={session.revision} {profiles} {clubName} />{/snippet}
 {#snippet caption(profile: Profile)}
  {@const card = current.cards.get(profile.seasonId)}
  {#if card}<PileCaption {card} room={current.cap - current.payroll} />{/if}
 {/snippet}
{:else}
<div class="page">
 {#if session.screen === 'entry' && session.manifest}
  <DraftEntry franchises={session.manifest.franchises} refused={session.refused} busy={session.busy} onStart={(id, difficulty) => { clearHistorySelection(); void session.start(id, difficulty); }} />
 {:else if stop?.kind === 'window' && session.manifest}
  {@const current = stop}
  <Lineup
   lineup={current.view} manifest={session.manifest} profiles={dealt} {rankings} rankingLoading={!rankings} rankingError={false}
   busy={session.busy || working} title="Opening window" exit={false}
   action={current.step === 'market' ? { label: 'Close waivers', busyLabel: 'Closing waivers…', always: true } : { label: 'Submit roster', busyLabel: 'Submitting…' }}
   onMove={(id, key) => void step(session.place(id, key === BENCH ? null : key as DraftSlot))}
   onOrder={(kind, order) => void refusal(session.order(windowOrders(kind === 'batting' ? { battingOrder: order } : { starterOrder: order })))}
   onRoles={roles => void refusal(session.order(windowOrders({ reliefRoles: roles as ReliefAssignment<DraftBullpenSlot>[] })))}
   onsimulate={() => current.step === 'market' ? void step(session.closeWaivers()) : submitWindow()}
  >
   {#snippet intro()}
    <WindowPanel run={current.run} revision={session.revision} {profiles} manifest={session.manifest} {media} {mediaStatus} {rankings} {clubName} {working}
     onCleanup={role => void step(session.cleanup(role))} onAutofix={() => void step(session.autofix())}
     onPropose={async (seat, give, get) => { working = true; try { const message = await session.propose(seat, give, get); if (message) toasts.show(message, { tone: 'error' }); return !message; } finally { working = false; } }}
     onRespond={(offer, accept) => void step(session.respond(offer, accept))}
     onClaim={(cardId, on) => void step(session.claim(cardId, on))} />
   {/snippet}
   {#snippet status()}
    <div class="checklist" aria-live="polite">
     {#if current.step === 'market'}
     <p class="label">Waivers open</p><p>Commons and Submit open once waivers close.</p>
    {:else if current.blockers.length}
      <p class="label">Before you submit</p>
      <ul>{#each current.blockers as blocker (blocker)}<li>{blocker}</li>{/each}</ul>
     {:else}<p class="ready">Roster is legal.</p>{/if}
    </div>
   {/snippet}
   {#snippet rowControl(seasonId: string)}
    <button type="button" class="quiet cut row-control" disabled={working} aria-label={`Cut ${profiles.get(seasonId)?.displayName ?? seasonId}`} title={current.step === 'market' ? 'Goes on waivers until they close' : 'Leaves for good'} onclick={() => void step(session.cut(seasonId))}>Cut</button>
   {/snippet}
  </Lineup>
 {:else if stop?.kind === 'season' && session.manifest}
  {@const current = stop}
  <Lineup
   lineup={current.view} manifest={session.manifest} profiles={dealt} {rankings} rankingLoading={!rankings} rankingError={false}
   busy={session.playing} title={stopTitle(current.played)}
   action={{ label: `Play games ${current.played * SEGMENT_MATCHDAYS + 1}–${(current.played + 1) * SEGMENT_MATCHDAYS}`, busyLabel: 'Playing…' }}
   form={id => trainedForm(id, current.season, current.lines)}
   onMove={moveInSeason}
   onOrder={(kind, order) => void refusal(session.lineup({ ...seasonLineup(), [kind === 'batting' ? 'battingOrder' : 'starterOrder']: order }))}
   onRoles={roles => void refusal(session.lineup({ ...seasonLineup(), reliefRoles: roles as ReliefAssignment<DraftBullpenSlot>[] }))}
   onsimulate={() => void session.playSegment()}
  >
   {#snippet intro()}
    <ChapterStatus run={current.run} season={current.season} revision={session.revision} {clubName} />
    <TrainingShop run={current.run} season={current.season} revision={session.revision} {profiles} {working} onTrain={(id, kind) => session.train(id, kind)} />
   {/snippet}
   {#snippet rowControl(seasonId: string)}
    {@const count = lastingUpgrades(current.season.upgrades, seasonId)}
    {#if count}<span class="trained" title={`${count} lasting ${count === 1 ? 'training' : 'trainings'}`} aria-label={`${count} lasting ${count === 1 ? 'training' : 'trainings'}`}>+{count}</span>{/if}
   {/snippet}
   {#snippet status()}
    <p class="progress">Games {current.played * SEGMENT_MATCHDAYS + 1}–{(current.played + 1) * SEGMENT_MATCHDAYS} of 162. Lineup changes apply from the next game; AI clubs keep their lineups.</p>
   {/snippet}
  </Lineup>
 {:else if broadcast && session.run}
  <Progress
   count={broadcast.count} games={broadcast.games} seed={session.run.setup.seed} revealed={session.revealed} revealing={session.revealing}
   heading={session.revealing ? `Games ${broadcast.first}–${broadcast.last}` : `Playing games ${broadcast.first}–${broadcast.last}`}
   note={session.revealing ? 'These games are locked. This replay only reveals them.' : 'Every club plays nine games; lineups change again at the next stop.'}
   onskip={() => session.skip()}
  />
 {:else if session.screen === 'report' && session.run && session.season}
  <LeagueReport run={session.run} season={session.season} {clubName} onNew={() => void session.startNew()} />
 {/if}
</div>
{/if}

<style>
 .page { display: grid; gap: var(--space-6); width: min(100% - 2rem, 72rem); margin-inline: auto; min-width: 0; }
 .checklist { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; margin-bottom: var(--space-3); }
 .checklist p { margin: 0; font-size: var(--text-sm); }
 .checklist .label { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
 .checklist ul { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); margin: 0; padding: 0; list-style: none; }
 .checklist li { padding: .15rem .55rem; border-radius: .4rem; background: color-mix(in oklch, var(--error) 16%, transparent); color: var(--error); font-size: var(--text-xs); font-weight: 650; }
 .ready { color: var(--success); }
 .cut { min-height: 2.25rem; padding-inline: var(--space-3); border: 1px solid var(--border); background: transparent; font-size: var(--text-xs); }
 .progress { margin: 0 0 var(--space-3); color: var(--muted); font-size: var(--text-sm); }
 .trained { display: inline-grid; place-items: center; min-width: 2rem; min-height: 1.5rem; padding-inline: var(--space-1); border-radius: .4rem; background: color-mix(in oklch, var(--success) 18%, transparent); color: var(--success); font-size: var(--text-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
