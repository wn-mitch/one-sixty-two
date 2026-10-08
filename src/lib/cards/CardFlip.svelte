<script lang="ts">
 import type { InspectionSeasonView } from '../game/results-types.ts';
 import type { CardViewModel } from './view-model.ts';
 import Card from './Card.svelte';
 import InspectionBack from './InspectionBack.svelte';
 import { flip } from './motion.ts';

 let {
  s,
  onDetails,
  turned = $bindable(false),
  showControl = true,
  onFrontSelect,
  inspectionView,
  scale = 1
 }: {
  s: CardViewModel;
  onDetails: () => void;
  turned?: boolean;
  showControl?: boolean;
  onFrontSelect?: (trigger: HTMLButtonElement) => void;
  inspectionView?: InspectionSeasonView;
  scale?: number;
 } = $props();
 let cardbox = $state<HTMLDivElement>();
 let turnControl = $state<HTMLButtonElement>();
 const fittedScale = $derived(Math.max(0.01, Math.min(1, scale)));

 export function focusTurn(): void {
  turnControl?.focus({ preventScroll: true });
 }

 export function chromeHeight(): number {
  if (!cardbox || !turnControl) return 0;
  const styles = getComputedStyle(cardbox);
  const gap = Number.parseFloat(styles.rowGap || styles.gap) || 0;
  return turnControl.getBoundingClientRect().height + gap;
 }

 function toggle(): void {
  turned = !turned;
 }

 /** Extends the pointer hit area without wrapping the semantic card; the sibling turn button is the keyboard equivalent. */
 function surfaceFlip(node: HTMLElement): { destroy(): void } {
  const handleClick = (event: MouseEvent) => {
   const target = event.target;
   if (!(target instanceof Element)) return;
   if (target.closest('button, a, input, select, textarea, summary, [role="button"]')) return;
   toggle();
  };
  node.addEventListener('click', handleClick);
  return { destroy: () => node.removeEventListener('click', handleClick) };
 }
</script>

<div
 bind:this={cardbox}
 class="cardbox"
 class:results={!!inspectionView}
 data-cardbox
 data-face={turned ? 'back' : 'front'}
 style={`--inspection-scale:${fittedScale};--inspection-width:${360 * fittedScale}px;--inspection-height:${504 * fittedScale}px`}
>
 {#if showControl}
  <button bind:this={turnControl} class="turn" type="button" data-turn aria-pressed={turned} onclick={toggle}>
   {turned ? 'Show front' : 'Turn over'}
  </button>
 {/if}
 <div class="scaled-viewport">
  <div class="scaled-card">
   <div class="stack" class:turned data-flip use:flip={{ turned }} use:surfaceFlip>
    <div class="front" inert={turned} aria-hidden={turned}>
     {#if onFrontSelect}
      <button type="button" class="select-front" aria-label="Select {s.year} {s.full}" onclick={event => onFrontSelect?.(event.currentTarget)}><Card {s} face="front" interactive {onDetails} /></button>
     {:else}
      <Card {s} face="front" interactive {onDetails} />
     {/if}
    </div>
    {#each ['#d4cfc4', '#f2efe8', '#d4cfc4', '#a9a397'] as color, index}
     <div class="stock-edge" data-layer="flip.slab" style:background={color} style:transform="translateZ(-{index + 1}px)"></div>
    {/each}
    <div class="back" inert={!turned} aria-hidden={!turned}>
     {#if inspectionView}
      <InspectionBack {s} view={inspectionView} {onDetails} />
     {:else}
      <Card {s} face="back" {onDetails} />
     {/if}
    </div>
   </div>
  </div>
 </div>
</div>

<style>
 .cardbox { display: grid; justify-items: center; gap: 1rem; width: 100%; }
 .turn { min-height: 2.75rem; min-width: 9rem; }
 .scaled-viewport, .scaled-card { width: 100%; }
 .stack { position: relative; container-type: inline-size; transform-style: preserve-3d; width: min(100%, var(--card-front-width, 20rem)); margin-inline: auto; }
 .stack.turned { width: min(100%, var(--card-back-width, 410px)); }
 .front { position: relative; width: min(100%, var(--card-front-width, 20rem)); margin-inline: auto; backface-visibility: hidden; }
 .back { position: absolute; inset: 0; width: 100%; backface-visibility: hidden; transform: translateZ(-5px) rotateY(180deg); }
 .turned .front { position: absolute; top: 0; left: 50%; width: min(100%, var(--card-front-width, 20rem)); margin: 0; transform: translateX(-50%); }
 .turned .back { position: relative; }
 .stock-edge { position: absolute; inset: 0; border-radius: 1.8cqw; pointer-events: none; }
 .select-front { display: block; width: 100%; min-height: 44px; padding: 0; border: 0; border-radius: .4rem; background: transparent; color: inherit; text-align: inherit; cursor: pointer; }
 .results.cardbox { gap: .5rem; }
 .results .scaled-viewport { width: var(--inspection-width); height: var(--inspection-height); }
 .results .scaled-card { width: 360px; height: 504px; transform: scale(var(--inspection-scale)); transform-origin: top left; }
 .results .stack,
 .results .stack.turned,
 .results .front,
 .results .turned .front,
 .results .back { width: 360px; height: 504px; }
 @media (prefers-reduced-motion: reduce) {
  .stack, .back, .turned .front { transform: none; }
  .stack:not(.turned) .back, .stack.turned .front { display: none; }
 }
</style>
