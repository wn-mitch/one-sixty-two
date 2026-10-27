<script lang="ts">
 import { SvelteSet } from 'svelte/reactivity';
 import TeamLogo from '../TeamLogo.svelte';
 import { MAX_TRADE_CARDS, OFFERS_PER_CLUB, tradeable, type TradeOffer } from '../../draft/market.ts';
 import { effectiveCap } from '../../draft/rules.ts';
 import { ownedBy, type DraftRun } from '../../draft/run.ts';
 import type { DraftCard } from '../../draft/types.ts';
 import type { Profile } from '../../game/types.ts';
 import { money, rolesLabel } from './format.ts';

 /**
  * The window's trades: offers waiting for an answer, then a desk for proposing up to three cards each
  * way to one AI club. A club answers at once: it accepts, counters or turns the offer down. A
  * franchise with a sale bonus sees what each of its cards would bank if traded away.
  */
 let { run, revision, profiles, clubName, working, saleBonus = () => 0, onPropose, onRespond }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>; clubName: (seat: number) => string; working: boolean;
  saleBonus?: (cardId: string) => number;
  onPropose: (seat: number, give: string[], get: string[]) => Promise<boolean>;
  onRespond: (offer: number, accept: boolean) => void;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const clubs = $derived(run.seating.seats.map((_, seat) => seat).filter(seat => seat !== human));
 let partner = $state<number | null>(null);
 const give = new SvelteSet<string>();
 const get = new SvelteSet<string>();
 const card = (id: string): DraftCard => run.pool.ledger.cards.get(id)!;
 const nameOf = (id: string) => profiles.get(id)?.displayName ?? card(id).playerId;
 const cardsOf = (seat: number) => { void revision; return [...ownedBy(run, seat)].sort((a, b) => b.salary - a.salary); };
 // The run mutates in place, so each view re-reads it when `revision` moves.
 const pending = $derived.by(() => { void revision; return run.market!.offers.filter(offer => offer.to === human && offer.status === 'open'); });
 const sent = $derived.by(() => { void revision; return run.market!.offers.filter(offer => offer.from === human).toReversed(); });
 const proposals = $derived.by(() => { void revision; return [...run.market!.proposals]; });
 const left = (seat: number) => OFFERS_PER_CLUB - proposals[seat];
 const sum = (ids: Iterable<string>) => [...ids].reduce((total, id) => total + card(id).salary, 0);
 const payroll = $derived.by(() => { void revision; return sum(ownedBy(run, human).map(item => item.seasonId)); });
 const after = $derived(payroll - sum(give) + sum(get));
 const cap = $derived(effectiveCap(run.budgets[human]));
 const bonus = (ids: Iterable<string>) => [...ids].reduce((total, id) => total + saleBonus(id), 0);
 const STATUS: Record<TradeOffer['status'], string> = { open: 'Waiting', accepted: 'Accepted', rejected: 'Turned down', countered: 'Countered', declined: 'Declined', void: 'Off the table' };

 function choose(seat: number) {
  partner = partner === seat ? null : seat;
  give.clear();
  get.clear();
 }
 function toggle(set: SvelteSet<string>, id: string) {
  if (set.has(id)) set.delete(id);
  else if (set.size < MAX_TRADE_CARDS) set.add(id);
 }
 async function send() {
  if (partner === null || !give.size || !get.size) return;
  if (await onPropose(partner, [...give], [...get])) { give.clear(); get.clear(); }
 }
</script>

