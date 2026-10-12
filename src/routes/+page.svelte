<script lang="ts">
 import { onMount, tick } from 'svelte';
 import Welcome from '#lib/components/Welcome.svelte';
 import ConfirmNewDraft from '#lib/components/ConfirmNewDraft.svelte';
 import ErrorDialog from '#lib/components/ErrorDialog.svelte';
 import { freeze, morphInto, riseIn, stash, take } from '#lib/components/phase-motion.ts';
 import { createCardViewModel, type CardMediaStatus } from '#lib/cards/view-model.ts';
 import { loadShowcase } from '#lib/game/data.ts';
 import type { ShowcaseCard } from '#lib/game/types.ts';
 import { loadMedia } from '#lib/media/client.ts';
 import type { MediaManifest } from '#lib/media/types.ts';
 import { loadRankings } from '#lib/rankings/client.ts';
 import { toasts } from '#lib/toast.svelte.ts';
 import type { WarRankings } from '#lib/rankings/types.ts';

 type GameSession = import('#lib/game/session.svelte.ts').Session;

 let session = $state.raw<GameSession | null>(null);
 // Storage problems are toasts, not a paragraph that shifts the screen.
 $effect(() => { const notice = session?.storageNotice; if (notice) toasts.show(notice, { id: 'storage', tone: 'error' }); });
 let StadiumDeck = $state<typeof import('#lib/components/StadiumDeck.svelte').default | null>(null);
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
 const stages = {
  stadium: () => { if (!StadiumDeck) return import('#lib/components/StadiumDeck.svelte').then(({ default: component }) => { StadiumDeck = component; }); },
  draft: () => { if (!DraftBoard) return import('#lib/components/DraftBoard.svelte').then(({ default: component }) => { DraftBoard = component; }); },
  lineup: () => { if (!Lineup) return import('#lib/components/Lineup.svelte').then(({ default: component }) => { Lineup = component; }); },
  progress: () => { if (!Progress) return import('#lib/components/Progress.svelte').then(({ default: component }) => { Progress = component; }); },
  results: () => { if (!Results) return import('#lib/components/Results.svelte').then(({ default: component }) => { Results = component; }); }
 };
 $effect(() => {
  const phase = session?.phase;
  const failed = () => { phaseLoadError = 'This stage could not load. Reload the page to try again.'; };
  const current = phase === 'stadium' ? 'stadium' : phase === 'ready' || phase === 'revealing' || phase === 'choosing' ? 'draft' : phase === 'lineup' ? 'lineup' : phase === 'simulating' ? 'progress' : phase === 'results' ? 'results' : null;
  if (!current) return;
  void stages[current]()?.catch(failed);
  // The next stage loads ahead so its hand-off plays the moment the phase changes, with no loading frame between.
  const next = { stadium: 'draft', draft: 'lineup', lineup: 'progress', progress: 'results', results: null } as const;
  const upcoming = next[current];
  if (upcoming) void stages[upcoming]()?.catch(() => {});
 });
 // The season's running record is carried onto the results scoreboard instead of cutting away.
 let previousPhase: string | undefined;
 $effect.pre(() => {
  const phase = session?.phase;
  if (previousPhase === 'simulating' && phase === 'results') {
   const record = document.querySelector<HTMLElement>('.progress-shell .record:not(.muted)');
   const result = session?.result;
   if (record && result) {
    const clone = freeze(record);
    // A skipped reveal leaves a partial count on screen; the copy carries the final record so it lands on matching numbers.
    const [wins, losses] = clone.querySelectorAll<HTMLElement>('.win, .loss');
    if (wins && losses) { wins.textContent = `${result.wins} W`; losses.textContent = `${result.losses} L`; }
    stash('record', new Map([['record', record.getBoundingClientRect()]]), new Map([['record', clone]]));
   }
  }
  previousPhase = phase;
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
   phase === 'stadium' ? StadiumDeck :
   phase === 'ready' || phase === 'revealing' || phase === 'choosing' ? DraftBoard :
   phase === 'lineup' ? Lineup :
   phase === 'simulating' ? Progress :
   phase === 'results' ? Results :
   true;
  if (!componentReady) return;
  const choosing = phase === 'choosing' && !currentSession.loading;
  const target = phase === 'stadium' ? '#stadium-heading' : phase === 'ready' ? '#roll-next' : choosing ? '.candidates input[type="search"]' : phase === 'lineup' ? '#lineup-heading' : phase === 'simulating' ? '#simulation-heading' : phase === 'results' ? '#results-heading' : null;
  if (target) void tick().then(() => {
   if (session !== currentSession || currentSession.phase !== phase || (phase === 'choosing' && currentSession.loading)) return;
   document.querySelector<HTMLElement>(target)?.focus({ preventScroll: phase === 'results' });
   if (phase === 'results') window.scrollTo(0, 0);
  });
 });
 $effect(() => {
  if (session?.phase !== 'results' || !Results) return;
  const arrival = take('record');
  if (arrival) void tick().then(() => {
   const from = arrival.rects.get('record');
   const clone = arrival.clones.get('record');
   const heading = document.querySelector<HTMLElement>('#results-heading');
   if (from && clone && heading) morphInto(clone, from, heading);
   riseIn(document.querySelectorAll<HTMLElement>('.scoreboard > :not(.record-block), .results > :not(.scoreboard)'), 160);
  });
 });
