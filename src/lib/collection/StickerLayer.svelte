<script lang="ts">
 import StickerBadge from './StickerBadge.svelte';
 import { faceStickers, STICKER_SPOTS, type PlacedSticker } from './stickers.ts';

 /** Die-cut stickers on a card front. Positions are card-normalized centres; the layer never takes pointer input. */
 let { stickers }: { stickers: readonly PlacedSticker[] } = $props();
 const shown = $derived(faceStickers(stickers));
 const label = $derived(shown.map(item => item.definition.title).join(', '));
</script>

{#if shown.length}
 <div class="stickers" role="img" aria-label={`Stickers: ${label}`}>
  {#each shown as sticker (sticker.definition.family)}
   <span class="spot" style={`left:${sticker.x * 100}%;top:${sticker.y * 100}%`}>
    <StickerBadge definition={sticker.definition} tilt={STICKER_SPOTS[sticker.definition.family].tilt} />
   </span>
  {/each}
 </div>
{/if}

<style>
 .stickers { position: absolute; inset: 0; z-index: 4; pointer-events: none; transform: translateZ(1px); font-size: .82cqw; }
 .spot { position: absolute; translate: -50% -50%; line-height: 0; }
</style>
