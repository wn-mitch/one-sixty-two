<script lang="ts">
 import type { CardViewModel } from './view-model.ts';
 import Material from './Material.svelte';
 import CompactPlate from './CompactPlate.svelte';
 import { fit } from './fit.ts';
 import { tilt } from './motion.ts';
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
  capture = false,
  onDetails
 }: {
  s: CardViewModel;
  face?: 'front' | 'back';
  interactive?: boolean;
  thumbnail?: boolean;
  compact?: boolean;
  idle?: boolean;
  wall?: boolean;
  capture?: boolean;
  onDetails: () => void;
 } = $props();
	let root = $state<HTMLDivElement>();
 const colors = $derived(Object.entries(s.k).map(([role, color]) => `--${role}:${color}`).join(';'));
 const motionFinish = $derived(s.fin.tier === 'foil' ? 'silver' : s.fin.tier === 'emboss' ? 'gold' : s.fin.tier);
 const Front = $derived(fronts[s.era]);
 const Back = $derived(backs[s.era]);
</script>

<div
 bind:this={root}
 class="card"
 data-card={s.era}
 data-face={face}
 data-finish={s.fin.tier}
 data-thumbnail={thumbnail}
 data-interactive={interactive}
 data-compact={compact}
 data-capture={capture}
 style="{colors};--stamp:{s.fin.stamp};--emb:{s.fin.emb}"
 use:fit
 use:tilt={{
  enabled: interactive && !thumbnail && !capture,
  eventTarget: root?.parentElement ?? undefined,
  idle: idle && !capture,
  wall: wall && !capture,
  finish: motionFinish,
  identity: `${s.full}|${s.year}|${s.team}|${s.pos}`
 }}
>
 {#if face === 'front'}<Material {s} layer="under" {capture} />{/if}
 <div class="face">
  {#if face === 'front'}<Front {s} />{:else}<Back {s} {onDetails} />{/if}
 </div>
 {#if face === 'front' && compact}<CompactPlate {s} />{/if}
 {#if face === 'front'}<Material {s} layer="over" {capture} />{/if}
</div>

<style>
 .card { container-type: inline-size; position: relative; width: 100%; aspect-ratio: 5 / 7; transform-style: preserve-3d; --mx: 23%; --my: 5%; --lx: -.45; --ly: -.75; --ang: 200deg; --lift: 0; --glare: 0; --g1: .85; --g2: .12; --g3: .12; --k: 1; }
 .face { position: relative; transform-style: preserve-3d; width: 100%; height: 100%; }
 .card[data-compact='true'] { min-width: 72px; }
 .card[data-compact='true'] :global([data-layer='season.year']) { font-size: max(11cqw, 8px) !important; line-height: 1; }
 .card[data-compact='true'] :global([data-layer='season.year'] ~ span) { display: none; }
 .card[data-compact='true'] :global([data-layer='season.roundel']) { top: 32cqw !important; width: max(35cqw, 22px) !important; height: max(35cqw, 22px) !important; }
 .card[data-compact='true'][data-card='2000s'] :global([data-layer='season.rail']) { top: 4cqw; bottom: auto !important; left: 14cqw !important; right: auto !important; z-index: 2; padding: 1cqw 2cqw; background: var(--stock); color: var(--fieldOnStock); }
 .card[data-compact='true'][data-card='2000s'] :global([data-layer='season.rail'] > div) { writing-mode: horizontal-tb !important; transform: none !important; }
 .card :global([data-card]) { box-sizing: border-box; }
 .card :global(img) { max-width: none; }
 .card :global([data-layer]) { box-sizing: border-box; }
 /* Capture keeps fixed finish lighting in a flat scene. The front's isolated
    paint group keeps its rotated era bands separate from the finish layers. */
 .card[data-capture='true'] { --mx: 68% !important; --my: 24% !important; --lx: .36 !important; --ly: -.64 !important; --ang: 218deg !important; --lift: .42 !important; --glare: .08 !important; --g1: .92 !important; --g2: .38 !important; --g3: .66 !important; transform: none !important; transform-style: flat !important; isolation: isolate; }
 .card[data-capture='true'] .face { transform: none !important; transform-style: flat !important; isolation: isolate; }
 .card[data-capture='true'], .card[data-capture='true'] :global(*) { animation: none !important; transition: none !important; }
</style>
