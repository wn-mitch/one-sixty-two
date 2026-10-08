<script lang="ts">
 import { tick } from 'svelte';
 import InspectionBack from './InspectionBack.svelte';
 import Supplemental from './Supplemental.svelte';
 import type { CardViewModel } from './view-model.ts';
 let { s }: { s: CardViewModel } = $props();
 const uid = $props.id();
 const seasonKey = $derived(s.details.sections.flatMap(section => section.rows).find(row => row.k === 'Season ID')?.v ?? `${s.full}:${s.year}:${s.team}`);
 let inspectedKey = $state('');
 let textOpen = $state(false);
 let detailsOpen = $state(false);
 let details = $state<HTMLDivElement>();
 $effect(() => {
  if (inspectedKey !== seasonKey) {
   inspectedKey = seasonKey;
   textOpen = false;
   detailsOpen = false;
  }
 });
 export async function showDetails(): Promise<void> {
  detailsOpen = true;
  await tick();
  details?.focus({ preventScroll: true });
  details?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
 }
</script>

<div class="card-details">
 <div class="disclosure-controls">
  <button type="button" aria-expanded={textOpen} aria-controls="{uid}-text" onclick={() => textOpen = !textOpen}>Text version</button>
  <button type="button" aria-expanded={detailsOpen} aria-controls="{uid}-details" onclick={showDetails}>Details</button>
 </div>
 {#if textOpen}<div id="{uid}-text"><InspectionBack {s} onDetails={showDetails} /></div>{/if}
 {#if detailsOpen}<div bind:this={details} id="{uid}-details" class="details" tabindex="-1"><Supplemental details={s.details} /></div>{/if}
</div>

<style>
 .card-details { width: 100%; min-width: 0; margin-top: 1rem; }
 .disclosure-controls { display: flex; flex-wrap: wrap; gap: .75rem; margin-bottom: 1rem; }
 button { min-height: 44px; }
 .details { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); outline: none; }
</style>
