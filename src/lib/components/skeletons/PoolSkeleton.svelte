<script lang="ts">
 import { boardWide } from './board.ts';

 /**
  * The player pool's shape: CardBrowser's sort and filter rail beside or above a grid of card
  * placeholders, laid out with CandidateList's columns. `wide` follows the draft board; left unset, the
  * board's own wide media query decides. Without the rail it fills a browser whose controls are already real.
  */
 let { wide: wideOverride, rail = true }: { wide?: boolean; rail?: boolean } = $props();
 const wide = $derived(wideOverride ?? boardWide.current);
</script>

<div class="pool-skeleton" class:wide class:cards-only={!rail}>
 {#if rail}
 <div class="rail">
  <div class="sort-row"><span class="sk-line label" style:--sk-width="3.5rem"></span><span class="sk options"></span></div>
  <div class="filter-panel"><div class="legend"><span class="sk-line" style:--sk-width="80%"></span><span class="sk-line" style:--sk-width="50%"></span></div>{#each { length: 5 } as _}<span class="sk filter"></span>{/each}</div>
 </div>
 {/if}
 <div class="content">
  <div class="section-heading"><span class="sk-line" style:--sk-width="5.5rem"></span></div>
  <div class="card-grid">
   {#each { length: 12 } as _}
    <div class="card"><span class="sk sk-card"></span><span class="meta"><span class="sk-line"></span><span class="sk-line" style:--sk-width="60%"></span></span></div>
   {/each}
  </div>
 </div>
</div>

<style>
 .pool-skeleton, .rail, .content { min-width: 0; }
 /* Phones: the sort switch, then one swipeable row of position chips. */
 .sort-row { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); font-size: var(--text-sm); }
 .sort-row .label { flex: 0 0 3.5rem; }
 .options { flex: 1; height: 46px; }
 .filter-panel { display: flex; gap: var(--space-2); overflow: hidden; margin-bottom: var(--space-2); }
 .filter-panel .legend { display: none; }
 .filter { flex: none; width: 3.5rem; height: 2.75rem; }
 .section-heading { margin-block: var(--space-3); font-size: var(--text-lg); line-height: 1.15; }
 .card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 10px; align-items: start; }
 .card { display: grid; gap: 12px; width: 100%; max-width: 24rem; min-width: 0; margin-inline: auto; }
 /* The qualification caption under a phone card runs to two short lines. */
 .meta { display: block; font-size: var(--text-xs); line-height: 1.367; }
 @media (min-width: 30rem) and (max-width: 47.999rem) { .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
 @media (min-width: 48rem) and (max-width: 1099px) { .pool-skeleton:not(.wide) .card-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }

 /* The wide board: a sticky rail beside two or three columns of cards with the season controls under each. */
 .wide:not(.cards-only) { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 28px; align-items: start; }
 .wide .rail { position: sticky; top: 72px; padding: 0 .25rem .25rem; }
 .wide .sort-row { display: grid; gap: var(--space-2); margin-bottom: 20px; }
 .wide .sort-row .label { flex: none; }
 .wide .filter-panel { display: grid; overflow: visible; gap: 3px; margin-bottom: var(--space-2); font-size: var(--text-sm); }
 .wide .filter-panel .legend { display: block; margin-bottom: calc(var(--space-2) - 3px); }
 .wide .filter { width: auto; height: 44px; }
 .wide .section-heading { margin-block: calc(1rem + 1px) var(--space-3); font-size: 1.5rem; line-height: 1; }
 .wide .card-grid { gap: 28px 20px; }
 .wide .meta { display: flex; align-items: center; height: 44px; font-size: var(--text-sm); }
 .wide .meta .sk-line:last-child { display: none; }
 @media (min-width: 1360px) { .wide .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
