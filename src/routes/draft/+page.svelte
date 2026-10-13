<script lang="ts">
 import { onMount } from 'svelte';
 import { SvelteMap } from 'svelte/reactivity';
 import DraftEntry from '#lib/components/draft-mode/DraftEntry.svelte';
 import DraftTable from '#lib/components/draft-mode/DraftTable.svelte';
 import LeagueReport from '#lib/components/draft-mode/LeagueReport.svelte';
 import LeagueSeason from '#lib/components/draft-mode/LeagueSeason.svelte';
 import OpeningWindow from '#lib/components/draft-mode/OpeningWindow.svelte';
 import type { CardMediaStatus } from '#lib/cards/view-model.ts';
 import { STACK_ROLES } from '#lib/draft/cleanup.ts';
 import { heldPile, ownedBy } from '#lib/draft/run.ts';
 import { DraftModeSession } from '#lib/draft/session.svelte.ts';
 import type { Profile } from '#lib/game/types.ts';
 import { loadMedia } from '#lib/media/client.ts';
 import { loadRankings } from '#lib/rankings/client.ts';
 import type { WarRankings } from '#lib/rankings/types.ts';
 import type { MediaManifest } from '#lib/media/types.ts';
 import { toasts } from '#lib/toast.svelte.ts';

 const session = new DraftModeSession();
 const profiles = new SvelteMap<string, Profile>();
 let media = $state.raw<MediaManifest | null>(null);
 let mediaStatus = $state<CardMediaStatus>('loading');
 let rankings = $state.raw<WarRankings | null>(null);
 let confirmingNew = $state(false);
 const clubName = (seat: number) => session.clubName(seat);

 onMount(() => {
  void session.initialize();
  void loadMedia().then(value => { media = value; mediaStatus = 'ready'; }).catch(() => { mediaStatus = 'unavailable'; });
  return () => session.dispose();
 });
 // Cards show WAR/162 from the rankings for the loaded data version; without them the box stays blank.
 $effect(() => {
  const version = session.manifest?.dataVersion;
  let disposed = false;
  rankings = null;
  if (version) void loadRankings(version).then(value => { if (!disposed) rankings = value; }).catch(() => {});
  return () => { disposed = true; };
 });
 $effect(() => { if (session.storageNotice) toasts.show(session.storageNotice, { id: 'draft-storage', tone: 'error' }); });

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
 async function startNew() {
  confirmingNew = false;
  await session.abandon();
  window.scrollTo({ top: 0 });
 }
</script>

<svelte:head><title>Draft Mode · 162-0</title></svelte:head>

<main class="page" class:wide={session.screen === 'drafting'}>
 <nav class="top">
  <a class="back-link" href="/">← 162-0</a>
  {#if session.run}
   {#if confirmingNew}
    <span class="confirm" role="group" aria-label="Leave this run?">
     <span>Leave this run?</span>
     <button onclick={() => confirmingNew = false}>Keep run</button>
     <button onclick={startNew}>Discard</button>
    </span>
   {:else}<button class="quiet" onclick={() => confirmingNew = true}>New draft</button>{/if}
  {/if}
 </nav>

 {#if session.screen === 'loading'}
  <p class="muted" role="status">Loading Draft Mode…</p>
 {:else if session.screen === 'failed'}
  <div class="failed" role="alert">
   <p>{session.failure}</p>
   {#if session.run && session.season}<button class="primary" onclick={() => { session.failure = ''; void session.playChapter(); }}>Retry chapter</button>
   {:else}<button class="primary" onclick={() => location.reload()}>Reload</button>{/if}
  </div>
 {:else if session.screen === 'entry' && session.manifest}
  <DraftEntry franchises={session.manifest.franchises} refused={session.refused} busy={session.busy} onStart={(id, difficulty) => void session.start(id, difficulty)} />
 {:else if session.screen === 'drafting' && session.run}
  <DraftTable run={session.run} revision={session.revision} {profiles} manifest={session.manifest} {media} {mediaStatus} {rankings} {clubName}
   onPick={cardId => refusal(session.pick(cardId))} />
 {:else if session.screen === 'window' && session.run}
  <OpeningWindow run={session.run} revision={session.revision} {profiles} manifest={session.manifest} {media} {mediaStatus} {rankings} {clubName}
   onCut={id => refusal(session.cut(id))} onCleanup={role => refusal(session.cleanup(role))} onAutofix={() => refusal(session.autofix())}
   onSubmit={(active, reserves) => refusal(session.submit(active, reserves))} />
 {:else if session.screen === 'season' && session.run && session.season}
  <LeagueSeason run={session.run} season={session.season} revision={session.revision} {profiles} playing={session.playing} completed={session.completed} {clubName}
   onLineup={async lineup => { const message = await session.lineup(lineup); if (message) toasts.show(message, { tone: 'error' }); return message; }} onPlay={() => void session.playChapter()} />
 {:else if session.screen === 'report' && session.run && session.season}
  <LeagueReport run={session.run} season={session.season} {clubName} onNew={startNew} />
 {/if}
</main>

<style>
 .page { display: grid; gap: var(--space-6); width: min(100% - 2rem, 72rem); margin-inline: auto; padding-block: var(--space-6) 0; min-width: 0; }
 .page.wide { width: min(100% - 2rem, 90rem); }
 .top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
 .back-link { color: var(--muted); font-weight: 700; text-decoration: none; }
 .quiet { background: transparent; }
 .confirm { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: var(--text-sm); }
 .failed { display: grid; gap: var(--space-3); justify-items: start; }
 .failed p { margin: 0; color: var(--error); }
</style>
