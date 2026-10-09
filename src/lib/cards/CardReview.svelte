<script lang="ts">
 import { tick, untrack } from 'svelte';
 import type { ResultsInspection } from '../game/results-types.ts';
 import type { CardViewModel } from './view-model.ts';
 import CardFlip from './CardFlip.svelte';

 let { id, s, inspection, turned = $bindable(false), textBack = $bindable(false), selectedMode = $bindable<'simulated' | 'actual'>('simulated'), showControl = true, onFrontSelect, onClose }: {
  id?: string;
  s: CardViewModel;
  inspection?: ResultsInspection;
  turned?: boolean;
  textBack?: boolean;
  selectedMode?: 'simulated' | 'actual';
  showControl?: boolean;
  onFrontSelect?: (trigger: HTMLButtonElement) => void;
  onClose?: () => void;
 } = $props();
 const generatedId = $props.id();
 const reviewId = $derived(id ?? generatedId);
 const seasonKey = $derived(inspection?.seasonId ?? s.details.sections.flatMap(section => section.rows).find(row => row.k === 'Season ID')?.v ?? `${s.full}:${s.year}:${s.team}`);
 const initial = untrack(() => ({ turned, textBack, selectedMode }));
 let observedSeason = untrack(() => seasonKey);
 let heading = $state<HTMLHeadingElement>();
 let textToggle = $state<HTMLButtonElement>();
 const view = $derived(inspection?.[selectedMode]);

 $effect(() => {
  const nextSeason = seasonKey;
  if (nextSeason !== observedSeason) {
   observedSeason = nextSeason;
   untrack(() => { turned = initial.turned; textBack = initial.textBack; selectedMode = initial.selectedMode; });
  }
 });

 export function focusHeading(): void { heading?.focus({ preventScroll: true }); }
 export async function showTextVersion(): Promise<void> {
  textBack = true;
  turned = true;
  await tick();
  textToggle?.focus({ preventScroll: true });
 }
 function selectMode(mode: 'simulated' | 'actual'): void { selectedMode = mode; turned = true; }
 function toggleText(): void { textBack = !textBack; turned = true; }
</script>

<section id={reviewId} class="card-review" aria-labelledby={onFrontSelect ? undefined : `${reviewId}-heading`} aria-label={onFrontSelect ? `${s.full} · ${s.year}` : undefined} data-season-id={seasonKey}>
 {#if !onFrontSelect}<header class="review-header">
  <div><h3 id="{reviewId}-heading" bind:this={heading} tabindex="-1">{s.full} · {s.year}</h3><p>{s.team} · {s.pos}</p></div>
  {#if onClose}<button type="button" onclick={onClose}>Hide card</button>{/if}
 </header>{/if}
 {#if inspection}
  <div class="season-toggle" role="group" aria-label="Season statistics">
   <button type="button" aria-pressed={selectedMode === 'simulated'} onclick={() => selectMode('simulated')}>162-0 season</button>
   <button type="button" aria-pressed={selectedMode === 'actual'} onclick={() => selectMode('actual')}>Actual season</button>
  </div>
 {/if}
 {#if !onFrontSelect || turned}
  <button bind:this={textToggle} type="button" class="text-toggle" aria-pressed={textBack} aria-controls="{reviewId}-back" onclick={toggleText}>Text version</button>
 {/if}
 <div class="review-artwork">
  <CardFlip {s} bind:turned {textBack} {showControl} {onFrontSelect} inspectionView={view} inspectionDetails={inspection?.details} backId="{reviewId}-back" onDetails={showTextVersion} />
 </div>
</section>

<style>
 .card-review { width: 100%; min-width: 0; color: var(--text); }
 .review-header { display: flex; justify-content: space-between; align-items: start; gap: var(--space-3, 12px); margin-bottom: var(--space-3, 12px); }
 h3 { margin: 0; overflow-wrap: anywhere; }
 .review-header p { margin: .25rem 0 0; color: var(--muted); }
 .review-artwork { width: min(100%, 410px); margin-inline: auto; }
 .season-toggle { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
 button { min-height: 44px; }
 .text-toggle { margin-bottom: 1rem; }
</style>
