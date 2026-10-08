<script lang="ts">
 import type { CardViewModel } from './view-model.ts';
 import Card from './Card.svelte';
 import { flip } from './motion.ts';
 let { s, onDetails, turned = $bindable(false), showControl = true, onFrontSelect }: {
  s: CardViewModel; onDetails: () => void; turned?: boolean; showControl?: boolean;
  onFrontSelect?: (trigger: HTMLButtonElement) => void;
 } = $props();
 let turnControl = $state<HTMLButtonElement>();
 export function focusTurn() { turnControl?.focus({ preventScroll: true }); }
</script>

<div class="cardbox" data-cardbox data-face={turned ? 'back' : 'front'}>
 {#if showControl}<button bind:this={turnControl} class="turn" type="button" data-turn aria-pressed={turned} onclick={() => turned = !turned}>Turn over</button>{/if}
 <div class="stack" class:turned data-flip use:flip={{ turned }}>
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
   <Card {s} face="back" {onDetails} />
  </div>
 </div>
</div>

<style>
 .cardbox { display: grid; justify-items: center; gap: 1rem; width: 100%; }
 .turn { min-height: 2.75rem; min-width: 9rem; }
 .stack { position: relative; container-type: inline-size; transform-style: preserve-3d; width: min(100%, var(--card-front-width, 20rem)); }
 .stack.turned { width: min(100%, var(--card-back-width, 410px)); }
 .front { position: relative; width: min(100%, var(--card-front-width, 20rem)); margin-inline: auto; backface-visibility: hidden; }
 .back { position: absolute; inset: 0; width: 100%; backface-visibility: hidden; transform: translateZ(-5px) rotateY(180deg); }
 .turned .front { position: absolute; top: 0; left: 50%; width: min(100%, var(--card-front-width, 20rem)); margin: 0; transform: translateX(-50%); }
 .turned .back { position: relative; }
 .stock-edge { position: absolute; inset: 0; border-radius: 1.8cqw; pointer-events: none; }
 .select-front { display: block; width: 100%; min-height: 44px; padding: 0; border: 0; border-radius: .4rem; background: transparent; color: inherit; text-align: inherit; cursor: pointer; }
 @media (prefers-reduced-motion: reduce) {
  .stack, .back, .turned .front { transform: none; }
  .stack:not(.turned) .back, .stack.turned .front { display: none; }
 }
</style>
