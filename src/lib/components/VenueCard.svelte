<script lang="ts" module>
 import { compareId } from '../game/types.ts';
 import type { AtmospherePhoto, MediaManifest } from '../media/types.ts';

 /** The ballpark photo printed on a franchise's stadium card: its first atmosphere photo by ID. */
 export function venuePhoto(media: MediaManifest | null, franchiseId: string): AtmospherePhoto | null {
  if (!media) return null;
  return Object.values(media.atmosphere)
   .filter(candidate => candidate.franchiseId === franchiseId)
   .sort((a, b) => compareId(a.id, b.id))[0] ?? null;
 }
</script>

<script lang="ts">
 import { onMount } from 'svelte';
 import { STOCK, roles } from '../cards/tokens.ts';
 import { loadMedia } from '../media/client.ts';
 import type { StadiumSummary } from '../sim/park-types.ts';
 import StadiumCard from './StadiumCard.svelte';
 import TeamLogo from './TeamLogo.svelte';

 /** A ballpark printed as a card: the park's photo on the front, its measured geometry on the back. */
 let { stadium, franchiseName, turned = $bindable(false) }: { stadium: StadiumSummary; franchiseName: string; turned?: boolean } = $props();
 let media = $state.raw<MediaManifest | null>(null);
 let failedUrl = $state('');

 const photo = $derived(venuePhoto(media, stadium.franchiseId));
 const teamColor = $derived(media?.teams[stadium.franchiseId]?.color);
 const palette = $derived(teamColor ? roles({ primary: teamColor, secondary: STOCK }) : null);
 const cardStyle = $derived(palette ? `--stock: ${palette.field}; --stock-ink: ${palette.onField};` : undefined);
 const distances = $derived(([['LF', -45], ['CF', 0], ['RF', 45]] as const).map(([label, bearing]) => ({
  label,
  feet: stadium.dimensions.find(item => item.bearingDeg === bearing)?.distanceFt
 })));

 onMount(() => {
  let disposed = false;
  void loadMedia().then(value => { if (!disposed) media = value; }).catch(() => {});
  return () => { disposed = true; };
 });
</script>

