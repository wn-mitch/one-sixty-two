<script lang="ts">
 import { onMount } from 'svelte';
 import { loadMedia } from '../media/client.ts';
 import type { MediaAsset, MediaManifest } from '../media/types.ts';
 import { photoLabel } from '../media/photo-policy.ts';
 import { compareId } from '../game/types.ts';
 let media = $state.raw<MediaManifest | null>(null);
 let loading = $state(true);
 let error = $state('');
 let query = $state('');
 let page = $state(0);
 let request = 0;
 let failedPreviews = $state<Record<string, boolean>>({});
 type Credit = {
  key: string;
  label: string;
  asset: MediaAsset;
  captureEvidenceUrl?: string;
  identityEvidenceUrl?: string;
  rightsEvidenceUrl?: string;
 };
 const rows = $derived.by(() => {
  if (!media) return [] as Credit[];
  const entries: Credit[] = [];
  for (const [id, team] of Object.entries(media.teams)) {
   if (team.logo) entries.push({ key: `${id}:current`, label: `${team.name}: current franchise mark`, asset: team.logo });
   team.historical.forEach((asset, index) => entries.push({ key: `${id}:historical:${index}`, label: `${team.name}: ${asset.firstYear}–${asset.lastYear} mark`, asset }));
  }
  for (const [id, player] of Object.entries(media.players)) {
   player.photos.forEach((asset, index) => entries.push({
    key: `${id}:photo:${index}`,
    label: `${player.name}: ${photoLabel(asset)}`,
    asset,
    captureEvidenceUrl: asset.captureEvidenceUrl,
    identityEvidenceUrl: asset.identityEvidenceUrl,
    rightsEvidenceUrl: asset.evidence?.rightsUrl
   }));
  }
  for (const [id, asset] of Object.entries(media.atmosphere)) {
   const team = media.teams[asset.franchiseId];
   const owner = team?.name ?? asset.franchiseId;
   entries.push({ key: `${id}:atmosphere`, label: `${asset.caption}: ${owner} atmosphere photo ${asset.year}`, asset });
  }
  return entries.sort((a, b) => compareId(a.label, b.label) || compareId(a.key, b.key));
 });
 const matches = $derived.by(() => {
  const needle = query.trim().toLowerCase();
  return needle ? rows.filter(row => [
   row.label,
   row.asset.credit,
   row.asset.license,
   row.asset.sourceUrl,
   row.captureEvidenceUrl,
   row.identityEvidenceUrl
  ].filter(Boolean).join(' ').toLowerCase().includes(needle)) : rows;
 });
 const pages = $derived(Math.max(1, Math.ceil(matches.length / 20)));
 const currentPage = $derived(Math.min(page, pages - 1));
 const visible = $derived(matches.slice(currentPage * 20, (currentPage + 1) * 20));
 async function load(): Promise<void> {
  const current = ++request;
  loading = true; error = '';
  try { const value = await loadMedia(); if (current === request) media = value; }
  catch (caught) { if (current === request) error = caught instanceof Error ? caught.message : 'Image credits are unavailable.'; }
  finally { if (current === request) loading = false; }
 }
 onMount(() => { void load(); return () => { request++; }; });
</script>

