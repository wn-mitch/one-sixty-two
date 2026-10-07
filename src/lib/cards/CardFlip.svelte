<script lang="ts">
 import type { CardViewModel } from './view-model.ts';
 import Card from './Card.svelte';
 import { flip } from './motion.ts';
 let { s, onDetails }: {
  s: CardViewModel; onDetails: () => void;
 } = $props();
 let turned = $state(false);
 let turnControl: HTMLButtonElement;
 export function focusTurn() { turnControl?.focus({ preventScroll: true }); }
</script>

<div class="cardbox" data-cardbox data-face={turned ? 'back' : 'front'}>
 <button bind:this={turnControl} class="turn" type="button" data-turn aria-pressed={turned} onclick={() => turned = !turned}>Turn over</button>
 <div class="stack" class:turned data-flip use:flip={{ turned }}>
  <div class="front" inert={turned} aria-hidden={turned}>
   <Card {s} face="front" interactive {onDetails} />
  </div>
  {#each ['#d4cfc4', '#f2efe8', '#d4cfc4', '#a9a397'] as color, index}
   <div class="stock-edge" data-layer="flip.slab" style:background={color} style:transform="translateZ(-{index + 1}px)"></div>
  {/each}
  <div class="back" inert={!turned} aria-hidden={!turned}>
   <Card {s} face="back" readable {onDetails} />
  </div>
 </div>
</div>

<style>
 .cardbox { display: grid; justify-items: center; gap: 1rem; width: 100%; }
 .turn { min-height: 2.75rem; min-width: 9rem; }
 .stack { position: relative; container-type: inline-size; transform-style: preserve-3d; width: min(100%, 20rem); }
 .stack.turned { width: min(100%, 44rem); }
 .front { position: relative; width: min(100%, 20rem); margin-inline: auto; backface-visibility: hidden; }
 .back { position: absolute; inset: 0; width: 100%; backface-visibility: hidden; transform: translateZ(-5px) rotateY(180deg); }
 .turned .front { position: absolute; top: 0; left: 50%; width: min(100%, 20rem); margin: 0; transform: translateX(-50%); }
 .turned .back { position: relative; }
 .stock-edge { position: absolute; inset: 0; border-radius: 1.8cqw; pointer-events: none; }
 @media (prefers-reduced-motion: reduce) {
  .stack, .back, .turned .front { transform: none; }
  .stack:not(.turned) .back, .stack.turned .front { display: none; }
 }
</style>
