<script lang="ts">
 import type { CardViewModel } from './view-model.ts';
 import Material from './Material.svelte';
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
 let { s, face = 'front', interactive = false, thumbnail = false, onDetails }: {
  s: CardViewModel; face?: 'front' | 'back'; interactive?: boolean; thumbnail?: boolean;
  onDetails: () => void;
 } = $props();
	let root = $state<HTMLDivElement>();
 const colors = $derived(Object.entries(s.k).map(([role, color]) => `--${role}:${color}`).join(';'));
 const Front = $derived(fronts[s.era]);
 const Back = $derived(backs[s.era]);
</script>

<div bind:this={root} class="card" data-card={s.era} data-face={face} data-finish={s.fin.tier} data-thumbnail={thumbnail} data-interactive={interactive} style="{colors};--stamp:{s.fin.stamp};--emb:{s.fin.emb}" use:fit use:tilt={{ enabled: interactive && !thumbnail, eventTarget: root?.parentElement ?? undefined }}>
 {#if face === 'front'}<Material {s} layer="under" />{/if}
 <div class="face">
  {#if face === 'front'}<Front {s} />{:else}<Back {s} {onDetails} />{/if}
 </div>
 {#if face === 'front'}<Material {s} layer="over" />{/if}
</div>

<style>
 .card { container-type: inline-size; position: relative; width: 100%; aspect-ratio: 5 / 7; transform-style: preserve-3d; --mx: 23%; --my: 5%; --lx: -.45; --ly: -.75; --ang: 200deg; --lift: 0; --glare: 0; --g1: .85; --g2: .12; --g3: .12; --k: 1; }
 .face { position: relative; transform-style: preserve-3d; width: 100%; height: 100%; }
 .card :global([data-card]) { box-sizing: border-box; }
 .card :global(img) { max-width: none; }
 .card :global([data-layer]) { box-sizing: border-box; }
</style>
