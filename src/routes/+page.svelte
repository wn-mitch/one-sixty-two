<script lang="ts">
 import { onMount, tick } from 'svelte';
 import { Session } from '#lib/game/session.svelte.ts';
 import DraftBoard from '#lib/components/DraftBoard.svelte';
 import Lineup from '#lib/components/Lineup.svelte';
 import Progress from '#lib/components/Progress.svelte';
 import Results from '#lib/components/Results.svelte';
 import Welcome from '#lib/components/Welcome.svelte';
 import { createCardViewModel, type CardMediaStatus } from '#lib/cards/view-model.ts';
 import { draftRules } from '#lib/game/rules.ts';
 import { loadShowcase } from '#lib/game/data.ts';
 import type { ShowcaseCard } from '#lib/game/types.ts';
 import { loadMedia } from '#lib/media/client.ts';
 import type { MediaManifest } from '#lib/media/types.ts';
 import { loadRankings } from '#lib/rankings/client.ts';
 import type { WarRankings } from '#lib/rankings/types.ts';

 const session = new Session();
 let rankings = $state.raw<WarRankings | null>(null);
 let rankingLoading = $state(false);
 let rankingError = $state(false);
 let rankingAttempt = $state(0);
 let showcase = $state.raw<ShowcaseCard[]>([]);
 let showcaseLoading = $state(false);
 let showcaseError = $state(false);
 let media = $state.raw<MediaManifest | null>(null);
 let mediaStatus = $state<CardMediaStatus>('loading');
 const rankingVersion = $derived(session.draft?.dataVersion ?? session.manifest?.dataVersion ?? null);
 const showcaseCards = $derived(showcase.map(({ profile, slot }) => ({
  seasonId: profile.seasonId,
  playerId: profile.playerId,
  model: createCardViewModel({ profile, slot, manifest: session.manifest, media, mediaStatus, rankings })
 })));

 function retryRankings() {
  rankingAttempt++;
 }
 onMount(() => {
  let disposed = false;
  void session.initialize();
  void loadMedia()
   .then(value => { if (!disposed) { media = value; mediaStatus = 'ready'; } })
   .catch(() => { if (!disposed) mediaStatus = 'unavailable'; });
  return () => {
   disposed = true;
   session.dispose();
  };
 });
 $effect(() => {
  const manifest = session.manifest;
  let disposed = false;
  showcase = [];
  showcaseLoading = !!manifest;
  showcaseError = false;
  if (manifest) {
   void loadShowcase(manifest)
    .then(value => { if (!disposed) showcase = value; })
    .catch(() => { if (!disposed) showcaseError = true; })
    .finally(() => { if (!disposed) showcaseLoading = false; });
  }
  return () => { disposed = true; };
 });
 $effect(() => {
  const version = rankingVersion;
  rankingAttempt;
  let disposed = false;
  rankings = null;
  rankingLoading = !!version;
  rankingError = false;
  if (version) {
   void loadRankings(version)
    .then(value => { if (!disposed) rankings = value; })
    .catch(() => { if (!disposed) rankingError = true; })
    .finally(() => { if (!disposed) rankingLoading = false; });
  }
  return () => { disposed = true; };
 });
 $effect(() => {
  const phase = session.phase;
  const choosing = phase === 'choosing' && !session.loading;
  const target = phase === 'ready' ? '#roll-next' : choosing ? '.candidates input[type="search"]' : phase === 'lineup' ? '#lineup-heading' : phase === 'simulating' ? '#simulation-heading' : phase === 'results' ? '#results-heading' : null;
  if (target) void tick().then(() => {
   if (session.phase !== phase || (phase === 'choosing' && session.loading)) return;
   document.querySelector<HTMLElement>(target)?.focus({ preventScroll: phase === 'results' });
   if (phase === 'results') window.scrollTo(0, 0);
  });
 });
</script>


