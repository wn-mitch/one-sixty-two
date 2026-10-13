<script lang="ts">
 import { tick, untrack, type Snippet } from 'svelte';
 import type { ResultsInspection } from '../game/results-types.ts';
 import type { CardViewModel } from './view-model.ts';
 import CardFlip from './CardFlip.svelte';

 let { id, s, inspection, turned = $bindable(false), opened = $bindable(false), textBack = $bindable(false), selectedMode = $bindable<'simulated' | 'actual'>('simulated'), showControl = true, onFrontSelect, onClose, sourceElement, raisedOnly = false, flipInPlace = false, onMove, moveRequested = $bindable(false), readerNav, pairFaces = true, wall = false }: {
  id?: string;
  s: CardViewModel;
  inspection?: ResultsInspection;
  turned?: boolean;
  opened?: boolean;
  textBack?: boolean;
  selectedMode?: 'simulated' | 'actual';
  showControl?: boolean;
  onFrontSelect?: (trigger: HTMLButtonElement) => void;
  onClose?: () => void;
  sourceElement?: HTMLElement | null;
  raisedOnly?: boolean;
  flipInPlace?: boolean;
  onMove?: () => void;
  moveRequested?: boolean;
  /** Controls beside the raised card's turn button. */
  readerNav?: Snippet;
  /** Raise the front beside the back on wide screens. */
  pairFaces?: boolean;
  /** The front drifts and catches the light on its own until it is hovered. */
  wall?: boolean;
 } = $props();
 const generatedId = $props.id();
 const reviewId = $derived(id ?? generatedId);
 const seasonKey = $derived(inspection?.seasonId ?? s.details.sections.flatMap(section => section.rows).find(row => row.k === 'Season ID')?.v ?? `${s.full}:${s.year}:${s.team}`);
 const initial = untrack(() => ({ turned, opened, textBack, selectedMode }));
 let observedSeason = untrack(() => seasonKey);
let heading = $state<HTMLHeadingElement>();
 const view = $derived(inspection?.[selectedMode]);

 $effect(() => {
  const nextSeason = seasonKey;
  if (nextSeason !== observedSeason) {
   observedSeason = nextSeason;
   untrack(() => { turned = initial.turned; opened = initial.opened; textBack = initial.textBack; selectedMode = initial.selectedMode; });
  }
 });

 export function focusHeading(): void {
  heading?.focus({ preventScroll: true });
 }
 function returned(): void {
  if (moveRequested) {
   moveRequested = false;
   onMove?.();
  } else onClose?.();
 }
 function moveCard(): void {
  moveRequested = true;
  if (raisedOnly) opened = false;
  turned = false;
 }
 export async function showTextVersion(): Promise<void> {
  textBack = true;
  if (raisedOnly) opened = true;
  turned = true;
  await tick();
 const back = document.getElementById(`${reviewId}-back`);
 const textToggle = back?.querySelector<HTMLButtonElement>('.back-text-toggle');
 if (textToggle) {
  textToggle.focus({ preventScroll: true });
 }
}
 function selectMode(mode: 'simulated' | 'actual'): void {
  selectedMode = mode;
  turned = true;
 }
 async function toggleText(): Promise<void> {
  textBack = !textBack;
  turned = true;
  await tick();
  if (!textBack) document.getElementById(`${reviewId}-back`)?.querySelector<HTMLButtonElement>('button[aria-label^="Show text version for "]')?.focus({ preventScroll: true });
 }
</script>

<section id={reviewId} class="card-review" class:raised-only={raisedOnly} aria-labelledby={onFrontSelect || raisedOnly ? undefined : `${reviewId}-heading`} aria-label={onFrontSelect || raisedOnly ? `${s.full} · ${s.year}` : undefined} data-season-id={seasonKey}>
 {#if !onFrontSelect && !raisedOnly}<header class="review-header">
  <div><h3 id="{reviewId}-heading" bind:this={heading} tabindex="-1">{s.full} · {s.year}</h3><p>{s.team} · {s.pos}</p></div>
  {#if onClose}<button type="button" onclick={onClose}>Hide card</button>{/if}
 </header>{/if}
<div class="review-artwork">
  {#snippet backControls()}
   {#if inspection}
    <div class="season-toggle" role="group" aria-label="Season statistics">
     <button type="button" aria-label="162-0 season" aria-pressed={selectedMode === 'simulated'} onclick={() => selectMode('simulated')}>162-0</button>
     <button type="button" aria-label="Actual season" aria-pressed={selectedMode === 'actual'} onclick={() => selectMode('actual')}>Actual</button>
    </div>
   {/if}
   {#if textBack}<button type="button" class="back-text-toggle" aria-pressed={textBack} aria-controls="{reviewId}-back" onclick={toggleText}>Text version</button>{/if}
   {#if onMove}<button type="button" onclick={moveCard}>Move card</button>{/if}
  {/snippet}
 <CardFlip {s} bind:turned bind:opened {textBack} {showControl} {onFrontSelect} {sourceElement} {raisedOnly} {flipInPlace} {readerNav} {pairFaces} {wall} onReturned={raisedOnly ? returned : undefined} inspectionView={view} backId="{reviewId}-back" onDetails={showTextVersion} backControls={inspection || textBack || onMove ? backControls : undefined} />
</div>
</section>

<style>
 .card-review { width: 100%; min-width: 0; color: var(--text); }
 .review-header { display: flex; justify-content: space-between; align-items: start; gap: var(--space-3, 12px); margin-bottom: var(--space-3, 12px); }
 h3 { margin: 0; overflow-wrap: anywhere; }
 .review-header p { margin: .25rem 0 0; color: var(--muted); }
 .review-artwork { width: min(100%, 410px); margin-inline: auto; }
 .raised-only, .raised-only .review-artwork { display: contents; }
 /* A two-part switch in the card's own ink, so it reads as part of the back rather than page chrome. */
 .season-toggle { display: inline-flex; padding: 2px; border: 1px solid currentColor; border-radius: 999px; }
 .season-toggle button { min-height: 2.5rem; padding: 0 .85rem; border: 0; border-radius: 999px; color: inherit; background: transparent; font: 750 .75rem/1 system-ui, sans-serif; letter-spacing: .02em; white-space: nowrap; }
 .season-toggle button:hover { background: color-mix(in oklch, currentColor 12%, transparent); }
 .season-toggle button[aria-pressed='true'] { color: var(--back-ground, var(--background)); background: var(--back-ink, var(--text)); }
 .back-text-toggle { min-height: 44px; }
 button { min-height: 44px; }
</style>
