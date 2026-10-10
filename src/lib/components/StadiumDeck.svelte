<script lang="ts">
 import { untrack } from 'svelte';
 import type { Manifest } from '#lib/game/types.ts';
 import VenueCard from './VenueCard.svelte';

 let { manifest, busy, initialSelected = '', onSelect }: { manifest: Manifest; busy: boolean; initialSelected?: string; onSelect: (stadiumId: string) => void } = $props();
 let selected = $state(untrack(() => initialSelected));
 const franchiseName = (id: string) => manifest.franchises.find(franchise => franchise.id === id)?.name ?? id;
 const stadiums = $derived([...manifest.stadiums].sort((a, b) => a.name.localeCompare(b.name)));
 const chosen = $derived(stadiums.find(stadium => stadium.ref.id === selected));
</script>

<section class="stadium-deck" aria-labelledby="stadium-heading">
 <h2 id="stadium-heading" tabindex="-1">Choose your home stadium</h2>
 <p class="intro muted">You play 81 home games here; road games use each opponent's 2025 park. Fences, wall heights and elevation change how far every batted ball carries.</p>
 <form onsubmit={event => { event.preventDefault(); if (selected) onSelect(selected); }}>
  <fieldset>
   <legend class="sr-only">Home stadium</legend>
   <div class="grid">
    {#each stadiums as stadium (stadium.ref.id)}
     <label class="choice" class:selected={selected === stadium.ref.id}>
      <input type="radio" name="stadium" value={stadium.ref.id} bind:group={selected} disabled={busy} />
      <VenueCard {stadium} franchiseName={franchiseName(stadium.franchiseId)} />
     </label>
    {/each}
   </div>
  </fieldset>
  <div class="commit">
   <p class="muted" aria-live="polite">{chosen ? chosen.name : 'No stadium selected'}</p>
   <button class="primary" type="submit" disabled={busy || !selected}>Draft at this stadium</button>
  </div>
 </form>
</section>

<style>
 .stadium-deck { display: grid; gap: var(--space-4); padding-bottom: var(--space-16); }
 h2 { margin: 0; font-size: var(--text-2xl); }
 .intro { margin: 0; max-width: 68ch; }
 fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
 .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
 @media (min-width: 48rem) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
 @media (min-width: 72rem) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
 .grid { gap: var(--space-5) var(--space-4); }
 .choice { position: relative; display: block; min-width: 0; border-radius: calc(var(--radius-lg) + 4px); cursor: pointer; transition: transform 180ms var(--ease-out); }
 .choice:hover { transform: translateY(-2px); }
 .choice.selected { outline: 3px solid var(--accent); outline-offset: 4px; }
 .choice.selected::after { content: 'Selected'; position: absolute; top: -.6rem; left: .75rem; padding: .1rem .5rem; border-radius: var(--radius); color: var(--background); background: var(--accent); font-size: var(--text-xs); font-weight: 750; letter-spacing: .04em; }
 .choice:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 4px; }
 input { position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0; pointer-events: none; }
 .commit { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0; background: var(--background); border-top: 1px solid var(--border); margin-top: var(--space-4); }
 .commit p { margin: 0; }
</style>
