<script lang="ts">
 import TeamLogo from '../TeamLogo.svelte';
 import CapBar from './CapBar.svelte';
 import ClubRoster from './ClubRoster.svelte';
 import { explainPick } from '../../draft/ai.ts';
 import type { Arrangement } from '../../draft/legality.ts';
 import { effectiveCap, rosterSize } from '../../draft/rules.ts';
 import { ownedBy, type DraftRun } from '../../draft/run.ts';
 import type { Profile } from '../../game/types.ts';

 /** The other clubs while drafting: any club's roster and payroll, then every pick, newest first, with each AI pick's reason. */
 let { run, revision, profiles, clubName }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>; clubName: (seat: number) => string;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 let viewing = $state<number | null>(null);
 const seat = $derived(viewing ?? human);
 const roster = $derived(rosterSize(run.pool.rules));
 const seatCards = $derived.by(() => { void revision; return ownedBy(run, seat); });
 const payroll = $derived(seatCards.reduce((sum, card) => sum + card.salary, 0));
 /** The player's own club shows where its cards were placed. */
 const placed = $derived.by((): Arrangement | undefined => {
  void revision;
  if (seat !== human) return undefined;
  const { activeSlots, reserves } = run.pool.rules;
  const openReserves = Math.max(0, reserves - run.bench.length);
  return {
   // Slot order, not the order the cards were placed in.
   active: Object.fromEntries(activeSlots.flatMap(slot => run.field.has(slot) ? [[slot, run.field.get(slot)!]] : [])),
   reserves: run.bench.slice(0, reserves),
   surplus: run.bench.slice(reserves),
   open: [...activeSlots.filter(slot => !run.field.has(slot)), ...Array<null>(openReserves).fill(null)]
  };
 });
 const ticker = $derived.by(() => { void revision; return run.ticker.slice(-24).reverse(); });
 const nameOf = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
</script>

<div class="league">
 <section aria-labelledby="clubs-heading">
  <h3 id="clubs-heading">Clubs</h3>
  <div class="clubs" role="group" aria-label="Show a club's roster">
   {#each run.seating.seats as franchiseId, index (index)}
    <button type="button" aria-pressed={seat === index} onclick={() => viewing = index}><TeamLogo {franchiseId} label={clubName(index)} size="small" /><span>{clubName(index)}{index === human ? ' (you)' : ''}</span></button>
   {/each}
  </div>
  <div class="club-meters">
   <p class="row"><span>Roster</span><span><strong>{seatCards.length}</strong> / {roster}</span></p>
   <CapBar {payroll} cap={effectiveCap(run.budgets[seat])} compact />
  </div>
  <ClubRoster cards={seatCards} {profiles} {placed} open={seat === human} />
 </section>
 <section aria-labelledby="ticker-heading">
  <h3 id="ticker-heading">Pick ticker</h3>
  {#if ticker.length}
   <ol class="ticker">
    {#each ticker as entry (entry.pick * 8 + entry.seat)}
     <li><span>{clubName(entry.seat)} took {nameOf(entry.cardId)}</span>{#if entry.reason}<span class="why">{explainPick(entry.reason)}</span>{/if}</li>
    {/each}
   </ol>
  {:else}<p class="empty">Picks appear here as the piles pass.</p>{/if}
 </section>
</div>

<style>
 .league { display: grid; gap: var(--space-6); align-content: start; min-width: 0; }
 h3 { margin: 0 0 var(--space-3); font-size: var(--text-base); }
 .clubs { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-3); }
 .clubs button { flex: 1 1 8rem; display: flex; align-items: center; gap: var(--space-2); min-height: 44px; padding-inline: var(--space-2); font-size: var(--text-xs); text-align: left; }
 .clubs button[aria-pressed='true'] { background: var(--text); color: var(--background); }
 .club-meters { display: grid; gap: var(--space-2); margin-bottom: var(--space-3); }
 .row { display: flex; justify-content: space-between; margin: 0; color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .row strong { color: var(--text); }
 .ticker { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); }
 .ticker li { display: grid; }
 .why, .empty { color: var(--muted); font-size: var(--text-xs); }
 .empty { margin: 0; }
</style>
