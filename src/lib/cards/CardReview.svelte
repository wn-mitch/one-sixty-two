<script lang="ts">
 import { tick, untrack } from 'svelte';
 import type { ResultsInspection } from '../game/results-types.ts';
 import type { CardViewModel } from './view-model.ts';
 import CardFlip from './CardFlip.svelte';

 let { id, s, inspection, turned = $bindable(false), opened = $bindable(false), textBack = $bindable(false), selectedMode = $bindable<'simulated' | 'actual'>('simulated'), showControl = true, onFrontSelect, onClose, sourceElement, raisedOnly = false, onMove, moveRequested = $bindable(false) }: {
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
  onMove?: () => void;
  moveRequested?: boolean;
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
     <button type="button" aria-pressed={selectedMode === 'simulated'} onclick={() => selectMode('simulated')}>162-0 season</button>
     <button type="button" aria-pressed={selectedMode === 'actual'} onclick={() => selectMode('actual')}>Actual season</button>
    </div>
   {/if}
   {#if textBack}<button type="button" class="back-text-toggle" aria-pressed={textBack} aria-controls="{reviewId}-back" onclick={toggleText}>Text version</button>{/if}
   {#if onMove}<button type="button" onclick={moveCard}>Move card</button>{/if}
  {/snippet}
 <CardFlip {s} bind:turned bind:opened {textBack} {showControl} {onFrontSelect} {sourceElement} {raisedOnly} onReturned={raisedOnly ? returned : undefined} inspectionView={view} backId="{reviewId}-back" onDetails={showTextVersion} backControls={inspection || textBack || onMove ? backControls : undefined} />
</div>
</section>

<style>
 .card-review { width: 100%; min-width: 0; color: var(--text); }
 .review-header { display: flex; justify-content: space-between; align-items: start; gap: var(--space-3, 12px); margin-bottom: var(--space-3, 12px); }
 h3 { margin: 0; overflow-wrap: anywhere; }
 .review-header p { margin: .25rem 0 0; color: var(--muted); }
 .review-artwork { width: min(100%, 410px); margin-inline: auto; }
 .raised-only, .raised-only .review-artwork { display: contents; }
 .season-toggle { display: flex; flex-wrap: wrap; gap: .5rem; }
 .back-text-toggle { min-height: 44px; }
 button { min-height: 44px; }
</style>
