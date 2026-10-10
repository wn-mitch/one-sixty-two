<script lang="ts">
 import type { Manifest } from '#lib/game/types.ts';
 import StadiumCard from './StadiumCard.svelte';

 let { manifest, busy, onSelect }: { manifest: Manifest; busy: boolean; onSelect: (stadiumId: string) => void } = $props();
 let selected = $state('');
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
      <StadiumCard {stadium} franchiseName={franchiseName(stadium.franchiseId)} />
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
 .choice { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2); align-items: start; padding: var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; min-width: 0; }
 .choice:hover { background: var(--surface-raised); }
 .choice.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
 .choice:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 4px; }
 input { margin: 4px 0 0; width: 18px; height: 18px; accent-color: var(--accent); }
 input:focus-visible { outline: none; }
 @media (max-width: 26rem) { .choice { grid-template-columns: minmax(0, 1fr); } input { position: absolute; top: var(--space-3); right: var(--space-3); } }
 .commit { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0; background: var(--background); border-top: 1px solid var(--border); margin-top: var(--space-4); }
 .commit p { margin: 0; }
</style>