<div class="image-credits" aria-busy={loading}>
 <p>Reviewed portraits prefer an MLB playing photo from the card’s decade, then another MLB playing photo, a minor-league photo, another baseball playing uniform, and finally a later coaching or old-timers uniform. Within each group, the nearest evidenced date wins, followed by the matching team and image quality. Approximate and unknown dates are labelled. Previously published career photos remain available while their uniform classifications are reviewed.</p>
 <p>Atmosphere photographs are context only. Stadium cards show a photo of each franchise's current park, sometimes taken before later renovations or renaming; photos never affect the simulation. Marks without a verified historical year range are labelled as current franchise marks.</p>
 <p>Image copyright licences are separate from the statistical-data licence and do not grant trademark, privacy, publicity, or likeness rights. All club marks identify actual franchises in this game and its season share images. Some reviewed marks rely on an asserted fair-use basis; their copyright disclosure is not a reuse licence or established permission. This game is not affiliated with or endorsed by the clubs or league.</p>
 <p>Display files are auto-oriented, stripped of metadata, resized, and re-encoded as WebP. Portraits may be cropped to fit the layout. Source files, creator credits, licences or rights disclosures, and available evidence are linked below. Portraits and atmosphere photographs require documented reusable sources.</p>
 {#if loading}
  <p class="muted" role="status">Loading image provenance…</p>
 {:else if error}
  <p class="error" role="alert">{error}</p>
  <button class="secondary" onclick={() => void load()}>Retry image credits</button>
 {:else if media}
  <p class="coverage">{media.diagnostics.logos} current marks · {media.diagnostics.historicalLogos} historical marks · {media.diagnostics.photos} verified player photos covering {media.diagnostics.playersWithPhotos} of {media.diagnostics.playersSearched} players searched · {media.diagnostics.atmospherePhotos} atmosphere photos</p>
  <a class="button secondary" href={`/media/${media.version}/manifest.json`} download>Download full image credits</a>
  <label for="credit-search">Find an image, player, team, park, or photographer</label>
  <input id="credit-search" type="search" bind:value={query} oninput={() => page = 0} placeholder="Search image credits" />
  <p class="muted" role="status">{matches.length} credited images · Page {currentPage + 1} of {pages}</p>
  {#if !matches.length}<p>No image credits match this search.</p>{/if}
  <ul class="credit-list">
   {#each visible as row (row.key)}
    <li>
     {#if failedPreviews[row.asset.url]}
      <span class="preview-unavailable">Preview unavailable</span>
     {:else}
      <img src={row.asset.url} alt="" width={row.asset.width} height={row.asset.height} loading="lazy" decoding="async" onerror={() => failedPreviews[row.asset.url] = true} />
     {/if}
     <div>
      <h3>{row.label}</h3>
      <p>{row.asset.credit}</p>
      <div class="credit-links">
       <a href={row.asset.sourceUrl} target="_blank" rel="noreferrer">Original source</a>
       <a href={row.asset.licenseUrl} rel="license noreferrer" target="_blank">{row.asset.license}</a>
       {#if row.captureEvidenceUrl}<a href={row.captureEvidenceUrl} target="_blank" rel="noreferrer">Capture-date evidence</a>{/if}
       {#if row.identityEvidenceUrl}<a href={row.identityEvidenceUrl} target="_blank" rel="noreferrer">Player-identity evidence</a>{/if}
       {#if row.rightsEvidenceUrl}<a href={row.rightsEvidenceUrl} target="_blank" rel="noreferrer">Underlying rights evidence</a>{/if}
      </div>
     </div>
    </li>
   {/each}
  </ul>
  {#if pages > 1}
   <nav class="credit-pagination" aria-label="Image credit pages"><button class="secondary" disabled={currentPage === 0} onclick={() => page = currentPage - 1}>Previous credits</button><span>{currentPage + 1} / {pages}</span><button class="secondary" disabled={currentPage === pages - 1} onclick={() => page = currentPage + 1}>Next credits</button></nav>
  {/if}
 {/if}
</div>

<style>
 .image-credits { min-width: 0; }
 .coverage { font-weight: 650; }
 label { display: block; margin: 1.5rem 0 .5rem; font-weight: 650; }
 input { width: 100%; }
 .credit-list { list-style: none; padding: 0; margin: 1rem 0; }
 li { display: grid; grid-template-columns: 4rem minmax(0, 1fr); gap: 1rem; padding: 1rem 0; border-bottom: 1px solid var(--border); }
 li img, .preview-unavailable { width: 4rem; height: 5rem; background: var(--surface-raised); border-radius: .2rem; }
 li img { object-fit: contain; }
 .preview-unavailable { display: grid; place-items: center; padding: .25rem; color: var(--muted); font-size: .7rem; text-align: center; }
 h3 { font-size: 1rem; line-height: 1.35; }
 li p { margin: .35rem 0; color: var(--muted); overflow-wrap: anywhere; font-size: .875rem; }
 .credit-links { display: flex; flex-wrap: wrap; gap: .25rem 1rem; }
 .credit-links a { display: inline-flex; align-items: center; min-height: 44px; font-size: .875rem; overflow-wrap: anywhere; }
 .credit-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
</style>
