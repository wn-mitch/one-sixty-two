<script lang="ts">
 import { flip } from 'svelte/animate';
 import { fly } from 'svelte/transition';
 import CardBrowser from '../CardBrowser.svelte';
 import CapBar from './CapBar.svelte';
 import TeamLogo from '../TeamLogo.svelte';
 import ClubRoster from './ClubRoster.svelte';
 import DraftCardTile from './DraftCardTile.svelte';
 import PickDeal from './PickDeal.svelte';
 import { explainPick } from '../../draft/ai.ts';
 import { arrangeRoster } from '../../draft/legality.ts';
 import { canFill, effectiveCap, picksPerSeat, rosterSize } from '../../draft/rules.ts';
 import type { DraftCard, DraftSlot } from '../../draft/types.ts';
 import { appSettings } from '../../game/settings.svelte.ts';
 import { HITTER_SLOTS, type Slot } from '../../game/types.ts';
 import type { WarRankings } from '../../rankings/types.ts';
 import { heldPile, ownedBy, type DraftRun } from '../../draft/run.ts';
 import type { CardMediaStatus } from '../../cards/view-model.ts';
 import type { Manifest, Profile } from '../../game/types.ts';
 import type { MediaManifest } from '../../media/types.ts';

 let { run, revision, profiles, manifest, media, mediaStatus, rankings = null, clubName, onPick }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>;
  manifest: Manifest | null; media: MediaManifest | null; mediaStatus: CardMediaStatus; rankings?: WarRankings | null;
  clubName: (seat: number) => string; onPick: (cardId: string) => Promise<void>;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 let viewing = $state<number | null>(null);
 let picking = $state('');
 const pile = $derived.by(() => { void revision; return heldPile(run); });
 type PileSort = 'dealt' | 'salary' | 'war';
 const SORTS: readonly { value: PileSort; label: string }[] = [{ value: 'salary', label: 'Salary' }, { value: 'war', label: 'WAR' }, { value: 'dealt', label: 'Dealt' }];
 let sort = $state<PileSort>('salary');
 /** Highest first unless toggled; Dealt reverses the dealt order. */
 let descending = $state(true);
 const chooseSort = (value: string) => { if (sort === value) descending = !descending; else { sort = value as PileSort; descending = true; } };
 let filterSlot = $state<DraftSlot | null>(null);
 /** WAR/162 in the card's priced role; null when unranked. */
 const war = (card: DraftCard): number | null => {
  const ranking = rankings?.seasons[card.seasonId];
  if (!ranking) return null;
  return (HITTER_SLOTS as readonly Slot[]).includes(card.pricedSlot) ? ranking.battingWAR162 : ranking.pitchingWAR162;
 };
 let query = $state('');
 const named = (card: DraftCard) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const profile = profiles.get(card.seasonId);
  return `${profile?.displayName ?? card.playerId} ${profile?.year ?? ''} ${profile?.historicalTeam ?? ''}`.toLowerCase().includes(needle);
 };
 const fits = (card: DraftCard) => filterSlot === null || canFill(card, filterSlot);
 /** Open roster slots, each with how many pile cards could fill it; filled slots are not offered. */
 const openSlots = $derived.by(() => { void revision; return [...new Set(arrangeRoster(ownedBy(run, human)).open.filter((slot): slot is DraftSlot => slot !== null))]; });
 const filters = $derived([
  { value: 'All', count: pile.filter(named).length },
  ...openSlots.map(slot => ({ value: slot, count: pile.filter(card => named(card) && canFill(card, slot)).length }))
 ]);
 /** The pile in the chosen order; with a slot filter, cards that cannot fill it follow the rest. */
 const ordered = $derived.by(() => {
  const keyed = pile.map((card, index) => ({ card, index })).filter(entry => named(entry.card));
  const value = (card: DraftCard) => sort === 'salary' ? card.salary : sort === 'war' ? war(card) ?? -Infinity : 0;
  const direction = descending ? 1 : -1;
  keyed.sort((a, b) => Number(fits(b.card)) - Number(fits(a.card)) || direction * (value(b.card) - value(a.card)) || (sort === 'dealt' ? direction : 1) * (a.index - b.index));
  return keyed.map(entry => entry.card);
 });
 // A filled slot can no longer filter the pile.
 $effect(() => { void revision; if (filterSlot && !arrangeRoster(ownedBy(run, human)).open.includes(filterSlot)) filterSlot = null; });
 const toggleSlot = (slot: DraftSlot) => { filterSlot = filterSlot === slot ? null : slot; };
 const payroll = (seat: number) => ownedBy(run, seat).reduce((sum, card) => sum + card.salary, 0);
 const cap = $derived(effectiveCap(run.budgets[human]));
 const humanPayroll = $derived.by(() => { void revision; return payroll(human); });
 const humanCards = $derived.by(() => { void revision; return ownedBy(run, human).length; });
 const roster = $derived(rosterSize(run.pool.rules));
 const seat = $derived(viewing ?? human);
 const motion = $derived(appSettings.effectiveEnabled);
 const seatCards = $derived.by(() => { void revision; return ownedBy(run, seat); });
 const ticker = $derived.by(() => { void revision; return run.ticker.slice(-24).reverse(); });
 const nameOf = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;

 async function pick(cardId: string) {
  picking = cardId;
  try {
   await onPick(cardId);
   // The next pile starts at the top of the page.
   window.scrollTo({ top: 0, behavior: appSettings.effectiveEnabled ? 'smooth' : 'auto' });
  } finally { picking = ''; }
 }
