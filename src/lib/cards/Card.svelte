<script lang="ts">
 import type { CardViewModel } from './view-model.ts';
 import Material from './Material.svelte';
 import CompactPlate from './CompactPlate.svelte';
 import { fit } from './fit.ts';
 import { tilt } from './motion.ts';
 import { CardLight, LightEngine, lightCanvas } from './surface/card-light.ts';
 import { GEM_RING } from './finish.ts';
 import type { ReliefProfile } from './surface/surfaces.ts';
 import type { HoloPattern } from './surface/holo-films.ts';
 import type { FoilPlate, PlateTuning } from './surface/foil-plates.ts';
 import { appSettings } from '../game/settings.svelte.ts';
 import Front1950s from './fronts/Front1950s.svelte';
 import Front1960s from './fronts/Front1960s.svelte';
 import Front1970s from './fronts/Front1970s.svelte';
 import Front1980s from './fronts/Front1980s.svelte';
 import Front1990s from './fronts/Front1990s.svelte';
 import Front2000s from './fronts/Front2000s.svelte';
 import Front2010s from './fronts/Front2010s.svelte';
 import Front2020s from './fronts/Front2020s.svelte';
 import Back1950s from './backs/Back1950s.svelte';
 import Back1960s from './backs/Back1960s.svelte';
 import Back1970s from './backs/Back1970s.svelte';
 import Back1980s from './backs/Back1980s.svelte';
 import Back1990s from './backs/Back1990s.svelte';
 import Back2000s from './backs/Back2000s.svelte';
 import Back2010s from './backs/Back2010s.svelte';
 import Back2020s from './backs/Back2020s.svelte';
 import StickerLayer from '../collection/StickerLayer.svelte';
 import { cardStickers } from '../collection/store.svelte.ts';
 import type { PlacedSticker } from '../collection/stickers.ts';
 const fronts = { '1950s': Front1950s, '1960s': Front1960s, '1970s': Front1970s, '1980s': Front1980s, '1990s': Front1990s, '2000s': Front2000s, '2010s': Front2010s, '2020s': Front2020s };
 const backs = { '1950s': Back1950s, '1960s': Back1960s, '1970s': Back1970s, '1980s': Back1980s, '1990s': Back1990s, '2000s': Back2000s, '2010s': Back2010s, '2020s': Back2020s };
 let {
  s,
  face = 'front',
  interactive = false,
  thumbnail = false,
  compact = false,
  idle = false,
  wall = false,
  scene = false,
  nameProfile,
  film,
  plate,
  plateTuning,
  capture = false,
  stickers,
  freshStickers,
  onDetails
 }: {
  s: CardViewModel;
  face?: 'front' | 'back';
  interactive?: boolean;
  thumbnail?: boolean;
  compact?: boolean;
  idle?: boolean;
  wall?: boolean;
  /** Drawn in a lit scene such as the home wall: a flat, fixed-light finish whose moving light comes from that scene's WebGL pass. */
  scene?: boolean;
  /** How a raised name is shaped under the WebGL light; the renderer's default when unset. */
  nameProfile?: ReliefProfile;
  /** Prints this holo film and presses this foil plate, tuned so, instead of the era's, for the finish workshop. */
  film?: HoloPattern;
  plate?: FoilPlate;
  plateTuning?: PlateTuning;
  capture?: boolean;
  /** Overrides the collection's stickers for this card, e.g. while they are being arranged. */
  stickers?: readonly PlacedSticker[];
  /** Sticker kinds just earned; they pop on and sparkle. */
  freshStickers?: ReadonlySet<string>;
  onDetails: () => void;
 } = $props();
	let root = $state<HTMLDivElement>();
 const colors = $derived(Object.entries(s.k).map(([role, color]) => `--${role}:${color}`).join(';'));
 const Front = $derived(fronts[s.era]);
 const Back = $derived(backs[s.era]);
 // Captures and lit scenes keep the static finish; every other front is lit by its own WebGL canvas.
 const flat = $derived(capture || scene);
 // Compact cards and thumbnails are too small for relief to read, so they keep the static finish too.
 const lit = $derived(!flat && !compact && !thumbnail);
 // A lit card on a browser that can run the light canvas prints ink only: the shader draws every foil, bevel and glint.
 // Elsewhere the finish arrives through the CSS variables below and Material's paint.
 const shaded = $derived(lit && LightEngine.shared() !== null);
 // The photo ring takes the tier's foil; Gem's is the holo ring.
 const finishPaint = $derived(shaded ? '' : `;--stamp:${s.fin.stamp};--emb:${s.fin.emb};--gem-ring:${s.fin.gem ? GEM_RING : s.fin.stamp}`);
 const light = new CardLight();
 $effect(() => light.setNameProfile(nameProfile));
 const shownStickers = $derived(face === 'front' && !compact && !thumbnail && !capture && (stickers || appSettings.showStickers) ? stickers ?? cardStickers(s.seasonId) : undefined);
 // Stickers print under the light, so a lit card repaints its map when they are placed, moved or hidden.
 $effect(() => {
  void shownStickers;
  LightEngine.shared()?.invalidate(light);
 });
 const motionFinish = $derived(s.fin.tier === 'foil' ? 'silver' : s.fin.tier === 'emboss' ? 'gold' : s.fin.tier);
