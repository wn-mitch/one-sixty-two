<script lang="ts">
 import type { StickerDefinition } from './stickers.ts';

 /** One die-cut sticker. Its size is 21em of the parent's font size, so a card sets 1cqw and other surfaces set a rem size. */
 let { definition, tilt = 0 }: { definition: StickerDefinition; tilt?: number } = $props();
</script>

<span class="sticker" data-family={definition.family} style={`--tilt:${tilt}deg`}>
 <b>{definition.label[0]}</b><small>{definition.label[1]}</small>
</span>

<style>
 .sticker {
  --tone: oklch(62% 0.17 255);
  width: 21em;
  aspect-ratio: 1;
  rotate: var(--tilt);
  display: inline-grid;
  place-content: center;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 28%, oklch(100% 0 0 / .35), transparent 46%), var(--tone);
  box-shadow: 0 0 0 1.1em oklch(98% 0.004 95), 0 .9em 1.6em oklch(0% 0 0 / .45);
  color: oklch(99% 0.004 95);
  font-family: 'Barlow Condensed', sans-serif;
  text-align: center;
  line-height: .9;
  text-transform: uppercase;
  text-shadow: 0 .25em 0 oklch(0% 0 0 / .3);
 }
 .sticker b { font-size: 7.4em; font-weight: 800; letter-spacing: -.02em; }
 .sticker small { font-size: 3.9em; font-weight: 700; letter-spacing: .04em; }
 .sticker[data-family='team'] { --tone: oklch(70% 0.15 80); color: oklch(22% 0.03 80); text-shadow: none; }
 .sticker[data-family='mvp'] { --tone: oklch(58% 0.2 25); }
 .sticker[data-family='power'] { --tone: oklch(64% 0.19 45); }
 .sticker[data-family='contact'] { --tone: oklch(58% 0.12 190); }
 .sticker[data-family='production'] { --tone: oklch(52% 0.17 300); }
 .sticker[data-family='speed'] { --tone: oklch(60% 0.16 150); }
 .sticker[data-family='eye'] { --tone: oklch(58% 0.15 240); }
 .sticker[data-family='strikeouts'] { --tone: oklch(42% 0.13 265); }
 .sticker[data-family='ace'] { --tone: oklch(50% 0.2 280); }
 .sticker[data-family='closer'] { --tone: oklch(48% 0.19 20); }
 .sticker[data-family='loyalty'] { --tone: oklch(80% 0.02 255); color: oklch(24% 0.02 255); text-shadow: none; }
</style>
