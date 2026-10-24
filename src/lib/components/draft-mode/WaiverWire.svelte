<script lang="ts">
 import { canClaim, waiverCards } from '../../draft/market.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import type { Profile } from '../../game/types.ts';
 import { money, rolesLabel } from './format.ts';

 /**
  * Cards released to waivers. The player marks the ones to claim; nothing moves until waivers close,
  * when every club claims in order, lowest drafted value first, one card per pass.
  */
 let { run, revision, profiles, clubName, working, onClaim }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>; clubName: (seat: number) => string; working: boolean;
  onClaim: (cardId: string, on: boolean) => void;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 // The run mutates in place, so the wire re-reads it when `revision` moves.
 const market = $derived.by(() => { void revision; const { priority, claims, releasedBy } = run.market!; return { priority: [...priority], claims: [...claims], releasedBy: new Map(releasedBy) }; });
 const cards = $derived.by(() => {
  void revision;
  return waiverCards(run).map(id => run.pool.ledger.cards.get(id)!).sort((a, b) => b.salary - a.salary);
 });
 const place = $derived(market.priority.indexOf(human) + 1);
 const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
 const nameOf = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
</script>

<section class="wire" aria-labelledby="waivers-heading">
 <h3 id="waivers-heading">Waivers</h3>
 <p class="note">You claim {ordinal(place)} of {market.priority.length}. Marked cards are claimed in the order you mark them while you can afford them; unclaimed cards leave for good.</p>
 {#if cards.length}
  <ul>
   {#each cards as item (item.seasonId)}
    {@const by = market.releasedBy.get(item.seasonId)}
    {@const order = market.claims.indexOf(item.seasonId)}
    <li>
     <span class="who">{nameOf(item.seasonId)} <small>{item.year} · {rolesLabel(item)} · released by {by === human ? 'you' : clubName(by!)}</small></span>
     <span class="money">{money(item.salary)}</span>
     {#if by !== human}
      <button type="button" class="quiet claim" aria-pressed={order >= 0} disabled={working || (order < 0 && !canClaim(run, human, item.seasonId))}
       aria-label={`${order >= 0 ? 'Unclaim' : 'Claim'} ${nameOf(item.seasonId)}`} onclick={() => onClaim(item.seasonId, order < 0)}>
       {order >= 0 ? `Claim #${order + 1}` : 'Claim'}
      </button>
     {/if}
    </li>
   {/each}
  </ul>
 {:else}<p class="note">No cards are on waivers.</p>{/if}
</section>

<style>
 .wire { display: grid; gap: var(--space-3); min-width: 0; }
 h3 { margin: 0; font-size: var(--text-lg); }
 .note { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 ul { margin: 0; padding: 0; list-style: none; max-height: 20rem; overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--border); }
 li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-1) 0; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
 small { display: block; color: var(--muted); font-size: var(--text-xs); }
 .money { color: var(--muted); font-variant-numeric: tabular-nums; }
 .claim { min-height: 2.25rem; padding-inline: var(--space-3); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: var(--text-xs); }
 .claim[aria-pressed='true'] { background: var(--accent); color: var(--background); }
</style>
