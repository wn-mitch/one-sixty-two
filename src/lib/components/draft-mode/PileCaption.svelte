<script lang="ts">
 import { materialFor } from '../../cards/finish.ts';
 import type { DraftCard } from '../../draft/types.ts';
 import { money } from './format.ts';

 /** A pile card's salary and dealt finish, warning when taking it would put the payroll over the cap. */
 let { card, room }: { card: DraftCard; room: number } = $props();
 const over = $derived(card.salary > room);
</script>

<p class="pile-caption" class:over>
 <span class="salary">{money(card.salary)}</span>
 <span class="finish">{materialFor(card.finish).label}</span>
 {#if over}<span class="warning">{money(card.salary - Math.max(0, room))} over the cap</span>{/if}
</p>

<style>
 .pile-caption { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); margin: 0; color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .salary { color: var(--text); font-weight: 700; }
 .warning { flex-basis: 100%; color: var(--error); font-weight: 650; }
</style>
