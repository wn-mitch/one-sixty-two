<script lang="ts">
 import { onMount } from 'svelte';
 import { loadMedia, selectPhoto } from '../media/client.ts';
 import type { MediaManifest } from '../media/types.ts';
 let { playerId, year, name = 'Player', size = 'medium', credits = true }: {
  playerId: string; year: number; name?: string; size?: 'small' | 'medium' | 'large'; credits?: boolean;
 } = $props();
 let media = $state.raw<MediaManifest | null>(null);
 let settled = $state(false);
 let failedUrl = $state('');
 let loadedUrl = $state('');
 let unavailable = $state(false);
 const photo = $derived(selectPhoto(media, playerId, year));
 const visible = $derived(photo && photo.url !== failedUrl);
 const ready = $derived(visible && photo?.url === loadedUrl);
 onMount(() => {
  let disposed = false;
  void loadMedia().then(value => { if (!disposed) media = value; }).catch(() => { if (!disposed) unavailable = true; }).finally(() => { if (!disposed) settled = true; });
  return () => { disposed = true; };
 });
</script>

<span class="portrait" class:small={size === 'small'} class:large={size === 'large'}>
 <span class="photo-frame" class:loading={!settled || (visible && !ready)}>
  {#if visible && photo}
   <img src={photo.url} alt={`${name}, photographed in ${photo.year}${photo.year !== year ? '; playing-career photo, not the drafted season' : ''}`} width={photo.width} height={photo.height} loading="lazy" decoding="async" onload={event => loadedUrl = event.currentTarget.getAttribute('src') ?? ''} onerror={event => failedUrl = event.currentTarget.getAttribute('src') ?? ''} />
  {:else}
   <svg viewBox="0 0 64 72" aria-hidden="true" fill="none"><path d="m22 10-13 8-6 16 12 5 3-7v30h28V32l3 7 12-5-6-16-13-8c-2 8-18 8-20 0Z"/><path d="M25 34h14M32 29v19"/></svg>
  {/if}
 </span>
 <span class="photo-date">{visible && photo ? ready ? `Photo ${photo.year}${photo.year === year ? '' : ' · career'}` : 'Loading photo' : settled ? unavailable ? 'Images unavailable' : failedUrl ? 'Photo unavailable' : 'No verified photo' : 'Loading photo'}</span>
 {#if visible && photo && credits}
  <a class="photo-credit" href={photo.sourceUrl} target="_blank" rel="noreferrer" title={`${photo.credit} · ${photo.license}`}>{photo.credit || 'Image source'} · {photo.license}</a>
 {/if}
</span>

<style>
 .portrait { display: inline-flex; flex-direction: column; gap: .25rem; width: 5.5rem; flex: 0 0 5.5rem; min-width: 0; vertical-align: middle; }
 .photo-frame { display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 5; overflow: hidden; background: var(--surface-raised); border-radius: .25rem; }
 img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }
 svg { width: 65%; max-height: 80%; stroke: var(--muted); stroke-width: 1.25; opacity: .6; }
 .photo-date { color: var(--muted); font-size: .75rem; line-height: 1.3; font-weight: 550; text-align: center; }
 .photo-credit { color: var(--muted); font-size: .75rem; line-height: 1.3; overflow-wrap: anywhere; min-height: 44px; display: flex; align-items: center; }
 .small { width: 3rem; flex-basis: 3rem; }
 .small .photo-date { font-size: .6875rem; }
 .large { width: 8rem; flex-basis: 8rem; }
 .loading { animation: breathe 1s ease-out infinite alternate; }
 @media (prefers-reduced-motion: reduce) { .loading { animation: none; } }
</style>
