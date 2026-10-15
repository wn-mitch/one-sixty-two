<script lang="ts">
 import type { Manifest } from '#lib/game/types.ts';
 import type { CardMediaStatus, CardViewModel } from '#lib/cards/view-model.ts';
 import Card from '#lib/cards/Card.svelte';
 import CardReview from '#lib/cards/CardReview.svelte';
 import { tick } from 'svelte';
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

 let raisedDecade = $state<number | null>(null);
 let raisedOpened = $state(false);
 let raisedTurned = $state(false);
 let raisedSource = $state<HTMLElement | null>(null);
 let raisedTrigger: HTMLButtonElement | null = null;
 const raisedCard = $derived(eraCards.find(era => era.decade === raisedDecade)?.card.model);

 /** Raises an era card from the strip into the same reader the draft and lineup use. */
 async function raise(decade: number, trigger: HTMLButtonElement): Promise<void> {
  raisedOpened = false;
  raisedTurned = false;
  raisedTrigger = trigger;
  raisedSource = trigger.querySelector<HTMLElement>('.card');
  raisedDecade = decade;
  await tick();
  if (raisedDecade === decade) raisedOpened = true;
 }

 function lower(): void {
  const trigger = raisedTrigger;
  raisedDecade = null;
  raisedTrigger = null;
  raisedSource = null;
  raisedOpened = false;
  raisedTurned = false;
  void tick().then(() => trigger?.focus({ preventScroll: true }));
 }
</script>

