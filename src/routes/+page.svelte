<script lang="ts">
 import { onMount, tick } from 'svelte';
 import Welcome from '#lib/components/Welcome.svelte';
 import { createCardViewModel, type CardMediaStatus } from '#lib/cards/view-model.ts';
 import { draftRules } from '#lib/game/rules.ts';
 import { loadShowcase } from '#lib/game/data.ts';
 import type { ShowcaseCard } from '#lib/game/types.ts';
 import { loadMedia } from '#lib/media/client.ts';
 import type { MediaManifest } from '#lib/media/types.ts';
 import { loadRankings } from '#lib/rankings/client.ts';
 import type { WarRankings } from '#lib/rankings/types.ts';

 type GameSession = import('#lib/game/session.svelte.ts').Session;

 let session = $state.raw<GameSession | null>(null);
 let DraftBoard = $state<typeof import('#lib/components/DraftBoard.svelte').default | null>(null);
 let Lineup = $state<typeof import('#lib/components/Lineup.svelte').default | null>(null);
 let Progress = $state<typeof import('#lib/components/Progress.svelte').default | null>(null);
 let Results = $state<typeof import('#lib/components/Results.svelte').default | null>(null);
 let gameLoadError = $state('');
 let phaseLoadError = $state('');
 let rankings = $state.raw<WarRankings | null>(null);
 let rankingLoading = $state(false);
 let rankingError = $state(false);
 let rankingAttempt = $state(0);
 let showcase = $state.raw<ShowcaseCard[]>([]);
 let showcaseLoading = $state(false);
 let showcaseError = $state(false);
 let media = $state.raw<MediaManifest | null>(null);
 let mediaStatus = $state<CardMediaStatus>('loading');
 const rankingVersion = $derived(session?.draft?.dataVersion ?? session?.manifest?.dataVersion ?? null);
 const showcaseCards = $derived(showcase.map(({ profile, slot }) => ({
  seasonId: profile.seasonId,
  playerId: profile.playerId,
  model: createCardViewModel({ profile, slot, manifest: session?.manifest ?? null, media, mediaStatus, rankings })
 })));

 function retryRankings() {
  rankingAttempt++;
 }
 onMount(() => {
  let disposed = false;
  let currentSession: GameSession | null = null;
  void import('#lib/game/session.svelte.ts')
   .then(({ Session }) => {
    if (disposed) return;
    currentSession = new Session();
    session = currentSession;
    void currentSession.initialize();
   })
   .catch(() => {
    if (!disposed) gameLoadError = 'The game could not load. Reload the page to try again.';
   });
  void loadMedia()
   .then(value => { if (!disposed) { media = value; mediaStatus = 'ready'; } })
   .catch(() => { if (!disposed) mediaStatus = 'unavailable'; });
  return () => {
   disposed = true;
   currentSession?.dispose();
  };
 });
 $effect(() => {
  const phase = session?.phase;
  const failed = () => { phaseLoadError = 'This stage could not load. Reload the page to try again.'; };
  if ((phase === 'ready' || phase === 'revealing' || phase === 'choosing') && !DraftBoard) {
   void import('#lib/components/DraftBoard.svelte').then(({ default: component }) => { DraftBoard = component; }).catch(failed);
  } else if (phase === 'lineup' && !Lineup) {
   void import('#lib/components/Lineup.svelte').then(({ default: component }) => { Lineup = component; }).catch(failed);
  } else if (phase === 'simulating' && !Progress) {
   void import('#lib/components/Progress.svelte').then(({ default: component }) => { Progress = component; }).catch(failed);
  } else if (phase === 'results' && !Results) {
   void import('#lib/components/Results.svelte').then(({ default: component }) => { Results = component; }).catch(failed);
  }
 });
 $effect(() => {
  const manifest = session?.manifest ?? null;
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
  const currentSession = session;
  const phase = currentSession?.phase;
  if (!currentSession || !phase) return;
  const componentReady =
   phase === 'ready' || phase === 'revealing' || phase === 'choosing' ? DraftBoard :
   phase === 'lineup' ? Lineup :
   phase === 'simulating' ? Progress :
   phase === 'results' ? Results :
   true;
  if (!componentReady) return;
  const choosing = phase === 'choosing' && !currentSession.loading;
  const target = phase === 'ready' ? '#roll-next' : choosing ? '.candidates input[type="search"]' : phase === 'lineup' ? '#lineup-heading' : phase === 'simulating' ? '#simulation-heading' : phase === 'results' ? '#results-heading' : null;
  if (target) void tick().then(() => {
   if (session !== currentSession || currentSession.phase !== phase || (phase === 'choosing' && currentSession.loading)) return;
   document.querySelector<HTMLElement>(target)?.focus({ preventScroll: phase === 'results' });
   if (phase === 'results') window.scrollTo(0, 0);
  });
 });
