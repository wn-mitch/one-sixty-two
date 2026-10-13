<script lang="ts">
 import type { StickerDefinition } from './stickers.ts';

 /** One die-cut sticker. Its size is 21em of the parent's font size, so a card sets 1cqw and other surfaces set a rem size. */
 let { definition, tilt = 0 }: { definition: StickerDefinition; tilt?: number } = $props();
</script>

<span class="sticker" data-family={definition.family} data-kind={definition.kind} data-foil={definition.foil} data-long={definition.label[0].length > 6 || undefined} style={`--tilt:${tilt}deg`}>
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
 /* A first line longer than six characters steps down so it stays inside the die cut. */
 .sticker[data-long] b { font-size: 5.6em; }
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
 .sticker[data-family='noHitter'] { --tone: oklch(30% 0.06 260); }
 .sticker[data-family='shutout'] { --tone: oklch(36% 0.08 230); }
 .sticker[data-family='strikeoutGame'] { --tone: oklch(46% 0.17 285); }
 .sticker[data-family='saves'] { --tone: oklch(52% 0.18 10); }
 .sticker[data-family='perfectCloser'] { --tone: oklch(40% 0.15 15); }
 .sticker[data-family='club'] { --tone: oklch(56% 0.15 120); }
 .sticker[data-family='cycle'] { --tone: oklch(60% 0.14 205); }
 .sticker[data-family='homerGame'] { --tone: oklch(58% 0.2 35); }
 .sticker[data-family='grandSlam'] { --tone: oklch(55% 0.21 350); }
 .sticker[data-family='walkOff'] { --tone: oklch(50% 0.16 165); }
 /* Grade stickers share the grade chip's tones. */
 .sticker[data-family='grade'] { color: oklch(16% .009 255); text-shadow: none; }
 .sticker[data-family='grade'] b { font-style: italic; font-weight: 900; }
 .sticker[data-kind='grade-perfect'] { --tone: oklch(85% .15 110); }
 .sticker[data-kind='grade-s-plus'] { --tone: oklch(86% .16 88); }
 .sticker[data-kind='grade-s'] { --tone: oklch(79% .15 68); }
 .sticker[data-kind='grade-aa'] { --tone: oklch(74% .14 305); }
 .sticker[data-kind='grade-a'] { --tone: oklch(76% .12 240); }
 .sticker[data-kind='grade-b'] { --tone: oklch(78% .13 155); }
 .sticker[data-kind='grade-c'] { --tone: oklch(72% .04 230); }
 .sticker[data-kind='grade-d'] { --tone: oklch(66% .06 55); }
 .sticker[data-kind='grade-f'] { --tone: oklch(68% .15 25); }
 .sticker[data-family='loyalty'] { --tone: oklch(80% 0.02 255); color: oklch(24% 0.02 255); text-shadow: none; }
 /* A laddered family's top four tiers are foil, as the top grades are: gem, gold, silver, bronze. On a card the sheen follows its tilt. */
 .sticker[data-foil] {
  background: radial-gradient(circle at 34% 28%, oklch(100% 0 0 / .45), transparent 46%), var(--foil) var(--mx, 30%) var(--my, 20%) / 300% 300%;
  color: oklch(18% 0.02 70); text-shadow: none;
 }
 .sticker[data-foil='bronze'] { --foil: linear-gradient(115deg, #6e4321 0%, #e0a872 16%, #96602f 30%, #f6cfa0 44%, #8a5629 58%, #d99c62 74%, #5f3a1b 100%); }
 .sticker[data-foil='silver'] { --foil: linear-gradient(115deg, #8f99a4 0%, #f4f6f8 16%, #aeb7c0 30%, #ffffff 44%, #a3adb7 58%, #e9edf1 74%, #8a949f 100%); }
 .sticker[data-foil='gold'] { --foil: linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%); }
 .sticker[data-foil='gem'] { --foil: linear-gradient(115deg, #ffd0ee 0%, #ffffff 9%, #8fe6ff 19%, #ffe07a 30%, #a8ffc0 41%, #e2b0ff 52%, #ffffff 62%, #ffc2a8 74%, #9fe0ff 87%, #ffd0ee 100%); }
</style>
