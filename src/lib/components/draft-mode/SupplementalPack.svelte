<script lang="ts">
 import { canSign, conditionAt, marketPrice } from '../../draft/chapter.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import type { Profile } from '../../game/types.ts';
 import { money, rolesLabel } from './format.ts';

 /**
  * A chapter market's condition and the player's supplemental pack: fresh cards at the condition's
  * prices, of which the player may sign one that fits under the cap. The price signed stays the salary.
  */
 let { run, revision, profiles, working, onSign }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>; working: boolean;
  onSign: (cardId: string) => void;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const condition = $derived(conditionAt(run.setup.seed, run.chapter));
 // The run mutates in place, so the pack re-reads it when `revision` moves.
 const pack = $derived.by(() => { void revision; return run.packs[human].map(id => run.pool.ledger.cards.get(id)!); });
 const signed = $derived.by(() => { void revision; return run.signed[human]; });
 const nameOf = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
</script>

<section class="pack" aria-labelledby="pack-heading">
 <h3 id="pack-heading">Supplemental pack</h3>
 <p class="condition"><strong>{condition.name}.</strong> {condition.detail}</p>
 <p class="note">Sign one card that fits under the cap; its price stays its salary. The worst record gets the best pack.</p>
 <ul aria-label="Pack cards">
  {#each pack as item (item.seasonId)}
   {@const price = marketPrice(run, item)}
   <li>
    <span class="who">{nameOf(item.seasonId)} <small>{item.year} · {rolesLabel(item)}{price !== item.salary ? ` · sheet ${money(item.salary)}` : ''}</small></span>
    <span class="money">{money(price)}</span>
    {#if signed === item.seasonId}<span class="done">Signed</span>
    {:else}<button type="button" class="quiet sign" disabled={working || !canSign(run, human, item.seasonId)} aria-label={`Sign ${nameOf(item.seasonId)}`} onclick={() => onSign(item.seasonId)}>Sign</button>{/if}
   </li>
  {/each}
 </ul>
</section>

<style>
 .pack { display: grid; gap: var(--space-2); min-width: 0; }
 h3 { margin: 0; font-size: var(--text-lg); }
 p { margin: 0; font-size: var(--text-sm); }
 .condition strong { color: var(--accent); }
 .note { color: var(--muted); }
 ul { margin: var(--space-1) 0 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
 li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-1) 0; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
 small { display: block; color: var(--muted); font-size: var(--text-xs); }
 .money { color: var(--muted); font-variant-numeric: tabular-nums; }
 .sign { min-height: 2.25rem; padding-inline: var(--space-3); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: var(--text-xs); }
 .done { color: var(--success); font-size: var(--text-xs); font-weight: 700; }
</style>