{#snippet flipIcon()}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>{/snippet}

<div class="venue-card" class:turned style={cardStyle}>
 <div class="flipper">
  <article class="face front" aria-label={`${stadium.name}, ${franchiseName}`} inert={turned}>
   <div class="photo">
    {#if photo && photo.url !== failedUrl}
     <img src={photo.url} alt={photo.caption} width={photo.width} height={photo.height} loading="lazy" decoding="async" onerror={event => failedUrl = event.currentTarget.getAttribute('src') ?? ''} />
    {:else}
     <span class="no-photo">No ballpark photo</span>
    {/if}
    <span class="year">{photo ? `Photo ${photo.year}` : stadium.referenceYear}</span>
   </div>
   <div class="nameplate">
    <TeamLogo franchiseId={stadium.franchiseId} label={franchiseName} size="small" />
    <div class="names">
     <h3>{stadium.name}</h3>
     <p>{franchiseName} · {stadium.referenceYear}</p>
    </div>
   </div>
   <dl class="stats">
    {#each distances as { label, feet } (label)}
     <div><dt>{label}</dt><dd>{feet === undefined ? '—' : Math.round(feet)}</dd></div>
    {/each}
   </dl>
   <button type="button" class="turn" aria-label={`Turn over: ${stadium.name} geometry`} onclick={() => turned = true}>{@render flipIcon()}</button>
  </article>
  <section class="face back" aria-label={`${stadium.name} geometry`} inert={!turned}>
   <h3 class="back-title">{stadium.name}</h3>
   <StadiumCard {stadium} {franchiseName} {photo} compact />
   <button type="button" class="turn" aria-label={`Turn over: ${stadium.name} photo`} onclick={() => turned = false}>{@render flipIcon()}</button>
  </section>
 </div>
</div>

<style>
 .venue-card { container-type: inline-size; aspect-ratio: 5 / 7; perspective: 1200px; }
 .flipper { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform var(--motion-field-flip) var(--ease-out); }
 .turned .flipper { transform: rotateY(180deg); }
 .face {
  position: absolute;
  inset: 0;
  display: grid;
  border-radius: calc(100cqi * 4 / 100);
  color: var(--stock-ink, var(--text));
  background: var(--stock, var(--surface-raised));
  backface-visibility: hidden;
  overflow: hidden;
 }
 .front {
  grid-template-rows: minmax(0, 1fr) auto auto;
  gap: calc(100cqi * 3 / 100);
  padding: calc(100cqi * 4 / 100);
  box-shadow: 0 .6rem 1.4rem oklch(8% .01 255 / .35);
 }
 .photo { position: relative; min-height: 0; overflow: hidden; border-radius: calc(100cqi * 2 / 100); background: repeating-linear-gradient(45deg, oklch(26% .02 255) 0 8px, oklch(30% .02 255) 8px 16px); }
 .photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
 .no-photo { position: absolute; inset: 0; display: grid; place-items: center; color: oklch(88% .01 255); font: 700 calc(100cqi * 5 / 100) / 1.1 'Barlow Condensed', sans-serif; letter-spacing: .06em; text-transform: uppercase; }
 .year { position: absolute; left: calc(100cqi * 2.5 / 100); bottom: calc(100cqi * 2.5 / 100); padding: .15em .45em; color: var(--stock-ink, var(--text)); background: var(--stock, var(--surface)); font: 800 calc(100cqi * 4 / 100) / 1 'Barlow Condensed', sans-serif; letter-spacing: .06em; text-transform: uppercase; }
 .nameplate { display: flex; align-items: center; gap: calc(100cqi * 3 / 100); min-width: 0; }
 .names { min-width: 0; }
 h3 { margin: 0; font: italic 900 calc(100cqi * 8.5 / 100) / .95 'Barlow Condensed', sans-serif; text-transform: uppercase; overflow-wrap: anywhere; }
 .names p { margin: calc(100cqi * 1 / 100) 0 0; font: 700 calc(100cqi * 4.2 / 100) / 1.1 'Barlow Condensed', sans-serif; letter-spacing: .05em; text-transform: uppercase; opacity: .85; }
 .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: calc(100cqi * 2 / 100); margin: 0; }
 .stats div { display: grid; padding: calc(100cqi * 1.5 / 100) calc(100cqi * 2.5 / 100); border-radius: calc(100cqi * 1.5 / 100); color: var(--text); background: oklch(17% .012 255 / .9); }
 dt { font: 700 calc(100cqi * 3.6 / 100) / 1 'Barlow Condensed', sans-serif; letter-spacing: .08em; color: var(--muted); }
 dd { margin: 0; font: 800 calc(100cqi * 8 / 100) / 1 'Barlow Condensed', sans-serif; font-variant-numeric: tabular-nums; }
 .turn {
  position: absolute;
  top: calc(100cqi * 5 / 100);
  right: calc(100cqi * 5 / 100);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--text);
  background: oklch(17% .012 255 / .72);
 }
 .turn:hover { background: oklch(24% .012 255 / .88); }
 .turn:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
 .back { align-content: center; gap: calc(100cqi * 3 / 100); padding: calc(100cqi * 4 / 100) calc(100cqi * 4 / 100) calc(100cqi * 4 / 100); transform: rotateY(180deg); overflow-y: auto; }
 .back :global(.stadium-card) { padding: calc(100cqi * 4 / 100); border-radius: calc(100cqi * 2 / 100); color: var(--text); background: var(--surface); }
 .back-title { padding-right: 48px; font-size: calc(100cqi * 7 / 100); }
 @media (prefers-reduced-motion: reduce) { .flipper { transition: none; } }
 :global([data-motion='off']) .venue-card .flipper { transition: none; }
</style>