{#snippet names(ids: readonly string[])}
 {ids.map(nameOf).join(', ')} <span class="money">({money(sum(ids))})</span>
{/snippet}

{#snippet pickList(seat: number, set: SvelteSet<string>, label: string)}
 <fieldset class="side">
  <legend>{label} <span class="count">{set.size} / {MAX_TRADE_CARDS}</span></legend>
  <ul>
   {#each cardsOf(seat) as item (item.seasonId)}
    {@const locked = !tradeable(run, item.seasonId)}
    {@const sale = seat === human ? saleBonus(item.seasonId) : 0}
    <li>
     <label class:locked>
      <input type="checkbox" checked={set.has(item.seasonId)} disabled={working || locked || (!set.has(item.seasonId) && set.size >= MAX_TRADE_CARDS)} onchange={() => toggle(set, item.seasonId)} />
      <span class="who">{nameOf(item.seasonId)} <small>{item.year} · {rolesLabel(item)}{locked ? ' · traded recently' : ''}{sale ? ` · sale bonus +${sale}` : ''}</small></span>
      <span class="money">{money(item.salary)}</span>
     </label>
    </li>
   {/each}
  </ul>
 </fieldset>
{/snippet}

<section class="desk" aria-labelledby="trades-heading">
 <h3 id="trades-heading">Trades</h3>
 {#if pending.length}
  <h4>Offers for you <span class="count">{pending.length}</span></h4>
  <ul class="offers" aria-label="Offers for you">
   {#each pending as offer (offer.id)}
    <li class:counter={offer.counterTo !== null}>
     <p class="club"><TeamLogo franchiseId={run.seating.seats[offer.from]} label={clubName(offer.from)} size="small" /><strong>{clubName(offer.from)}</strong>{#if offer.note}<span class="note">{offer.note}</span>{/if}</p>
     <p class="terms"><span>You get</span> {@render names(offer.give)}</p>
     <p class="terms"><span>You send</span> {@render names(offer.get)}{#if bonus(offer.get)}<span class="sale">{` · sale bonus +${bonus(offer.get)}`}</span>{/if}</p>
     <div class="answer">
      <button type="button" class="primary" disabled={working} onclick={() => onRespond(offer.id, true)}>Accept</button>
      <button type="button" class="secondary" disabled={working} onclick={() => onRespond(offer.id, false)}>Decline</button>
     </div>
    </li>
   {/each}
  </ul>
 {/if}

 <div class="clubs" role="group" aria-label="Propose a trade to">
  {#each clubs as seat (seat)}
   <button type="button" aria-pressed={partner === seat} disabled={left(seat) <= 0} onclick={() => choose(seat)}>
    <TeamLogo franchiseId={run.seating.seats[seat]} label={clubName(seat)} size="small" />
    <span>{clubName(seat)}<small>{left(seat)} {left(seat) === 1 ? 'offer' : 'offers'} left</small></span>
   </button>
  {/each}
 </div>

 {#if partner !== null}
  <div class="compose">
   {@render pickList(partner, get, `From ${clubName(partner)}`)}
   {@render pickList(human, give, 'From your roster')}
  </div>
  <div class="send">
   <p class:over={after > cap}>Your payroll after: <strong>{money(after)}</strong> of {money(cap)}{#if bonus(give)}{' · sale bonus '}<strong>+{bonus(give)}</strong> when the market closes{/if}</p>
   <button type="button" class="primary" disabled={working || !give.size || !get.size} onclick={() => void send()}>Send offer</button>
  </div>
 {/if}

 {#if sent.length}
  <ul class="history" aria-label="Your offers">
   {#each sent as offer (offer.id)}
    <li><span class="status" data-status={offer.status}>{STATUS[offer.status]}</span> {clubName(offer.to)}: {offer.give.map(nameOf).join(', ')} for {offer.get.map(nameOf).join(', ')}{offer.note && offer.status !== 'accepted' ? ` · ${offer.note}` : ''}</li>
   {/each}
  </ul>
 {/if}
</section>

<style>
 .desk { display: grid; gap: var(--space-4); min-width: 0; }
 h3 { margin: 0; font-size: var(--text-lg); }
 p { margin: 0; }
 ul { margin: 0; padding: 0; list-style: none; }
 h4 { display: flex; gap: var(--space-2); margin: 0; font-size: var(--text-sm); }
 .offers { display: grid; border-top: 1px solid var(--border); }
 /* One compact row per offer; a counteroffer to the player's own offer is marked. */
 .offers > li { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); padding: var(--space-2) 0 var(--space-3); border-bottom: 1px solid var(--border); }
 .offers > li.counter { padding-inline: var(--space-2); border: 1px solid var(--accent); border-radius: var(--radius); }
 @media (min-width: 48rem) { .offers > li { grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--space-4); } .answer { grid-column: 2; grid-row: 1 / span 3; align-self: center; } }
 .club { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); min-width: 0; }
 .note { margin-left: auto; color: var(--muted); font-size: var(--text-xs); }
 .terms { font-size: var(--text-sm); overflow-wrap: anywhere; }
 .terms > span:first-child { display: inline-block; min-width: 4.5rem; color: var(--muted); font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
 .money { color: var(--muted); font-variant-numeric: tabular-nums; }
 .sale { color: var(--success); font-size: var(--text-xs); font-weight: 700; }
 .answer { display: flex; gap: var(--space-2); }
 .clubs { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: var(--space-1); }
 .clubs button { display: flex; align-items: center; gap: var(--space-2); min-height: 44px; padding-inline: var(--space-2); font-size: var(--text-xs); text-align: left; }
 .clubs button small { display: block; color: var(--muted); }
 .clubs button[aria-pressed='true'] { background: var(--text); color: var(--background); }
 .clubs button[aria-pressed='true'] small { color: inherit; }
 .compose { display: grid; gap: var(--space-4); min-width: 0; }
 @media (min-width: 48rem) { .compose { grid-template-columns: 1fr 1fr; } }
 .side { min-width: 0; margin: 0; padding: 0; border: 0; }
 legend { display: flex; justify-content: space-between; width: 100%; margin-bottom: var(--space-2); font-size: var(--text-sm); font-weight: 700; }
 .count { color: var(--muted); font-weight: 600; font-variant-numeric: tabular-nums; }
 .side ul { max-height: 18rem; overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--border); }
 .side label { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-1) 0; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); cursor: pointer; }
 .side label.locked { color: var(--muted); cursor: default; }
 .side input { width: 1.1rem; height: 1.1rem; accent-color: var(--accent); }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
 small { display: block; color: var(--muted); font-size: var(--text-xs); }
 .send { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
 .send p { font-size: var(--text-sm); color: var(--muted); }
 .send p strong { color: var(--text); }
 .send p.over strong { color: var(--error); }
 .history { display: grid; gap: var(--space-1); font-size: var(--text-sm); }
 .status { font-weight: 700; }
 .status[data-status='accepted'] { color: var(--success); }
 .status[data-status='rejected'], .status[data-status='void'] { color: var(--error); }
 .status[data-status='countered'] { color: var(--accent); }
</style>
