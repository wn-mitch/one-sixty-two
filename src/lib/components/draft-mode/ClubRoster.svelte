<script lang="ts">
 import type { Snippet } from 'svelte';
 import { arrangeRoster } from '../../draft/legality.ts';
 import type { DraftCard, DraftSlot } from '../../draft/types.ts';
 import type { Profile } from '../../game/types.ts';
 import { money, rolesLabel } from './format.ts';

 /** A club's cards placed by the best legal arrangement: active slots, reserves, then cards with no place. */
 let { cards, profiles, open = true, action }: {
  cards: readonly DraftCard[]; profiles: ReadonlyMap<string, Profile>; open?: boolean;
  action?: Snippet<[DraftCard]>;
 } = $props();
 const arrangement = $derived(arrangeRoster(cards));
 const byId = $derived(new Map(cards.map(card => [card.seasonId, card])));
 const rows = $derived([
  ...Object.entries(arrangement.active).map(([slot, id]) => ({ label: slot, card: byId.get(id!)! })),
  ...arrangement.reserves.map(id => ({ label: 'Res', card: byId.get(id)! })),
  ...arrangement.surplus.map(id => ({ label: 'Extra', card: byId.get(id)! }))
 ]);
 const missing = $derived(arrangement.open.filter((row): row is DraftSlot => row !== null));
 const openReserves = $derived(arrangement.open.filter(row => row === null).length);
</script>

<ul class="roster">
 {#each rows as row (row.card.seasonId)}
  <li class:extra={row.label === 'Extra'}>
   <span class="slot">{row.label}</span>
   <span class="who">{profiles.get(row.card.seasonId)?.displayName ?? row.card.playerId} <small>{row.card.year} · {rolesLabel(row.card)}</small></span>
   <span class="salary">{money(row.card.salary)}</span>
   {#if action}{@render action(row.card)}{/if}
  </li>
 {/each}
 {#if open}
  {#each missing as slot (slot)}<li class="missing"><span class="slot">{slot}</span><span class="who">Missing</span></li>{/each}
  {#each { length: openReserves } as _, index (index)}<li class="missing"><span class="slot">Res</span><span class="who">Open reserve</span></li>{/each}
 {/if}
</ul>

<style>
 .roster { list-style: none; margin: 0; padding: 0; display: grid; }
 li { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-2); min-height: 2.5rem; padding: var(--space-1) 0; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); }
 .slot { color: var(--muted); font-size: var(--text-xs); font-weight: 700; }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
 small { display: block; color: var(--muted); font-size: var(--text-xs); }
 .salary { font-variant-numeric: tabular-nums; }
 .missing .who { color: var(--error); }
 .extra .slot { color: var(--error); }
</style>