</script>

<svelte:window onkeydown={event => { if (event.key === 'Escape' && filterSlot) filterSlot = null; }} />

<div class="table">
 <header class="status">
  <div>
   <h1>Pick {run.pick + 1} of {picksPerSeat(run.pool.rules)}</h1>
   <p>{[clubName(human), ...(run.seating.rival ? [`rival ${clubName(run.seating.seats.indexOf(run.seating.rival))}`] : []), 'piles pass left'].join(' · ')}</p>
  </div>
  <CapBar payroll={humanPayroll} {cap} spots={Math.max(1, rosterSize(run.pool.rules) - humanCards)} />
 </header>

 <section class="pile" aria-labelledby="pile-heading">
  <PickDeal {run} {revision} {profiles} {manifest} {media} {mediaStatus} {rankings} {clubName} />
  <div class="pile-head">
   <h2 id="pile-heading">Your pile · {pile.length} cards</h2>
   {#if filterSlot}
    <button type="button" class="chip" onclick={() => filterSlot = null} aria-label={`Clear the ${filterSlot} filter`}>Fits {filterSlot}<span aria-hidden="true">×</span></button>
   {/if}
  </div>
  <CardBrowser label="Your pile" bind:query searchLabel="Find a card" sorts={SORTS} {sort} {descending} onSort={chooseSort}
   {filters} filter={filterSlot ?? 'All'} filterLegend="Fits open slot" filterToggle="Slots" onFilter={value => filterSlot = value === 'All' ? null : value as DraftSlot}>
  <div class="grid">
   {#each ordered as card, index (card.seasonId)}
    <!-- Piles pass left, so each new pile slides in from the right. -->
    <div class="cell" class:dim={!fits(card)} animate:flip={{ duration: motion ? 360 : 0 }} in:fly={{ x: motion ? 72 : 0, duration: motion ? 420 : 0, delay: motion ? Math.min(index, 12) * 30 : 0 }}>
     <DraftCardTile {card} profile={profiles.get(card.seasonId)} {manifest} {media} {mediaStatus} {rankings}>
      {#snippet actions()}
       <button class="primary" disabled={picking !== ''} onclick={() => pick(card.seasonId)}>{picking === card.seasonId ? 'Picking…' : 'Pick'}</button>
      {/snippet}
     </DraftCardTile>
    </div>
   {/each}
  </div>
  {#if !ordered.length && query.trim()}<p class="payroll">No cards in this pile match “{query}”.</p>{/if}
  </CardBrowser>
 </section>

 <aside class="side">
  <section aria-labelledby="clubs-heading">
   <h2 id="clubs-heading">Clubs</h2>
   <div class="clubs" role="group" aria-label="Show a club's roster">
    {#each run.seating.seats as _, index (index)}
     <button aria-pressed={seat === index} onclick={() => viewing = index}><TeamLogo franchiseId={run.seating.seats[index]} label={clubName(index)} size="small" /><span>{clubName(index)}{index === human ? ' (you)' : ''}</span></button>
    {/each}
   </div>
   <div class="club-meters">
    <p class="club-name"><TeamLogo franchiseId={run.seating.seats[seat]} label={clubName(seat)} size="small" />{clubName(seat)}</p>
    <div class="meter-row">
     <p class="row"><span>Roster</span><span><strong>{seatCards.length}</strong> / {roster}</span></p>
     <div class="bar" role="meter" aria-label="Roster filled" aria-valuemin={0} aria-valuemax={roster} aria-valuenow={seatCards.length}><span style:width={`${Math.min(100, seatCards.length / roster * 100)}%`}></span></div>
    </div>
    <CapBar payroll={payroll(seat)} cap={effectiveCap(run.budgets[seat])} compact />
   </div>
   <ClubRoster cards={seatCards} {profiles} open={seat === human} activeSlot={filterSlot} onSlot={seat === human ? toggleSlot : undefined} />
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
  .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
 }
 .side { display: grid; gap: var(--space-6); align-content: start; }
 .clubs { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-2); }
 .clubs button { flex: 1 1 8rem; display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); padding-inline: var(--space-2); text-align: left; }
 .club-meters { display: grid; gap: var(--space-2); margin-bottom: var(--space-3); }
 .club-name { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-weight: 700; }
 .meter-row { display: grid; gap: var(--space-1); }
 .row { display: flex; justify-content: space-between; margin: 0; color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .row strong { color: var(--text); }
 .bar { height: .375rem; border-radius: 999px; background: var(--surface-raised); overflow: hidden; }
 .bar span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width 360ms var(--ease-out); }
 .pile { display: grid; gap: var(--space-4); align-content: start; }
 .pile-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
 .pile-head h2 { margin: 0 auto 0 0; }
 .chip { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.25rem; padding: 0 var(--space-3); border-color: var(--accent); border-radius: 999px; color: var(--accent); font-size: var(--text-xs); }
 .chip span { font-size: var(--text-base); line-height: 1; }
 .cell { min-width: 0; transition: opacity 280ms var(--ease-out), filter 280ms var(--ease-out); }
 .cell.dim { opacity: .38; filter: grayscale(1); }
 .clubs button[aria-pressed='true'] { background: var(--text); color: var(--background); }
 .ticker { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); font-size: var(--text-sm); }
 .ticker li { display: grid; }
 .why { color: var(--muted); font-size: var(--text-xs); }
</style>
