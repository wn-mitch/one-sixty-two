<script lang="ts">
 import StickerBadge from './StickerBadge.svelte';
 import { faceStickers, STICKER_SPOTS, type PlacedSticker } from './stickers.ts';

 /** Die-cut stickers on a card front. Positions are card-normalized centres; the layer never takes pointer input. */
 let { stickers, fresh }: { stickers: readonly PlacedSticker[]; fresh?: ReadonlySet<string> } = $props();
 const shown = $derived(faceStickers(stickers));
 const label = $derived(shown.map(item => item.definition.title).join(', '));
</script>

{#if shown.length}
 <div class="stickers" role="img" aria-label={`Stickers: ${label}`}>
  {#each shown as sticker (sticker.definition.family)}
   <span class="spot" class:fresh={fresh?.has(sticker.kind)} style={`left:${sticker.x * 100}%;top:${sticker.y * 100}%`}>
    <StickerBadge definition={sticker.definition} tilt={STICKER_SPOTS[sticker.definition.family].tilt} />
   </span>
  {/each}
 </div>
{/if}

<style>
 .stickers { position: absolute; inset: 0; z-index: 4; pointer-events: none; transform: translateZ(1px); font-size: .5cqw; }
 .spot { position: absolute; translate: -50% -50%; line-height: 0; }
 /* A just-earned sticker slaps on, then two glints twinkle across it a few times. --sparkle-delay comes from the surrounding surface. */
 .fresh { animation: slap 480ms cubic-bezier(.16, 1, .3, 1) var(--sparkle-delay, 0ms) both; }
 .fresh::before, .fresh::after {
  content: ''; position: absolute; z-index: 1; width: 45%; aspect-ratio: 1;
  background: oklch(99% .02 95);
  clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%);
  filter: drop-shadow(0 0 .4em oklch(95% .1 95));
  opacity: 0; pointer-events: none;
  animation: twinkle 1.4s ease-in-out calc(var(--sparkle-delay, 0ms) + 380ms) 4;
 }
 .fresh::before { top: -12%; right: -10%; }
 .fresh::after { bottom: -6%; left: -14%; width: 30%; animation-delay: calc(var(--sparkle-delay, 0ms) + 900ms); }
 @keyframes slap { from { scale: 1.9; rotate: -14deg; opacity: 0; } 60% { opacity: 1; } to { scale: 1; rotate: 0deg; opacity: 1; } }
 @keyframes twinkle { 0%, 100% { opacity: 0; scale: .2; rotate: 0deg; } 45% { opacity: 1; scale: 1; rotate: 45deg; } }
 :global([data-motion='off']) .fresh, :global([data-motion='off']) .fresh::before, :global([data-motion='off']) .fresh::after { animation: none; }
 @media (prefers-reduced-motion: reduce) { .fresh, .fresh::before, .fresh::after { animation: none; } }
</style>
