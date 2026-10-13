<script lang="ts">
 import Skeleton from './Skeleton.svelte';
</script>

{#snippet rows(count: number, kind: string)}
 <div class="order {kind}">
  {#each { length: count } as _}
   <div class="row">
    <span class="sk number"></span><span class="sk sk-card"></span>
    <span class="identity"><span class="sk-line" style:--sk-width="9rem"></span><span class="sk-line small" style:--sk-width="3rem"></span></span>
    <span class="meta"><span class="sk select"></span><span class="sk stats"></span></span>
    <span class="move"><span class="sk"></span><span class="sk"></span></span>
   </div>
  {/each}
 </div>
{/snippet}

{#snippet workload(lines: number)}
 <!-- Phones wrap each note onto one more line. -->
 <div class="workload">{#each { length: lines + 1 } as _, index}<span class="sk-line" class:narrow={index === lines} style:--sk-width={index >= lines - 1 ? '55%' : '100%'}></span>{/each}</div>
{/snippet}

<!-- Mirrors Lineup: the header, batting order beside the rotation and relief, and the sticky Simulate bar. -->
<Skeleton label="Loading the lineup…">
 <div class="lineup-skeleton">
  <div class="header">
   <span class="sk-line heading" style:--sk-width="13rem"></span>
   <div class="intro"><span class="sk-line"></span><span class="sk-line" style:--sk-width="40%"></span></div>
  </div>
  <div class="columns">
   <div class="column">
    <div class="section-heading"><span class="sk-line" style:--sk-width="8rem"></span><span class="sk smart"></span></div>
    {@render rows(9, 'batting')}
    {@render workload(4)}
   </div>
   <div class="column">
    <div class="section-heading"><span class="sk-line" style:--sk-width="10rem"></span><span class="sk smart"></span></div>
    {@render rows(3, 'starter')}
    {@render workload(3)}
    <div class="section-heading relief"><span class="sk-line" style:--sk-width="4rem"></span><span class="sk smart"></span></div>
    {@render rows(4, 'relief')}
    {@render workload(4)}
   </div>
  </div>
  <div class="simulate"><span class="sk button"></span></div>
 </div>
</Skeleton>

<style>
 .lineup-skeleton { min-width: 0; }
 .header { margin-block: var(--space-6) var(--space-8); }
 .heading { margin-bottom: var(--space-2); font-size: var(--text-2xl); line-height: 1.15; }
 .intro { max-width: 60ch; font-size: var(--text-sm); line-height: 1.5; }
 .columns { display: grid; gap: var(--space-8); }
 .column { min-width: 0; }
 .section-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-lg); line-height: 1.15; }
 .section-heading .sk-line { flex: 0 1 10rem; }
 .relief { margin-top: var(--space-8); }
 .smart { flex: none; width: 8.5rem; height: 2.5rem; }
 .order { display: grid; gap: var(--space-2); padding-top: var(--space-3); container-type: inline-size; }
 /* Rows keep the loaded heights: phones wrap each batter's stats under the name; pitchers carry a role line. */
 .row { display: grid; grid-template-columns: 3.25rem 56px minmax(0, 1fr) 2.75rem; grid-template-areas: 'num card identity move' 'num card meta move'; align-items: center; gap: var(--space-1) var(--space-3); box-sizing: border-box; height: 144.2px; padding: var(--space-2) var(--space-2) var(--space-2) 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
 .starter .row { height: 106px; }
 .order.relief .row { height: 191.2px; }
 .number { grid-area: num; justify-self: center; width: 1.5rem; height: 1.5rem; }
 .row > .sk-card { grid-area: card; }
 .identity { grid-area: identity; align-self: end; min-width: 0; font-size: var(--text-sm); line-height: 1.4; }
 .identity .small { font-size: var(--text-xs); }
 .meta { grid-area: meta; align-self: start; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); min-width: 0; }
 .select { width: 5.5rem; height: 2.75rem; }
 .stats { width: 9rem; max-width: 100%; height: 2rem; }
 .move { grid-area: move; display: grid; gap: var(--space-2); }
 .move .sk { width: 1.25rem; height: 1.25rem; justify-self: center; }
 .workload { max-width: 60ch; margin-top: var(--space-2); font-size: var(--text-xs); line-height: 1.5; }
 .narrow { display: none; }
 @media (max-width: 30rem) { .narrow { display: flex; } }
 .simulate { position: sticky; bottom: 0; z-index: 1; margin-top: var(--space-8); padding-block: var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--background); }
 .button { width: 100%; height: 2.75rem; }
 @container (min-width: 40rem) {
  .row { grid-template-columns: 3.25rem 56px minmax(0, 1fr) auto 5.5rem; grid-template-areas: 'num card identity meta move'; }
  .batting .row { height: 96.4px; }
  .identity, .meta { align-self: center; }
  .meta { flex-wrap: nowrap; }
  .move { grid-template-columns: 1fr 1fr; }
 }
 @media (max-width: 23.99rem) { .row { grid-template-columns: 2.75rem 56px minmax(0, 1fr) 2.75rem; column-gap: var(--space-2); } }
 @media (min-width: 64rem) { .columns { grid-template-columns: 1.35fr 1fr; gap: var(--space-12); } .button { width: 16rem; } }
</style>