<section class="welcome" aria-labelledby="home-heading">
 <div class="welcome-copy">
  <h1 id="home-heading">Can you go <strong>162-0?</strong></h1>
  <ol class="intro">
   <li>Pick where you’ll play.</li>
   <li>Every pack is one franchise from one decade. Take one player, then open the next.</li>
   <li>Play 162 games. Even the best roster struggles to hit&nbsp;162–0.</li>
  </ol>
  <div class="actions">
   <button class="primary start" disabled={loading || !manifest} onclick={onStart}>Start draft <span aria-hidden="true">↗</span></button>
   {#if hasSavedDraft}<button class="secondary resume" disabled={loading} onclick={onResume}>Resume draft</button>{/if}
   <a class="button draft-mode" href="/draft">Draft Mode <span class="beta">Beta</span></a>
  </div>
  <p class="library-link"><a href="/seasons">Team gallery</a> · <a href="/collection">Collection</a></p>
  {#if loading}
   <p class="start-status muted" role="status">Loading the historical player pool…</p>
  {:else if showcaseStatus === 'loading'}
   <p class="start-status muted" role="status">Loading the historical card showcase…</p>
  {:else if showcaseStatus === 'unavailable'}
   <p class="start-status muted" role="status">The card showcase is unavailable. The draft is still ready.</p>
  {:else if mediaStatus === 'unavailable'}
   <p class="start-status muted" role="status">Verified photos are unavailable. Cards use their canonical missing-image treatment.</p>
  {/if}
 </div>
 {#if eraCards.length}
  <div class="era-strip" role="region" aria-label="Card designs from eight eras">
   {#each eraCards as era (era.decade)}
    <figure>
     <button type="button" class="era-card" aria-label="Look at the {era.decade}s card, {era.card.model.year} {era.card.model.full}" aria-expanded={raisedDecade === era.decade && raisedOpened} aria-controls="era-card-review" onclick={event => void raise(era.decade, event.currentTarget)}><Card s={era.card.model} onDetails={noDetails} /></button>
     <figcaption>{era.decade}s</figcaption>
    </figure>
   {/each}
  </div>
 {/if}
 {#if raisedCard}
  {#key raisedDecade}
   <CardReview id="era-card-review" s={raisedCard} bind:opened={raisedOpened} bind:turned={raisedTurned} showControl={false} sourceElement={raisedSource} raisedOnly onClose={lower} />
  {/key}
 {/if}
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
  display: grid;
  gap: var(--space-2);
  max-width: 44ch;
  margin: var(--space-6) 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
  color: var(--muted);
  font-size: var(--text-lg);
  text-wrap: pretty;
 }
 /* Each step leads with its number in the display face. */
 /* Each step number sits in a fixed tile flush with the heading's edge, centred on the step's first line. */
 .intro li { --line: 1.45em; display: grid; grid-template-columns: 1.6rem minmax(0, 1fr); column-gap: .75rem; align-items: start; line-height: var(--line); counter-increment: step; }
 .intro li::before {
  content: counter(step); display: grid; place-items: center; width: 1.6rem; height: 1.6rem; margin-top: calc((var(--line) - 1.6rem) / 2 + .12em); box-sizing: border-box;
  color: var(--text); border: 1px solid var(--border); border-radius: .3rem;
  font: 800 1rem/1 'Barlow Condensed', sans-serif; font-variant-numeric: tabular-nums;
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
 .draft-mode { min-height: 3.5rem; gap: var(--space-2); white-space: nowrap; }
 .beta { padding: .1rem .4rem; border: 1px solid currentColor; border-radius: 999px; color: var(--accent); font-size: var(--text-xs); letter-spacing: .06em; text-transform: uppercase; }
 .library-link { margin: var(--space-4) 0 0; font-size: var(--text-sm); }
 .library-link a { display: inline-flex; min-height: 2.75rem; align-items: center; color: var(--muted); font-weight: 650; }
 .start-status { margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--text-xs); }
 /* Always two even rows of four, oldest to newest. */
 .era-strip {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  max-width: min(100%, calc(4 * 80px + 3 * var(--space-3)));
  margin: 0 2rem 2rem;
 }
 .era-strip figure {
  display: grid;
  gap: 6px;
  justify-items: center;
  min-width: 0;
  margin: 0;
 }
 .era-card { display: block; width: 100%; min-width: 0; padding: 0; border: 0; border-radius: .3rem; background: none; color: inherit; cursor: zoom-in; }
 .era-card > :global(*) { pointer-events: none; }
 .era-card:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
 .era-strip figcaption {
  color: var(--muted);
  font-family: 'Barlow Condensed', sans-serif;
  font-size: var(--text-sm);
  font-style: italic;
  font-weight: 800;
  letter-spacing: .04em;
 }
 @media (min-width: 48rem) {
  .era-strip { max-width: min(100%, calc(4 * var(--home-era-card-width, 128px) + 3 * var(--space-3))); }
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
  .resume, .draft-mode { width: 100%; }
  .era-strip { margin: 0 max(var(--space-4), env(safe-area-inset-right)) var(--space-6) max(var(--space-4), env(safe-area-inset-left)); }
  .era-strip figure { gap: 4px; }
  .era-strip figcaption { font-size: var(--text-xs); letter-spacing: 0; }
 }
 /* Wide screens set the copy on the left and the era showcase in its own panel on the right. */
 @media (min-width: 68rem) {
  .welcome { display: grid; grid-template-columns: minmax(0, 41.5rem) minmax(0, 1fr); align-items: end; }
  .welcome > :global(.logo-strip) { grid-column: 1 / -1; }
  .welcome-copy { margin-left: max(0px, calc((100vw - 90rem) / 2 - 2rem)); }
  .era-strip {
   box-sizing: border-box;
   justify-self: end;
   width: 100%;
   max-width: calc(4 * var(--home-era-card-width, 128px) + 3 * var(--space-3) + 2 * var(--space-4));
   margin: 0 max(2rem, calc((100vw - 90rem) / 2)) 2rem 2rem;
   padding: var(--space-4);
   border: 1px solid var(--border);
   border-radius: var(--radius-lg);
   background: oklch(16% .009 255 / .82);
   backdrop-filter: blur(10px);
  }
 }
 @media (max-width: 24rem) {
  h1 strong { font-size: 4.5rem; }
  .era-strip figcaption { font-size: .6875rem; }
 }
</style>
