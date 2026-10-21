<script lang="ts">
 import { SvelteMap } from 'svelte/reactivity';
 import DraftBoard from '#lib/components/DraftBoard.svelte';
 import DraftEntry from '#lib/components/draft-mode/DraftEntry.svelte';
 import LeagueTab from '#lib/components/draft-mode/LeagueTab.svelte';
 import PileCaption from '#lib/components/draft-mode/PileCaption.svelte';
 import PileOpening from '#lib/components/draft-mode/PileOpening.svelte';
 import PileStatus from '#lib/components/draft-mode/PileStatus.svelte';
 import LeagueReport from '#lib/components/draft-mode/LeagueReport.svelte';
 import LeagueSeason from '#lib/components/draft-mode/LeagueSeason.svelte';
 import OpeningWindow from '#lib/components/draft-mode/OpeningWindow.svelte';
 import type { CardMediaStatus } from '#lib/cards/view-model.ts';
 import { STACK_ROLES } from '#lib/draft/cleanup.ts';
 import { dealtProfile, pileBoardSource } from '#lib/draft/board-source.ts';
 import { effectiveCap } from '#lib/draft/rules.ts';
 import { heldPile, ownedBy } from '#lib/draft/run.ts';
 import type { DraftModeSession } from '#lib/draft/session.svelte.ts';
 import type { Profile } from '#lib/game/types.ts';
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
  if (run.phase === 'window') ids.push(...STACK_ROLES.flatMap(role => run.pool.cleanup.peek(run.seating.humanSeat, role)?.seasonId ?? []));
  return ids.filter(id => !profiles.has(id));
 });
 $effect(() => {
  const ids = wanted;
  const store = session.profiles;
  if (!ids.length || !store) return;
  void store.load(ids).then(loaded => { for (const [id, profile] of loaded) profiles.set(id, profile); })
   .catch(() => toasts.show('Some cards could not load. Their names will appear when the data loads.', { id: 'draft-cards', tone: 'error' }));
 });

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
 {:else if session.screen === 'window' && session.run}
  <OpeningWindow run={session.run} revision={session.revision} {profiles} manifest={session.manifest} {media} {mediaStatus} {rankings} {clubName}
   onCut={id => refusal(session.cut(id))} onCleanup={role => refusal(session.cleanup(role))} onAutofix={() => refusal(session.autofix())}
   onSubmit={(active, reserves) => refusal(session.submit(active, reserves))} />
 {:else if session.screen === 'season' && session.run && session.season}
  <LeagueSeason run={session.run} season={session.season} revision={session.revision} {profiles} playing={session.playing} completed={session.completed} {clubName}
   onLineup={async lineup => { const message = await session.lineup(lineup); if (message) toasts.show(message, { tone: 'error' }); return message; }} onPlay={() => void session.playChapter()} />
 {:else if session.screen === 'report' && session.run && session.season}
  <LeagueReport run={session.run} season={session.season} {clubName} onNew={() => void session.startNew()} />
 {/if}
</div>
{/if}

<style>
 .page { display: grid; gap: var(--space-6); width: min(100% - 2rem, 72rem); margin-inline: auto; min-width: 0; }
</style>
