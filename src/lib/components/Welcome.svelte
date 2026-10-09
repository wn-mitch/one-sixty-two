<script lang="ts">
 import type { Manifest } from '#lib/game/types.ts';
 import type { CardMediaStatus, CardViewModel } from '#lib/cards/view-model.ts';
 import Card from '#lib/cards/Card.svelte';
 import HomeWall from './HomeWall.svelte';

 interface ShowcaseCardView {
  seasonId: string;
  playerId: string;
  model: CardViewModel;
 }
 let { manifest, loading, hasSavedDraft, onStart, onResume, cards = [], showcaseStatus = 'ready', mediaStatus = 'ready' }: {
  manifest: Manifest | null;
  loading: boolean;
  hasSavedDraft: boolean;
  onStart: () => void;
  onResume: () => void;
  cards?: readonly ShowcaseCardView[];
  showcaseStatus?: 'ready' | 'loading' | 'unavailable';
  mediaStatus?: CardMediaStatus;
 } = $props();
 const ERAS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;
 const eraCards = $derived.by(() => ERAS.flatMap(decade => {
  const card = cards.find(entry => Math.floor(Number(entry.model.year) / 10) * 10 === decade);
  return card ? [{ decade, card }] : [];
 }));
 const noDetails = () => {};
</script>

<section class="welcome" aria-labelledby="home-heading">
 <div class="welcome-copy">
  <h1 id="home-heading">Can you go <strong>162-0?</strong></h1>
  <p class="intro">Roll a franchise and decade. Draft nine hitters, three starters, a closer, and a team-season bullpen remainder. One pick per franchise; each athlete only once. Take your team through all 162 games.</p>
  <div class="actions">
   <button class="primary start" disabled={loading || !manifest} onclick={onStart}>Start draft <span aria-hidden="true">↗</span></button>
   {#if hasSavedDraft}<button class="secondary resume" disabled={loading} onclick={onResume}>Resume draft</button>{/if}
  </div>
  {#if loading}
   <p class="start-status muted" role="status">Loading the historical player pool…</p>
  {:else if showcaseStatus === 'loading'}
   <p class="start-status muted" role="status">Loading the historical card showcase…</p>
  {:else if showcaseStatus === 'unavailable'}
   <p class="start-status muted" role="status">The card showcase is unavailable. The draft is still ready.</p>
  {:else if mediaStatus === 'unavailable'}
   <p class="start-status muted" role="status">Verified photos are unavailable. Cards use their canonical missing-image treatment.</p>
  {/if}
  {#if eraCards.length}
   <div class="era-strip" role="region" aria-label="Card designs from eight eras">
    {#each eraCards as era (era.decade)}
     <figure>
      <div class="era-card" aria-hidden="true"><Card s={era.card.model} onDetails={noDetails} /></div>
      <figcaption>{era.decade}s</figcaption>
     </figure>
    {/each}
   </div>
  {/if}
 </div>
 <HomeWall {cards} franchises={manifest?.franchises ?? []} />
</section>

<style>
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
 .start-status { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--text-xs); }
 .era-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: var(--space-10);
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
 @media (min-width: 48rem) {
  .era-strip {
   display: grid;
   grid-template-columns: repeat(4, minmax(0, 1fr));
   gap: var(--space-3);
   max-width: min(100%, calc(4 * var(--home-era-card-width, 128px) + 3 * var(--space-3)));
  }
  .era-strip figure, .era-card { width: 100%; min-width: 0; }
 }
 @media (max-width: 47.999rem) {
  .welcome {
   min-height: 0;
   padding-top: 272px;
  }
  .welcome-copy {
   width: 100%;
   padding: 0 max(var(--space-4), env(safe-area-inset-left)) var(--space-6) max(var(--space-4), env(safe-area-inset-right));
  }
  h1 { font-size: var(--text-2xl); }
  h1 strong { margin-top: 6px; font-size: 5rem; }
  .intro { margin: var(--space-4) 0 var(--space-5); font-size: var(--text-base); }
  .actions { align-items: stretch; }
  .start { max-width: none; }
  .resume { width: 100%; }
  .era-strip { margin-top: var(--space-6); }
  .era-strip figure { gap: 4px; }
  .era-strip figcaption { font-size: var(--text-xs); letter-spacing: 0; }
 }
 @media (min-width: 68rem) {
  .welcome-copy { margin-left: max(0px, calc((100vw - 90rem) / 2 - 2rem)); }
 }
 @media (max-width: 24rem) {
  h1 strong { font-size: 4.5rem; }
  .era-strip figcaption { font-size: .6875rem; }
 }
</style>
