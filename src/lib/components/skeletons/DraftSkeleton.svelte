<script lang="ts">
 import { FIELD } from '../field-layout.ts';
 import { SLOTS } from '../../game/types.ts';
 import { boardWide } from './board.ts';
 import PoolSkeleton from './PoolSkeleton.svelte';
 import Skeleton from './Skeleton.svelte';

 /**
  * The draft board's shape: the header with the franchise chip and pick counter (a sticky toolbar on phones),
  * the sealed pack or the player pool, and on wide screens the Your field panel with an outline for every slot.
  */
 let { pool = false }: { pool?: boolean } = $props();
 const wide = $derived(boardWide.current);
 const slots = SLOTS.map(slot => {
  const point = FIELD.slots[slot];
  // Staff cards are wider than fielders; both are drawn around the center of the card's artwork.
  const width = point.y > FIELD.staffPlate.y ? 92 : FIELD.card * 8 / 7;
  return { x: point.x - width / 2, y: point.y - FIELD.card * .7, width };
 });
 const stadiumWidth = FIELD.card * 8 / 7;
</script>

<Skeleton label="Loading the draft…">
 <div class="draft-skeleton" class:wide class:pool>
  {#if wide}
   <div class="draft-header">
    <span class="sk wordmark"></span>
    {#if pool}
     <!-- A rolled franchise: its mark and name, the extra-pack button and the pick counter. -->
     <span class="chip"><span class="sk mark"></span><span class="chip-copy"><span class="sk-line" style:--sk-width="9rem"></span><span class="sk-line small" style:--sk-width="6rem"></span></span></span>
     <span class="sk control" style:width="124px"></span>
     <span class="sk-line pick" style:--sk-width="5.5rem"></span>
    {:else}
     <!-- Before the roll the counter leads and the empty chip holds the franchise's place. -->
     <span class="sk-line pick" style:--sk-width="5.5rem"></span>
     <span class="sk-line chip-line" style:--sk-width="11rem"></span>
    {/if}
    <span class="sk-line link rules" style:--sk-width="5.75rem"></span>
    <span class="sk-line link" style:--sk-width="3.5rem"></span>
    <span class="sk control" style:width="78px"></span>
   </div>
  {:else}
   <div class="draft-toolbar">
    <span class="sk reveal"></span>
    {#if pool}<span class="sk control reroll" style:width="134px"></span>{/if}
    <span class="sk control" style:width="96px"></span><span class="sk control" style:width="48px"></span>
   </div>
  {/if}
  <div class="board-columns">
   <div class="draft-browser">
    {#if pool}
     <PoolSkeleton {wide} />
    {:else}
     <div class="pack-area">
      <div class="stage"><span class="sk pack"></span><span class="sk-outline ghost"></span></div>
      <span class="caption"></span>
     </div>
    {/if}
   </div>
   {#if wide}
    <div class="sk-panel field-panel">
     <div class="field-title"><span class="sk-line heading" style:--sk-width="6.3rem"></span><span class="pick-track">{#each slots as _}<span></span>{/each}</span><span class="sk-line count" style:--sk-width="2rem"></span></div>
     <div class="field-scroll">
      <div class="field-card" style:aspect-ratio="{FIELD.width} / {FIELD.height}">
       <span class="sk face"></span>
       <svg viewBox="0 0 {FIELD.width} {FIELD.height}" aria-hidden="true" focusable="false">
        <rect class="plate" x={FIELD.window.x} y={FIELD.window.y} width={FIELD.window.width} height={FIELD.window.height} rx="6"></rect>
        <rect class="plate" x={FIELD.window.x} y={FIELD.staffPlate.y} width={FIELD.window.width} height={FIELD.staffPlate.height} rx="6"></rect>
        <rect class="slot" x={FIELD.stadium.x - stadiumWidth / 2} y={FIELD.stadium.y - FIELD.card * .7} width={stadiumWidth} height={FIELD.card * 1.82} rx="4"></rect>
        {#each slots as slot}<rect class="slot" x={slot.x} y={slot.y} width={slot.width} height={FIELD.card * 1.4} rx="4"></rect>{/each}
       </svg>
      </div>
     </div>
    </div>
   {/if}
  </div>
 </div>
</Skeleton>

<style>
 .draft-skeleton { min-width: 0; }
 /* Phones: the roll bar, Field and New draft share one sticky row above the pack or pool. */
 .draft-toolbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: .5rem; padding-block: .5rem; background: var(--background); }
 .reveal { flex: 1; height: 48px; }
 /* With a roll showing, the pool gives its identity a row and the reroll, field and menu controls share the next. */
 .pool .draft-toolbar { flex-wrap: wrap; }
 .pool .draft-toolbar .reveal { flex: 1 1 100%; }
 .draft-toolbar .reroll { margin-right: auto; }
 .control { flex: none; height: 44px; }
 .draft-toolbar .control { height: 48px; }
 .board-columns { display: grid; min-width: 0; }
 .draft-browser { min-width: 0; }

 .wide .board-columns { grid-template-columns: minmax(0, 1fr) 452px; gap: 28px; align-items: start; padding-top: 16px; }
 .draft-header { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 20px; min-height: 64px; box-sizing: border-box; padding-block: 10px; border-bottom: 1px solid var(--border); background: var(--background); }
 .wordmark { flex: none; width: 78px; height: 44px; }
 .chip { flex: 0 1 17.5rem; display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
 .mark { flex: none; width: 44px; height: 44px; border-radius: 50%; }
 .chip-copy { flex: 1; min-width: 0; font-size: var(--text-base); line-height: 1.25; }
 .chip-copy .small { font-size: var(--text-xs); }
 .pick { flex: 0 0 5.5rem; font-size: var(--text-xs); }
 .chip-line { flex: 0 0 11rem; font-size: 1.25rem; }
 .link { flex: 0 0 auto; width: var(--sk-width); font-size: var(--text-sm); }
 .rules { margin-left: auto; }

 /* The sealed pack waits where FoilPack deals it, with an outline where the extra-pack ghost will open. */
 .pack-area { --stage-width: min(11.5rem, 52vw); display: grid; justify-items: center; gap: var(--space-3); padding-block: calc(var(--stage-width) * 7.4 / 5 * .62 + var(--space-4)) var(--space-8); overflow-x: clip; }
 @media (max-width: 47.999rem) { .pack-area { padding-block: var(--space-6); } }
 .stage { position: relative; width: var(--stage-width); aspect-ratio: 5 / 7.4; }
 .pack { width: 100%; height: 100%; border-radius: .35rem; }
 .ghost { position: absolute; top: 50%; left: calc(100% + var(--space-8)); width: 92%; aspect-ratio: 5 / 7; translate: 0 -50%; border-radius: .3rem; opacity: .7; }
 .caption { height: calc(var(--text-sm) * 1.5); }

 /* Your field: the panel header with its pick track, then the field card with every slot outlined. */
 .field-panel { position: sticky; top: 72px; display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: calc(100dvh - 88px); min-width: 0; overflow: hidden; }
 .field-title { display: flex; align-items: center; gap: .75rem; padding: 1rem 1rem .5rem; }
 .heading { flex: none; width: 6.3rem; font-size: 1.5rem; line-height: 1; }
 .pick-track { display: flex; flex: 1; gap: 3px; }
 .pick-track span { flex: 1; height: 4px; background: var(--border); }
 .count { flex: none; width: 2rem; font-size: .75rem; line-height: 1.2; }
 .field-scroll { min-height: 0; overflow-y: auto; scrollbar-gutter: stable; padding: 0 1rem 1rem; }
 .field-card { position: relative; container-type: inline-size; width: min(100%, 30rem); margin: 0 auto var(--space-2); }
 .face { position: absolute; inset: 0; border-radius: calc(100cqi * 14 / 424); }
 svg { position: absolute; inset: 0; width: 100%; height: 100%; }
 .plate { fill: color-mix(in oklch, var(--background) 45%, transparent); }
 .slot { fill: none; stroke: var(--border); stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
</style>