</script>


<main class:home-start={!session || session.phase === 'start'}>
 <ErrorDialog message={gameLoadError || phaseLoadError} onDismiss={() => { gameLoadError = ''; phaseLoadError = ''; }}>
  {#snippet actions()}<button type="button" class="primary" onclick={() => location.reload()}>Reload</button>{/snippet}
 </ErrorDialog>
 {#if session}
  {@const currentSession = session}
  <div class="sr-only" aria-live="polite" aria-atomic="true">{currentSession.announce}</div>
  <div class="session-feedback">
   <ErrorDialog message={currentSession.error} onDismiss={() => currentSession.error = ''}>
    {#snippet actions()}
     {#if currentSession.canRetry}<button type="button" class="primary" disabled={currentSession.loading} onclick={() => void currentSession.retry()}>Retry</button>{/if}
     {#if currentSession.incompatible}<button type="button" class="primary" disabled={currentSession.loading} onclick={() => { currentSession.error = ''; currentSession.requestNew(); }}>Start new draft</button>{/if}
    {/snippet}
   </ErrorDialog>
   <ConfirmNewDraft open={currentSession.confirmNew} onKeep={() => currentSession.confirmNew = false} onDiscard={() => void currentSession.startNew()} />
  </div>

  {#if currentSession.phase === 'start'}
   <Welcome manifest={currentSession.manifest} loading={currentSession.loading} hasSavedDraft={!!currentSession.savedDraft} onStart={() => currentSession.requestNew()} onResume={() => void currentSession.resume()} cards={showcaseCards} showcaseStatus={showcaseLoading ? 'loading' : showcaseError ? 'unavailable' : 'ready'} {mediaStatus} />
  {:else if currentSession.draft && currentSession.manifest}
   {#if currentSession.phase === 'stadium'}
    <div class="draft-top"><p class="eyebrow">Home stadium</p><button class="quiet" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>New draft</button></div>
    {#if StadiumDeck}
     <StadiumDeck manifest={currentSession.manifest} busy={currentSession.busy} onSelect={id => void currentSession.selectStadium(id)} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the stadiums…</span></div>{/if}
   {:else if currentSession.phase === 'ready' || currentSession.phase === 'revealing' || currentSession.phase === 'choosing'}
    <div class="draft-top narrow-draft-top"><p class="eyebrow">Historical draft</p><button class="quiet" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>New draft</button></div>
    {#if DraftBoard}
     <DraftBoard draft={currentSession.draft} manifest={currentSession.manifest} pool={currentSession.pool} profiles={currentSession.profiles} phase={currentSession.phase} loading={currentSession.loading} busy={currentSession.busy} {rankings} {rankingLoading} {rankingError} onRetryRankings={retryRankings} onRoll={() => void currentSession.roll()} onReroll={() => void currentSession.reroll()} onDraft={(id, slot) => currentSession.commit(id, slot)} onReassign={(id, slot) => currentSession.reassign(id, slot)} onNew={() => currentSession.requestNew()} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the draft…</span></div>{/if}
   {:else if currentSession.phase === 'lineup'}
    <div class="draft-top"><p class="eyebrow">Roster complete</p><button class="quiet" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>New draft</button></div>
    {#if Lineup}
     <Lineup draft={currentSession.draft} profiles={currentSession.profiles} manifest={currentSession.manifest} {rankings} {rankingLoading} {rankingError} busy={currentSession.busy} onReassign={(id, slot) => currentSession.reassign(id, slot)} onOrder={(kind, order) => currentSession.order(kind, order)} onRoles={reliefRoles => currentSession.roles(reliefRoles)} onsimulate={() => void currentSession.simulate()} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the lineup…</span></div>{/if}
   {:else if currentSession.phase === 'simulating'}
    <div class="draft-top"><p class="eyebrow">Season in play</p><button class="quiet" disabled={currentSession.loading} onclick={() => currentSession.requestNew()}>New draft</button></div>
    {#if Progress}
     <Progress completed={currentSession.completed} revealed={currentSession.revealed} result={currentSession.result} onskip={() => currentSession.skip()} />
    {:else if !phaseLoadError}<div class="stack" role="status"><div class="skeleton"></div><span class="muted">Loading the season…</span></div>{/if}
   {:else if currentSession.phase === 'results' && currentSession.result}
    {#if Results}
     <Results result={currentSession.result} draft={currentSession.draft} profiles={currentSession.profiles} manifest={currentSession.manifest} {rankings} {rankingLoading} {rankingError} onNew={() => currentSession.requestNew()} onShare={(action, format, model) => void currentSession.share(action, format, model)} publication={currentSession.publication} sharing={currentSession.sharing} shareStatus={currentSession.shareStatus} challenge={currentSession.challenge} newStickers={currentSession.newStickers} />
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
 .draft-top { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
 .draft-top button { flex: none; white-space: nowrap; }
 .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 @media (max-width: 24rem) {
  .draft-top .eyebrow { max-width: 10rem; }
 }
</style>
