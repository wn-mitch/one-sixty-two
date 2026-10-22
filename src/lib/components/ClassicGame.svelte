<script lang="ts">
 import { SITE_PREVIEW } from '#lib/share/site-preview.ts';
 import { getContext, onMount, tick, untrack } from 'svelte';
 import { goto } from '$app/navigation';
 import { page } from '$app/state';
 import Welcome from '#lib/components/Welcome.svelte';
 import ConfirmNewDraft from '#lib/components/ConfirmNewDraft.svelte';
 import ErrorDialog from '#lib/components/ErrorDialog.svelte';
 import DraftSkeleton from '#lib/components/skeletons/DraftSkeleton.svelte';
 import LineupSkeleton from '#lib/components/skeletons/LineupSkeleton.svelte';
 import ProgressSkeleton from '#lib/components/skeletons/ProgressSkeleton.svelte';
 import ResultsSkeleton from '#lib/components/skeletons/ResultsSkeleton.svelte';
 import StadiumSkeleton from '#lib/components/skeletons/StadiumSkeleton.svelte';
 import { skeletonSettled } from '#lib/components/skeletons/hold.ts';
 import { freeze, morphInto, riseIn, stash, take } from '#lib/components/phase-motion.ts';
 import { createCardViewModel, type CardMediaStatus } from '#lib/cards/view-model.ts';
 import { loadShowcase } from '#lib/game/data.ts';
 import type { HitterSlot, ReliefAssignment, ShowcaseCard, Slot } from '#lib/game/types.ts';
 import { classicLineupView } from '#lib/game/lineup-view.ts';
 import { classicBoardSource } from '#lib/game/board-source.ts';
 import { loadMedia } from '#lib/media/client.ts';
 import type { MediaManifest } from '#lib/media/types.ts';
 import { loadRankings } from '#lib/rankings/client.ts';
 import { toasts } from '#lib/toast.svelte.ts';
 import { shopState } from '#lib/cosmetics/store.svelte.ts';
 import GuideTip from '#lib/components/GuideTip.svelte';
 import type { WarRankings } from '#lib/rankings/types.ts';
 import ScreenLoading from '#lib/components/ScreenLoading.svelte';

 type GameSession = import('#lib/game/session.svelte.ts').Session;
 type DraftSession = import('#lib/draft/session.svelte.ts').DraftModeSession;

 /** Classic and the daily share `classic`; `draft` hosts Draft Mode's league run in the same shell. */
 let { mode = 'classic' }: { mode?: 'classic' | 'draft' } = $props();
 let session = $state.raw<GameSession | null>(null);
 let draftSession = $state.raw<DraftSession | null>(null);
 let DraftModeStages = $state<typeof import('#lib/components/draft-mode/DraftModeStages.svelte').default | null>(null);
 const siteActions = getContext<{ newDraft?: () => void } | undefined>('classic-actions');
 $effect(() => {
  const current = session;
  const draftRun = draftSession;
  const requestNew = current && ['stadium', 'lineup', 'simulating'].includes(current.phase) ? () => current.requestNew()
   : draftRun?.run ? () => draftRun.requestNew() : null;
  if (!siteActions || !requestNew) return;
  siteActions.newDraft = requestNew;
  return () => { if (siteActions.newDraft === requestNew) siteActions.newDraft = undefined; };
 });
 // Storage problems are toasts, not a paragraph that shifts the screen.
 $effect(() => { const notice = session?.storageNotice ?? draftSession?.storageNotice; if (notice) toasts.show(notice, { id: 'storage', tone: 'error' }); });
 $effect(() => { const notice = session?.resumeNotice; if (notice) toasts.show(notice, { id: 'resume' }); });
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
 const rankingVersion = $derived(session?.draft?.dataVersion ?? session?.manifest?.dataVersion ?? draftSession?.manifest?.dataVersion ?? null);
 const showcaseCards = $derived(showcase.map(({ profile, slot }) => ({
  seasonId: profile.seasonId,
  playerId: profile.playerId,
  model: createCardViewModel({ profile, slot, manifest: session?.manifest ?? null, media, mediaStatus, rankings })
 })));

 function retryRankings() {
  rankingAttempt++;
 }

 // The welcome screen is `/` and the game is `/classic` (or `/daily` for the daily run), one page between them, so the
 // browser's back button returns home with the draft kept for Resume and forward (or a reload) returns to the game.
 $effect(() => {
  const current = session;
  const phase = current?.phase;
  if (!current || !phase || phase === 'start' || current.shared) return;
  untrack(() => {
   if (page.url.pathname !== '/') return;
   // A `?new=1` or `?resume=1` hand-off is replaced; Start and Resume add a history entry to go back to.
   const handOff = page.url.searchParams.has('new') || page.url.searchParams.has('resume') || page.url.searchParams.has('build');
   void goto(current.draft?.daily !== undefined ? '/daily' : '/classic', { replace: handOff, reset: false });
  });
 });
 $effect(() => {
  const path = page.url.pathname;
  untrack(() => {
   const current = session;
   if (path === '/' && current && current.phase !== 'start') current.leave();
  });
 });
 $effect(() => {
  // Ordinary returns resume unfinished play only; completed seasons belong in My teams.
  const current = session;
  const path = page.url.pathname;
  if ((path !== '/classic' && path !== '/daily') || !current || current.phase !== 'start') return;
  if (!current.manifest || current.loading || current.error || current.incompatible || current.confirmNew) return;
  untrack(() => {
   if (path === '/daily' ? current.daily?.run.kind === 'active' : current.canAutoResume) void (path === '/daily' ? current.playDaily() : current.resume());
   else void goto('/', { replace: true, reset: false });
  });
 });
 onMount(() => {
  let disposed = false;
  let currentSession: GameSession | DraftSession | null = null;
  const loaded = mode === 'draft'
   ? Promise.all([import('#lib/draft/session.svelte.ts'), import('#lib/components/draft-mode/DraftModeStages.svelte')]).then(([{ DraftModeSession }, stages]) => {
    if (disposed) return;
    const created = new DraftModeSession();
    currentSession = created;
    DraftModeStages = stages.default;
    draftSession = created;
    void created.initialize();
   })
   : import('#lib/game/session.svelte.ts').then(({ Session }) => {
    if (disposed) return;
    const created = new Session();
    currentSession = created;
    session = created;
    void created.initialize();
   });
  loaded.catch(() => {
   if (!disposed) gameLoadError = 'The game could not load. Reload the page to try again.';
  });
  void loadMedia()
   .then(value => { if (!disposed) { media = value; mediaStatus = 'ready'; } })
   .catch(() => { if (!disposed) mediaStatus = 'unavailable'; });
  // Asks the Worker to make today's stamped link preview early in the day, before anyone shares a link.
  if (mode === 'classic') void fetch(SITE_PREVIEW.path, { method: 'HEAD' }).catch(() => undefined);
  return () => {
   disposed = true;
   currentSession?.dispose();
  };
 });
 /** Runs `run` once the browser is idle, or shortly after where it has no idle callback; returns a cancel. */
 function whenIdle(run: () => void): () => void {
  if ('requestIdleCallback' in window) {
   const id = requestIdleCallback(run, { timeout: 2000 });
   return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 300);
  return () => clearTimeout(id);
 }
 /** Resolves a stage's component once any skeleton standing in for it has shown long enough not to flash. */
 const settled = <T>(module: Promise<{ default: T }>) => module.then(async ({ default: component }) => { await skeletonSettled(); return component; });
 const stages = {
  stadium: () => { if (!StadiumDeck) return settled(import('#lib/components/StadiumDeck.svelte')).then(component => { StadiumDeck = component; }); },
  draft: () => { if (!DraftBoard) return settled(import('#lib/components/DraftBoard.svelte')).then(component => { DraftBoard = component; }); },
  lineup: () => { if (!Lineup) return settled(import('#lib/components/Lineup.svelte')).then(component => { Lineup = component; }); },
  progress: () => { if (!Progress) return settled(import('#lib/components/Progress.svelte')).then(component => { Progress = component; }); },
  results: () => { if (!Results) return settled(import('#lib/components/Results.svelte')).then(component => { Results = component; }); }
 };
 $effect(() => {
  const phase = session?.phase;
  const failed = () => { phaseLoadError = 'This stage could not load. Reload the page to try again.'; };
  const current = phase === 'stadium' ? 'stadium' : phase === 'ready' || phase === 'revealing' || phase === 'choosing' ? 'draft' : phase === 'lineup' ? 'lineup' : phase === 'simulating' ? 'progress' : phase === 'results' ? 'results' : null;
  if (!current) {
   // The welcome screen loads the first stages while idle, so Start draft and Resume usually open with no skeleton.
   if (phase !== 'start') return;
   const resumesPastDraft = !!session?.savedDraft?.homeStadium;
   return whenIdle(() => {
    for (const stage of resumesPastDraft ? ['stadium', 'draft', 'lineup'] as const : ['stadium', 'draft'] as const) void stages[stage]()?.catch(() => {});
   });
  }
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
  const target = phase === 'stadium' ? '#stadium-heading' : phase === 'ready' ? '#roll-next' : choosing ? '.candidates .content' : phase === 'lineup' ? '#lineup-heading' : phase === 'simulating' ? '#simulation-heading' : phase === 'results' ? '#results-heading' : null;
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
   // The share bar is fixed to a phone's bottom edge, so its container never takes a transform: that would pin the bar inside it.
   riseIn(document.querySelectorAll<HTMLElement>('.scoreboard > :not(.record-block, .score-actions), .score-actions > *, .results > :not(.scoreboard)'), 160);
  });
 });
 const waitingForStage = $derived(
  session?.phase === 'stadium' ? !StadiumDeck :
  ['ready', 'revealing', 'choosing'].includes(session?.phase ?? '') ? !DraftBoard :
  session?.phase === 'lineup' ? !Lineup :
  session?.phase === 'simulating' ? !Progress :
  session?.phase === 'results' ? !Results : false
 );
