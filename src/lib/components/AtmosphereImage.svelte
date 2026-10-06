<script lang="ts">
 import { onMount } from 'svelte';
 import { compareId } from '../game/types.ts';
 import { loadMedia } from '../media/client.ts';
 import type { AtmospherePhoto, MediaManifest } from '../media/types.ts';

 let { id, franchiseId, compact = false }: { id?: string; franchiseId?: string; compact?: boolean } = $props();
 let media = $state.raw<MediaManifest | null>(null);
 let failedUrl = $state('');

 const photo = $derived.by((): AtmospherePhoto | null => {
  if (!media) return null;
  if (id) return media.atmosphere[id] ?? null;
  if (!franchiseId) return null;
  return Object.values(media.atmosphere)
   .filter(candidate => candidate.franchiseId === franchiseId)
   .sort((a, b) => compareId(a.id, b.id))[0] ?? null;
 });

 onMount(() => {
  let disposed = false;
  void loadMedia().then(value => { if (!disposed) media = value; }).catch(() => {});
  return () => { disposed = true; };
 });
</script>

{#if photo && photo.url !== failedUrl}
 <figure class:compact>
  <img
   src={photo.url}
   alt={photo.caption}
   width={photo.width}
   height={photo.height}
   loading="lazy"
   decoding="async"
   onerror={event => failedUrl = event.currentTarget.getAttribute('src') ?? ''}
  />
  <figcaption>
   <span>{photo.caption} · Photo {photo.year}</span>
   <a href={photo.sourceUrl} target="_blank" rel="noreferrer">Photo source</a>
  </figcaption>
 </figure>
{/if}

<style>
 figure { margin: 0; min-width: 0; overflow: hidden; background: oklch(23% .012 255); border: 1px solid var(--border); border-radius: var(--radius); }
 img { display: block; width: 100%; height: auto; max-height: 20rem; object-fit: cover; }
 figcaption { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem 1rem; padding: .55rem .75rem; color: var(--muted); font-size: var(--text-xs); line-height: 1.35; }
 figcaption span { min-width: 0; overflow-wrap: anywhere; }
 a { display: inline-flex; align-items: center; min-height: 2.75rem; }
 .compact img { max-height: 6rem; }
 .compact figcaption { padding: .35rem .55rem; }
</style>
