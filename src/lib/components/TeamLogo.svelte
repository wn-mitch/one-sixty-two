<script lang="ts">
 import { onMount } from 'svelte';
 import { loadMedia, selectLogo } from '../media/client.ts';
 import type { MediaManifest } from '../media/types.ts';
 let { franchiseId, year, label, size = 'medium' }: {
  franchiseId: string; year?: number; label?: string; size?: 'small' | 'medium' | 'large';
 } = $props();
 let media = $state.raw<MediaManifest | null>(null);
 let failedUrl = $state('');
 let unavailable = $state(false);
 const team = $derived(media?.teams[franchiseId]);
 const mark = $derived(selectLogo(media, franchiseId, year));
 const description = $derived(mark && mark.asset.url !== failedUrl
  ? `${mark.historical ? `${year} team mark` : 'Current franchise mark'}: ${label ?? team?.name ?? franchiseId}`
  : `${label ?? team?.name ?? franchiseId}: ${unavailable ? 'image sources unavailable' : media ? failedUrl ? 'logo unavailable' : 'no verified logo' : 'loading logo'}`);
 onMount(() => {
  let disposed = false;
  void loadMedia().then(value => { if (!disposed) media = value; }).catch(() => { if (!disposed) unavailable = true; });
  return () => { disposed = true; };
 });
</script>

<span class="team-mark" class:small={size === 'small'} class:large={size === 'large'} style:--team-color={team?.color ?? '#8bd7e2'} title={description}>
 {#if mark && mark.asset.url !== failedUrl}
  <img src={mark.asset.url} alt={description} width={mark.asset.width} height={mark.asset.height} loading="lazy" decoding="async" onerror={event => failedUrl = event.currentTarget.getAttribute('src') ?? ''} />
 {:else}
  <span class="abbreviation" aria-label={description}>{franchiseId}</span>
 {/if}
</span>

<style>
 .team-mark { display: inline-grid; place-items: center; flex: 0 0 3.5rem; width: 3.5rem; height: 3.5rem; padding: .45rem; background: oklch(from var(--team-color) 96% .008 h); border-radius: .3rem; vertical-align: middle; }
 img { display: block; width: 100%; height: 100%; object-fit: contain; }
 .abbreviation { color: oklch(25% .01 240); font-weight: 800; font-size: .85rem; letter-spacing: -.04em; }
 .small { width: 2rem; height: 2rem; flex-basis: 2rem; padding: .2rem; }
 .small .abbreviation { font-size: .65rem; }
 .large { width: 6.5rem; height: 6.5rem; flex-basis: 6.5rem; padding: .8rem; }
</style>