<main class:home-start={session.phase === 'start'}>
 <div class="sr-only" aria-live="polite" aria-atomic="true">{session.announce}</div>
 <div class="session-feedback">
  {#if session.storageNotice}<p class="notice">{session.storageNotice}</p>{/if}
  {#if session.error}
   <div class="error" role="alert">
    <p>{session.error}</p>
    {#if session.canRetry}<button class="secondary" disabled={session.loading} onclick={() => void session.retry()}>Retry</button>{/if}
    {#if session.incompatible}<button class="secondary" disabled={session.loading} onclick={() => session.requestNew()}>Start new draft</button>{/if}
   </div>
  {/if}
  {#if session.confirmNew}
   <section class="confirmation" aria-label="Confirm new draft">
    <h2>Leave this roster behind?</h2>
    <p>Your picks are permanent. Starting a new draft replaces this saved run with a new seed.</p>
    <div class="actions"><button class="secondary" onclick={() => session.confirmNew = false}>Keep draft</button><button class="primary" onclick={() => void session.startNew()}>Discard and start new</button></div>
   </section>
  {/if}
 </div>

 {#if session.phase === 'start'}
  <Welcome manifest={session.manifest} loading={session.loading} hasSavedDraft={!!session.savedDraft} onStart={() => session.requestNew()} onResume={() => void session.resume()} cards={showcaseCards} showcaseStatus={showcaseLoading ? 'loading' : showcaseError ? 'unavailable' : 'ready'} {mediaStatus} />
 {:else if session.draft && session.manifest}
  {#if session.phase === 'ready' || session.phase === 'revealing' || session.phase === 'choosing'}
   <div class="draft-top narrow-draft-top"><p class="eyebrow">Historical draft <span class="stage-divider">/</span> {session.draft.picks.length} of {draftRules(session.draft.schemaVersion).slots.length} picked</p><button class="quiet" disabled={session.loading} onclick={() => session.requestNew()}>New draft</button></div>
   <DraftBoard draft={session.draft} manifest={session.manifest} pool={session.pool} profiles={session.profiles} phase={session.phase} loading={session.loading} busy={session.busy} error={session.error} {rankings} {rankingLoading} {rankingError} onRetryRankings={retryRankings} onRoll={() => void session.roll()} onDraft={(id, slot) => session.commit(id, slot)} onReassign={(id, slot) => session.reassign(id, slot)} onNew={() => session.requestNew()} />
  {:else if session.phase === 'lineup'}
   <div class="draft-top"><p class="eyebrow">Roster complete</p><button class="quiet" disabled={session.loading} onclick={() => session.requestNew()}>New draft</button></div>
   <Lineup draft={session.draft} profiles={session.profiles} manifest={session.manifest} {rankings} {rankingLoading} {rankingError} busy={session.busy} onReassign={(id, slot) => session.reassign(id, slot)} onOrder={(kind, order) => session.order(kind, order)} onsimulate={() => void session.simulate()} />
  {:else if session.phase === 'simulating'}
   <div class="draft-top"><p class="eyebrow">Season in play</p><button class="quiet" disabled={session.loading} onclick={() => session.requestNew()}>New draft</button></div>
   <Progress completed={session.completed} revealed={session.revealed} result={session.result} onskip={() => session.skip()} />
  {:else if session.phase === 'results' && session.result}
   <Results result={session.result} draft={session.draft} profiles={session.profiles} manifest={session.manifest} {rankings} {rankingLoading} {rankingError} onNew={() => session.requestNew()} onShare={(action, format) => void session.share(action, format)} publication={session.publication} sharing={session.sharing} shareStatus={session.shareStatus} />
  {/if}
 {/if}
</main>

<style>
 main { min-height: 65vh; padding-block: var(--space-6); }
 main:has(:global(.draft-board.wide)) { padding-top: 0; }
 main:has(:global(.draft-board.wide)) .narrow-draft-top { display: none; }
 .home-start { position: relative; padding-block: 0; }
 .session-feedback:empty { display: none; }
 .home-start .session-feedback {
  position: relative;
  z-index: 3;
  width: min(80rem, 100%);
  margin-inline: auto;
  padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
 }
 .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
 .draft-top { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
 .stage-divider { padding-inline: var(--space-2); color: var(--border); }
 .confirmation { border: 1px solid var(--accent); background: var(--surface); padding: var(--space-5); border-radius: var(--radius); margin-bottom: var(--space-6); }
 .confirmation h2 { font-size: var(--text-xl); }
 .error p { margin: 0 0 var(--space-3); }
 .error button + button { margin-left: var(--space-2); }
 .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 @media (max-width: 24rem) {
  .draft-top .eyebrow { max-width: 10rem; }
 }
</style>