</script>

{#if mode === 'draft'}
 <ScreenLoading active={!gameLoadError && !draftSession?.error && (!draftSession || !DraftModeStages || draftSession.screen === 'loading')} label="Loading the draft…" />
{:else}
 <ScreenLoading
  active={!gameLoadError && !phaseLoadError && !session?.error && (waitingForStage || (page.url.pathname !== '/' && (!session || (session.loading && session.phase === 'start'))))}
  label="Loading your team…"
 />
{/if}

<main class:home-start={mode === 'classic' && (!session || session.phase === 'start')}>
 <ErrorDialog message={gameLoadError || phaseLoadError} onDismiss={() => { gameLoadError = ''; phaseLoadError = ''; }}>
  {#snippet actions()}<button type="button" class="primary" onclick={() => location.reload()}>Reload</button>{/snippet}
 </ErrorDialog>
 {#if mode === 'draft'}
  {#if draftSession}
   {@const currentDraft = draftSession}
   <div class="session-feedback">
    <ErrorDialog message={currentDraft.error} onDismiss={() => currentDraft.error = ''}>
     {#snippet actions()}
      {#if currentDraft.canRetry}<button type="button" class="primary" disabled={currentDraft.playing} onclick={() => void currentDraft.retry()}>Retry chapter</button>
      {:else}<button type="button" class="primary" onclick={() => location.reload()}>Reload</button>{/if}
     {/snippet}
    </ErrorDialog>
    <ConfirmNewDraft open={currentDraft.confirmNew} message="This run moves to My teams and won’t resume. A new draft starts with a fresh franchise and seed." onKeep={() => currentDraft.confirmNew = false} onDiscard={() => void currentDraft.startNew()} />
   </div>
   {#if DraftModeStages && currentDraft.screen !== 'loading'}<DraftModeStages session={currentDraft} {media} {mediaStatus} {rankings} />{/if}
  {/if}
 {:else if session}
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
   <Welcome manifest={currentSession.manifest} loading={currentSession.loading} hasSavedDraft={!!currentSession.savedDraft} firstSeasonBonus={shopState.snapshot?.firstSeasonBonus ?? false} daily={currentSession.daily} dailyStandings={currentSession.dailyStandings} onDaily={() => void currentSession.playDaily()} onDailyRollover={() => void currentSession.refreshDaily()} onStart={() => currentSession.requestNew()} onResume={() => void currentSession.resume()} cards={showcaseCards} showcaseStatus={showcaseLoading ? 'loading' : showcaseError ? 'unavailable' : 'ready'} {mediaStatus} />
  {:else if currentSession.draft && currentSession.manifest}
   {#if currentSession.phase === 'stadium'}
    {#if StadiumDeck}
     <StadiumDeck manifest={currentSession.manifest} busy={currentSession.busy} onSelect={id => void currentSession.selectStadium(id)} />
    {:else if !phaseLoadError}<StadiumSkeleton />{/if}
   {:else if currentSession.phase === 'ready' || currentSession.phase === 'revealing' || currentSession.phase === 'choosing'}
    {#if DraftBoard}
     {@const classicDraft = currentSession.draft}
     <DraftBoard
      source={classicBoardSource(classicDraft, currentSession.manifest, currentSession.pool)}
      classic={{ draft: classicDraft, onRoll: () => void currentSession.roll(), onAddPack: () => currentSession.addPack(), onChoosePack: pack => void currentSession.choosePack(pack) }}
      manifest={currentSession.manifest} profiles={currentSession.profiles} homeStadiumId={classicDraft.homeStadium?.id ?? null}
      phase={currentSession.phase} loading={currentSession.loading} busy={currentSession.busy} {rankings} {rankingLoading} {rankingError} onRetryRankings={retryRankings}
      onDraft={(id, slot) => { if (slot) currentSession.commit(id, slot as Slot); }}
      onMove={(id, slot) => { if (slot) currentSession.reassign(id, slot as HitterSlot); }}
      onNew={() => currentSession.requestNew()} />
    {:else if !phaseLoadError}<DraftSkeleton pool={currentSession.phase === 'choosing' && currentSession.draft.packs.length <= 1} />{/if}
   {:else if currentSession.phase === 'lineup'}
    <GuideTip step="roster" text="Your team is complete. Adjust the batting order and bullpen roles if you like, then play all 162 games." />
    {#if Lineup}
     <Lineup lineup={classicLineupView(currentSession.draft, currentSession.manifest, currentSession.profiles)} profiles={currentSession.profiles} manifest={currentSession.manifest} {rankings} {rankingLoading} {rankingError} busy={currentSession.busy} onMove={(id, slot) => currentSession.reassign(id, slot as HitterSlot)} onOrder={(kind, order) => currentSession.order(kind, order)} onRoles={reliefRoles => currentSession.roles(reliefRoles as ReliefAssignment[])} onsimulate={() => void currentSession.simulate()} />
    {:else if !phaseLoadError}<LineupSkeleton />{/if}
   {:else if currentSession.phase === 'simulating'}
    {#if Progress}
     <Progress completed={currentSession.completed} revealed={currentSession.revealed} result={currentSession.result} onskip={() => currentSession.skip()} />
    {:else if !phaseLoadError}<ProgressSkeleton />{/if}
   {:else if currentSession.phase === 'results' && currentSession.result}
    {#if Results}
     <Results result={currentSession.result} draft={currentSession.draft} profiles={currentSession.profiles} manifest={currentSession.manifest} {rankings} {rankingLoading} {rankingError} onNew={() => currentSession.requestNew()} onShare={(action, format, model) => void currentSession.share(action, format, model)} publication={currentSession.publication} sharing={currentSession.sharing} shareStatus={currentSession.shareStatus} challenge={currentSession.challenge} newStickers={currentSession.newStickers} newCards={currentSession.newCards} reward={currentSession.reward} ownSeason={!currentSession.shared} dailyStandings={currentSession.dailyStandings} onDailyName={(name) => currentSession.nameDaily(currentSession.draft!.daily!, name)} />
    {:else if !phaseLoadError}<ResultsSkeleton />{/if}
   {/if}
  {/if}
 {:else if !gameLoadError}
  <Welcome manifest={null} loading hasSavedDraft={false} onStart={() => {}} onResume={() => {}} cards={[]} showcaseStatus="loading" {mediaStatus} />
 {/if}
</main>

<style>
 main { min-height: 65vh; padding-block: var(--space-6); }
 main:has(:global(:is(.draft-board, .draft-skeleton).wide)) { padding-top: 0; }
 .home-start { position: relative; padding-block: 0; }
 .session-feedback:empty { display: none; }
 .home-start .session-feedback {
  position: relative;
  z-index: 3;
  width: min(80rem, 100%);
  margin-inline: auto;
  padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
 }
 .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