</script>

<div
 bind:this={root}
 class="card"
 data-card={s.era}
 data-face={face}
 data-finish={s.fin.tier}
 data-identity={`${s.full}|${s.year}|${s.team}|${s.pos}`}
 data-film={film}
 data-plate={plate}
 data-plate-tuning={plateTuning && `${plateTuning.scale},${plateTuning.tone},${plateTuning.stain},${plateTuning.vivid ?? 1}`}
 data-thumbnail={thumbnail}
 data-interactive={interactive}
 data-compact={compact}
 data-capture={capture}
 data-flat={flat}
 data-shaded={shaded}
 style="{colors}{finishPaint}"
 use:fit
 use:tilt={{
  enabled: interactive && !thumbnail && !flat,
  eventTarget: root?.parentElement ?? undefined,
  idle: idle && !flat,
  wall: wall && !flat,
  finish: motionFinish,
  light: lit ? light : undefined,
  identity: `${s.full}|${s.year}|${s.team}|${s.pos}`
 }}
>
 {#if face === 'front'}<Material {s} layer="under" />{/if}
 <div class="face">
  {#if face === 'front'}<Front {s} />{:else}<Back {s} {onDetails} />{/if}
 </div>
 {#if face === 'front' && compact}<CompactPlate {s} />{/if}
 {#if face === 'front'}<Material {s} layer="over" paint={!shaded} />{/if}
 <!-- Explicit stickers (the collection editor) always show; elsewhere the player's setting decides. -->
 {#if shownStickers}<StickerLayer era={s.era} stickers={shownStickers} fresh={freshStickers} />{/if}
 {#if face === 'front' && lit}<canvas class="light" aria-hidden="true" use:lightCanvas={light}></canvas>{/if}
</div>

<style>
 /* The finish prints under one fixed light; its moving light, relief and foil come from the WebGL canvas. */
 .card { container-type: inline-size; position: relative; width: 100%; aspect-ratio: 5 / 7; isolation: isolate; --mx: 68%; --my: 24%; --lx: .36; --ly: -.64; --ang: 218deg; --lift: .42; --glare: .08; --g1: .92; --g2: .38; --g3: .66; --k: 1; }
 .face { position: relative; width: 100%; height: 100%; }
 /* Above the tagged finish shapes, so relief, highlights and holo reach the ring too. It fades in on its first frame. */
 .light { position: absolute; inset: 0; z-index: 101; width: 100%; height: 100%; border-radius: 1.8cqw; pointer-events: none; opacity: 0; transition: opacity 240ms ease-out; }
 .light:global([data-presented]) { opacity: 1; }
 /* The photo window's bevel is a light effect; a shaded card presses the window into the surface map instead. */
 .card[data-shaded='true'] :global([data-layer='material.photo-bevel']) { display: none; }
 /* Each era's finish rim is as wide as its layout allows, up to 3.2cqw, so the foil has room without crowding print. */
 .card[data-card='1960s'] { --rim-era: 1.6; }
 .card[data-card='1970s'], .card[data-card='2000s'], .card[data-card='2010s'], .card[data-card='2020s'] { --rim-era: 1.5; }
 .card[data-card='1980s'] { --rim-era: 1.4; }
 .card[data-card='1990s'] { --rim-era: 1.3; }
 /* The 2000s rail is the card's left edge, so the finish rim starts at its inner side. */
 .card[data-card='2000s'] { --rim-left: 10cqw; --rim-left-radius: 0; }
 .card[data-compact='true'] { min-width: 72px; }
 .card[data-compact='true'] :global([data-layer='season.year']) { font-size: max(11cqw, 8px) !important; line-height: 1; }
 .card[data-compact='true'] :global([data-layer='season.year'] ~ span) { display: none; }
 .card[data-compact='true'] :global([data-layer='season.roundel']) { top: 32cqw !important; width: max(35cqw, 22px) !important; height: max(35cqw, 22px) !important; }
 .card[data-compact='true'][data-card='2000s'] :global([data-layer='season.rail']) { top: 4cqw; bottom: auto !important; left: 14cqw !important; right: auto !important; z-index: 2; padding: 1cqw 2cqw; background: var(--stock); color: var(--fieldOnStock); }
 .card[data-compact='true'][data-card='2000s'] :global([data-layer='season.rail'] > div) { writing-mode: horizontal-tb !important; transform: none !important; }
 .card :global([data-card]) { box-sizing: border-box; }
 .card :global(img) { max-width: none; }
 .card :global([data-layer]) { box-sizing: border-box; }
 /* Captures and lit scenes hold the card flat; the front's isolated paint group keeps its rotated era bands separate from the finish layers. */
 .card[data-flat='true'] { transform: none !important; }
 .card[data-flat='true'] .face { transform: none !important; isolation: isolate; }
 .card[data-capture='true'], .card[data-capture='true'] :global(*) { animation: none !important; transition: none !important; }
</style>
