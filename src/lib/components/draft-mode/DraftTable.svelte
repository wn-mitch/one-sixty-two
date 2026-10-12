<script lang="ts">
 import CapBar from './CapBar.svelte';
 import ClubRoster from './ClubRoster.svelte';
 import DraftCardTile from './DraftCardTile.svelte';
 import { explainPick } from '../../draft/ai.ts';
 import { effectiveCap, picksPerSeat } from '../../draft/rules.ts';
 import { heldPile, ownedBy, type DraftRun } from '../../draft/run.ts';
 import type { CardMediaStatus } from '../../cards/view-model.ts';
 import type { Manifest, Profile } from '../../game/types.ts';
 import type { MediaManifest } from '../../media/types.ts';

 let { run, revision, profiles, manifest, media, mediaStatus, clubName, onPick }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>;
  manifest: Manifest | null; media: MediaManifest | null; mediaStatus: CardMediaStatus;
  clubName: (seat: number) => string; onPick: (cardId: string) => Promise<void>;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 let viewing = $state<number | null>(null);
 let picking = $state('');
 const pile = $derived.by(() => { void revision; return heldPile(run); });
 const payroll = (seat: number) => ownedBy(run, seat).reduce((sum, card) => sum + card.salary, 0);
 const cap = $derived(effectiveCap(run.budgets[human]));
 const humanPayroll = $derived.by(() => { void revision; return payroll(human); });
 const seat = $derived(viewing ?? human);
 const seatCards = $derived.by(() => { void revision; return ownedBy(run, seat); });
 const ticker = $derived.by(() => { void revision; return run.ticker.slice(-24).reverse(); });
 const nameOf = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;

 async function pick(cardId: string) {
  picking = cardId;
  try { await onPick(cardId); } finally { picking = ''; }
 }
</script>

<div class="table">
 <header class="status">
  <div>
   <h1>Pick {run.pick + 1} of {picksPerSeat(run.pool.rules)}</h1>
   <p>{[clubName(human), ...(run.seating.rival ? [`rival ${clubName(run.seating.seats.indexOf(run.seating.rival))}`] : []), 'piles pass left'].join(' · ')}</p>
  </div>
  <CapBar payroll={humanPayroll} {cap} />
 </header>

 <section class="pile" aria-labelledby="pile-heading">
  <h2 id="pile-heading">Your pile · {pile.length} cards</h2>
  <div class="grid">
   {#each pile as card (card.seasonId)}
    <DraftCardTile {card} profile={profiles.get(card.seasonId)} {manifest} {media} {mediaStatus}>
     {#snippet actions()}
      <button class="primary" disabled={picking !== ''} onclick={() => pick(card.seasonId)}>{picking === card.seasonId ? 'Picking…' : 'Pick'}</button>
     {/snippet}
    </DraftCardTile>
   {/each}
  </div>
 </section>

 <aside class="side">
  <section aria-labelledby="clubs-heading">
   <h2 id="clubs-heading">Clubs</h2>
   <div class="clubs" role="group" aria-label="Show a club's roster">
    {#each run.seating.seats as _, index (index)}
     <button aria-pressed={seat === index} onclick={() => viewing = index}>{clubName(index)}{index === human ? ' (you)' : ''}</button>
    {/each}
   </div>
   <p class="payroll">{clubName(seat)} · {seatCards.length} cards · payroll {(payroll(seat) / 10).toFixed(1)}M</p>
   <ClubRoster cards={seatCards} {profiles} open={seat === human} />
  </section>
  <section aria-labelledby="ticker-heading">
   <h2 id="ticker-heading">Pick ticker</h2>
   {#if ticker.length}
    <ol class="ticker">
     {#each ticker as entry (entry.pick * 8 + entry.seat)}
      <li><span class="who">{clubName(entry.seat)} took {nameOf(entry.cardId)}</span>{#if entry.reason}<span class="why">{explainPick(entry.reason)}</span>{/if}</li>
     {/each}
    </ol>
   {:else}<p class="payroll">Picks appear here as the piles pass.</p>{/if}
  </section>
 </aside>
</div>

<style>
 .table > * { min-width: 0; }
 .table { display: grid; gap: var(--space-6); }
 .status { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-4); position: sticky; top: 0; z-index: 2; padding: var(--space-3) 0; background: var(--background); border-bottom: 1px solid var(--border); }
 h1 { margin: 0; font-size: var(--text-xl); }
 h2 { margin: 0 0 var(--space-3); font-size: var(--text-base); }
 .status p, .payroll { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5) var(--space-3); }
 @media (min-width: 40rem) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
 @media (min-width: 64rem) {
  .table { grid-template-columns: minmax(0, 1fr) 22rem; grid-template-areas: 'status status' 'pile side'; }
  .status { grid-area: status; }
  .pile { grid-area: pile; }
  .side { grid-area: side; position: sticky; top: 5.5rem; max-height: calc(100dvh - 6rem); overflow-y: auto; }
  .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
 }
 .side { display: grid; gap: var(--space-6); align-content: start; }
 .clubs { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-2); }
 .clubs button { flex: 1 1 8rem; font-size: var(--text-xs); padding-inline: var(--space-2); }
 .clubs button[aria-pressed='true'] { background: var(--text); color: var(--background); }
 .ticker { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); font-size: var(--text-sm); }
 .ticker li { display: grid; }
 .why { color: var(--muted); font-size: var(--text-xs); }
</style>