</script>


<main class:home-start={!session || session.phase === 'start'}>
 {#if gameLoadError || phaseLoadError}
  <div class="error" role="alert"><p>{gameLoadError || phaseLoadError}</p></div>
 {/if}
 {#if session}
  {@const currentSession = session}
  <div class="sr-only" aria-live="polite" aria-atomic="true">{currentSession.announce}</div>
  <div class="session-feedback">
   {#if currentSession.storageNotice}<p class="notice">{currentSession.storageNotice}</p>{/if}
   {#if currentSession.error}
    <div class="error" role="alert">
     <p>{currentSession.error}</p>
     {#if currentSession.canRetry}<button class="secondary" disabled={currentSession.loading} onclick={() => void currentSession.retry()}>Retry</button>{/if}
     {#if currentSession.incompatible}<button class="secondary" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>Start new draft</button>{/if}
    </div>
   {/if}
   {#if currentSession.confirmNew}
    <section class="confirmation" aria-label="Confirm new draft">
     <h2>Leave this roster behind?</h2>
     <p>Your picks are permanent. Starting a new draft replaces this saved run with a new seed.</p>
     <div class="actions"><button class="secondary" onclick={() => currentSession.confirmNew = false}>Keep draft</button><button class="primary" onclick={() => void currentSession.startNew()}>Discard and start new</button></div>
    </section>
   {/if}
  </div>

  {#if currentSession.phase === 'start'}
   <Welcome manifest={currentSession.manifest} loading={currentSession.loading} hasSavedDraft={!!currentSession.savedDraft} onStart={() => currentSession.requestNew()} onResume={() => void currentSession.resume()} cards={showcaseCards} showcaseStatus={showcaseLoading ? 'loading' : showcaseError ? 'unavailable' : 'ready'} {mediaStatus} />
  {:else if currentSession.draft && currentSession.manifest}
   {#if currentSession.phase === 'ready' || currentSession.phase === 'revealing' || currentSession.phase === 'choosing'}
    <div class="draft-top narrow-draft-top"><p class="eyebrow">Historical draft <span class="stage-divider">/</span> {currentSession.draft.picks.length} of {draftRules(currentSession.draft.schemaVersion).slots.length} picked</p><button class="quiet" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>New draft</button></div>
    {#if DraftBoard}
     <DraftBoard draft={currentSession.draft} manifest={currentSession.manifest} pool={currentSession.pool} profiles={currentSession.profiles} phase={currentSession.phase} loading={currentSession.loading} busy={currentSession.busy} error={currentSession.error} {rankings} {rankingLoading} {rankingError} onRetryRankings={retryRankings} onRoll={() => void currentSession.roll()} onDraft={(id, slot) => currentSession.commit(id, slot)} onReassign={(id, slot) => currentSession.reassign(id, slot)} onNew={() => currentSession.requestNew()} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the draft…</span></div>{/if}
   {:else if currentSession.phase === 'lineup'}
    <div class="draft-top"><p class="eyebrow">Roster complete</p><button class="quiet" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>New draft</button></div>
    {#if Lineup}
     <Lineup draft={currentSession.draft} profiles={currentSession.profiles} manifest={currentSession.manifest} {rankings} {rankingLoading} {rankingError} busy={currentSession.busy} onReassign={(id, slot) => currentSession.reassign(id, slot)} onOrder={(kind, order) => currentSession.order(kind, order)} onsimulate={() => void currentSession.simulate()} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the lineup…</span></div>{/if}
   {:else if currentSession.phase === 'simulating'}
    <div class="draft-top"><p class="eyebrow">Season in play</p><button class="quiet" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>New draft</button></div>
    {#if Progress}
     <Progress completed={currentSession.completed} revealed={currentSession.revealed} result={currentSession.result} onskip={() => currentSession.skip()} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the season…</span></div>{/if}
   {:else if currentSession.phase === 'results' && currentSession.result}
    {#if Results}
     <Results result={currentSession.result} draft={currentSession.draft} profiles={currentSession.profiles} manifest={currentSession.manifest} {rankings} {rankingLoading} {rankingError} onNew={() => currentSession.requestNew()} onShare={(action, format) => void currentSession.share(action, format)} publication={currentSession.publication} sharing={currentSession.sharing} shareStatus={currentSession.shareStatus} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the results…</span></div>{/if}
   {/if}
  {/if}
 {:else if !gameLoadError}
  <Welcome manifest={null} loading hasSavedDraft={false} onStart={() => {}} onResume={() => {}} cards={[]} showcaseStatus="loading" {mediaStatus} />
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
