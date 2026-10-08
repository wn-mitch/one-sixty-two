<script lang="ts">
 import { onMount, tick } from 'svelte';
 import { Session } from '#lib/game/session.svelte.ts';
 import DraftBoard from '#lib/components/DraftBoard.svelte';
 import Lineup from '#lib/components/Lineup.svelte';
 import Progress from '#lib/components/Progress.svelte';
 import Results from '#lib/components/Results.svelte';
 import HomeWall from '#lib/components/HomeWall.svelte';
 import { tableScroll } from '#lib/components/table-scroll.ts';
 import Card from '#lib/cards/Card.svelte';
 import { createCardViewModel, type CardMediaStatus } from '#lib/cards/view-model.ts';
 import { draftRules } from '#lib/game/rules.ts';
 import { loadShowcase } from '#lib/game/data.ts';
 import type { ShowcaseCard } from '#lib/game/types.ts';
 import { loadMedia } from '#lib/media/client.ts';
 import type { MediaManifest } from '#lib/media/types.ts';
 import { loadRankings } from '#lib/rankings/client.ts';
 import type { WarRankings } from '#lib/rankings/types.ts';

 const ERAS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;
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
  model: createCardViewModel({ profile, slot, manifest: session.manifest, media, mediaStatus, rankings })
 })));
 const eraCards = $derived.by(() => ERAS.flatMap(decade => {
  const index = showcase.findIndex(card => Math.floor(card.profile.year / 10) * 10 === decade);
  return index < 0 ? [] : [{ decade, card: showcaseCards[index]! }];
 }));
 const noDetails = () => {};

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
  <section class="welcome" aria-labelledby="home-heading">
   <div class="welcome-copy">
    <p class="eyebrow">Baseball history. One undefeated season.</p>
    <h1 id="home-heading">Can you go <strong>162-0?</strong></h1>
    <p class="intro">Roll a franchise and decade. Draft nine hitters, three starters, a closer, and a team-season bullpen remainder. One pick per franchise; each athlete only once. Take your team through all 162 games.</p>
    <div class="actions">
     <button class="primary start" disabled={session.loading || !session.manifest} onclick={() => session.requestNew()}>Start draft <span aria-hidden="true">↗</span></button>
     {#if session.savedDraft}<button class="secondary resume" disabled={session.loading} onclick={() => void session.resume()}>Resume draft</button>{/if}
    </div>
    {#if session.loading}
     <p class="start-status muted" role="status">Loading the historical player pool…</p>
    {:else if showcaseLoading}
     <p class="start-status muted" role="status">Loading the historical card showcase…</p>
    {:else if showcaseError}
     <p class="start-status muted" role="status">The card showcase is unavailable. The draft is still ready.</p>
    {:else if mediaStatus === 'unavailable'}
     <p class="start-status muted" role="status">Verified photos are unavailable. Cards use their canonical missing-image treatment.</p>
    {/if}
    {#if eraCards.length}
     <div class="era-strip" role="region" aria-label="Card designs from eight eras" use:tableScroll>
      {#each eraCards as era (era.decade)}
       <figure>
        <div class="era-card" aria-hidden="true"><Card s={era.card.model} onDetails={noDetails} /></div>
        <figcaption>{era.decade}s</figcaption>
       </figure>
      {/each}
     </div>
    {/if}
    <p class="start-note">Great teams still lose. That's the challenge.</p>
   </div>
   <HomeWall cards={showcaseCards} franchises={session.manifest?.franchises ?? []} />
  </section>
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
 .welcome {
  position: relative;
  display: flex;
  min-height: max(43rem, calc(100svh - 4rem));
  flex-direction: column;
  isolation: isolate;
 }
 .welcome-copy {
  position: relative;
  z-index: 1;
  width: min(100%, 41.5rem);
  padding: clamp(4rem, 9vh, 7rem) 2rem 2rem;
 }
 .welcome .eyebrow { margin: 0 0 var(--space-4); }
 h1 { font-size: 3rem; }
 h1 strong {
  display: block;
  margin-top: var(--space-2);
  white-space: nowrap;
  font-size: 7rem;
  font-weight: 850;
  line-height: 1.05;
  letter-spacing: -.065em;
 }
 .intro {
  max-width: 44ch;
  margin: var(--space-6) 0;
  color: var(--muted);
  font-size: var(--text-lg);
  text-wrap: pretty;
 }
 .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
 .start {
  display: flex;
  width: 100%;
  max-width: 20rem;
  min-height: 3.5rem;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--space-5);
  font-size: var(--text-base);
 }
 .resume { min-height: 3.5rem; white-space: nowrap; }
 .start-status,
 .start-note { color: var(--muted); font-size: var(--text-xs); }
 .start-status { margin: var(--space-3) 0 0; }
 .start-note { margin: var(--space-4) 0 0; }
 .era-strip {
  display: flex;
  gap: 10px;
  margin-top: var(--space-10);
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
 }
 .era-strip figure {
  display: grid;
  flex: 0 0 46px;
  gap: 6px;
  justify-items: center;
  margin: 0;
 }
 .era-card { width: 46px; pointer-events: none; }
 .era-strip figcaption {
  color: var(--muted);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: var(--text-sm);
  font-style: italic;
  font-weight: 800;
  letter-spacing: .04em;
 }
 .draft-top { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
 .stage-divider { padding-inline: var(--space-2); color: var(--border); }
 .confirmation { border: 1px solid var(--accent); background: var(--surface); padding: var(--space-5); border-radius: var(--radius); margin-bottom: var(--space-6); }
 .confirmation h2 { font-size: var(--text-xl); }
 .error p { margin: 0 0 var(--space-3); }
 .error button + button { margin-left: var(--space-2); }
 .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 @media (max-width: 47.999rem) {
  .welcome {
   min-height: 0;
   padding-top: 272px;
  }
  .welcome-copy {
   width: 100%;
   padding: 0 max(var(--space-4), env(safe-area-inset-left)) var(--space-6) max(var(--space-4), env(safe-area-inset-right));
  }
  .welcome .eyebrow { margin-bottom: var(--space-3); }
  h1 { font-size: var(--text-2xl); }
  h1 strong { margin-top: 6px; font-size: 5rem; }
  .intro { margin: var(--space-4) 0 var(--space-5); font-size: var(--text-base); }
  .actions { align-items: stretch; }
  .start { max-width: none; }
  .resume { width: 100%; }
  .era-strip { margin-top: var(--space-6); }
  .era-strip figure { gap: 4px; }
  .era-strip figcaption { font-size: var(--text-xs); letter-spacing: 0; }
  .start-note { display: none; }
 }
 @media (min-width: 68rem) {
  .welcome-copy { margin-left: max(0px, calc((100vw - 90rem) / 2 - 2rem)); }
 }
 @media (max-width: 24rem) {
  h1 strong { font-size: 4.5rem; }
  .era-strip figcaption { font-size: .6875rem; }
  .draft-top .eyebrow { max-width: 10rem; }
 }
</style>
