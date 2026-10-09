<script lang="ts">
 import { tick } from 'svelte';
 import type { ResultsInspection } from '../game/results-types.ts';
 import Supplemental from './Supplemental.svelte';
 import type { CardViewModel } from './view-model.ts';

 let {
  s,
  inspection
 }: {
  s: CardViewModel;
  inspection?: ResultsInspection;
 } = $props();
 const uid = $props.id();
 const seasonKey = $derived(inspection?.seasonId ?? s.details.sections.flatMap(section => section.rows).find(row => row.k === 'Season ID')?.v ?? `${s.full}:${s.year}:${s.team}`);
 let inspectedKey = $state('');
 let detailsOpen = $state(false);
 let details = $state<HTMLDivElement>();

 $effect(() => {
  if (inspectedKey !== seasonKey) {
   inspectedKey = seasonKey;
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
  <button type="button" aria-expanded={detailsOpen} aria-controls="{uid}-details" onclick={showDetails}>{inspection ? 'Value details' : 'Details'}</button>
 </div>
 {#if detailsOpen}
  <div bind:this={details} id="{uid}-details" class="details" tabindex="-1">
   {#if inspection}
    <section class="result-details" aria-label="162-0 season value details">
     <h3>Season value details</h3>
     {#each inspection.details as section (section.key)}
      <section aria-labelledby="{uid}-{section.key}">
       <h4 id="{uid}-{section.key}">{section.label}</h4>
       <dl>
        {#each section.rows as row (row.key)}
         <div><dt>{row.label}</dt><dd>{row.formattedValue}</dd></div>
        {/each}
       </dl>
       <p>{section.note}</p>
      </section>
     {/each}
    </section>
    <Supplemental details={s.details} />
   {:else}
    <Supplemental details={s.details} />
   {/if}
  </div>
 {/if}
</div>

<style>
 .card-details { width: 100%; min-width: 0; margin-top: 1rem; }
 .disclosure-controls { display: flex; flex-wrap: wrap; gap: .75rem; margin-bottom: 1rem; }
 button { min-height: 44px; }
 .details { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); outline: none; }
 .result-details { color: var(--text); font: 1rem/1.5 system-ui, sans-serif; text-align: left; }
 .result-details h3 { margin: 0 0 1rem; font-size: 1.25rem; }
 .result-details h4 { margin: 0 0 .75rem; font-size: 1rem; }
 .result-details > section { padding-block: 1rem; border-top: 1px solid var(--border); }
 .result-details dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .75rem 1rem; margin: 0; }
 .result-details dl div { min-width: 0; }
 .result-details dt { color: var(--muted); font-size: .8rem; font-weight: 700; }
 .result-details dd { margin: .2rem 0 0; font-weight: 750; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
 .result-details p { max-width: 70ch; margin: .9rem 0 0; color: var(--muted); font-size: .9rem; }
</style>
