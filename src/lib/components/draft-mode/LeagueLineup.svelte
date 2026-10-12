<script lang="ts">
 import { canSwap, swapPlaces, type ClubLineup, type Place } from '../../draft/league.ts';
 import { DRAFT_BULLPEN_SLOTS } from '../../draft/rules.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { HITTER_SLOTS, RELIEF_ROLES, STARTER_SLOTS, type Profile, type ReliefRole } from '../../game/types.ts';
 import type { DraftSlot } from '../../draft/types.ts';

 /** The player's lineup for the next chapter; every change is checked and saved at once. */
 let { run, lineup, profiles, disabled, onChange }: {
  run: DraftRun; lineup: ClubLineup; profiles: ReadonlyMap<string, Profile>; disabled: boolean;
  onChange: (lineup: ClubLineup) => Promise<string | null>;
 } = $props();
 let message = $state('');
 const ROLE_LABELS: Record<ReliefRole, string> = { closer: 'Closer', setup: 'Setup', middle: 'Middle relief', long: 'Long relief', stopper: 'Stopper' };
 const name = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
 const year = (id: string) => run.pool.ledger.cards.get(id)?.year ?? '';
 const slotOf = (id: string) => (Object.entries(lineup.active) as [DraftSlot, string][]).find(([, card]) => card === id)?.[0];
 const ALL_PLACES = $derived<Place[]>([...run.pool.rules.activeSlots, ...lineup.reserves.map((_, index) => index)]);
 const placeLabel = (place: Place) => typeof place === 'number' ? `Reserve ${place + 1}` : place;
 /** Places the card at `from` may trade with, named with the card that would move. */
 const options = (from: Place) => ALL_PLACES.filter(to => canSwap(run, lineup, from, to));

 async function apply(next: ClubLineup, announce: string) {
  const refused = await onChange(next);
  message = refused ?? announce;
 }
 function swap(from: Place, value: string) {
  if (value === '') return;
  const to: Place = /^\d+$/.test(value) ? Number(value) : value as DraftSlot;
  const moving = typeof from === 'number' ? lineup.reserves[from] : lineup.active[from];
  const other = typeof to === 'number' ? lineup.reserves[to] : lineup.active[to];
  void apply(swapPlaces(lineup, from, to), `${name(moving)} to ${placeLabel(to)}, ${name(other)} to ${placeLabel(from)}`);
 }
 function move(key: 'battingOrder' | 'starterOrder', index: number, by: number) {
  const order = [...lineup[key]];
  const target = index + by;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  void apply({ ...lineup, [key]: order }, `${name(order[target])} now ${key === 'battingOrder' ? 'bats' : 'starts'} ${target + 1}`);
 }
 function role(slot: string, field: 'primary' | 'secondary', value: string) {
  const reliefRoles = lineup.reliefRoles.map(item => item.slot !== slot ? item : field === 'primary'
   ? { ...item, primary: value as ReliefRole, secondary: item.secondary === value ? null : item.secondary }
   : { ...item, secondary: value === '' ? null : value as ReliefRole });
  void apply({ ...lineup, reliefRoles }, `${slot} role updated`);
 }
</script>

<div class="lineup">
 <section aria-labelledby="batting-heading">
  <h3 id="batting-heading">Batting order</h3>
  <ol>
   {#each lineup.battingOrder as id, index (id)}
    {@const slot = slotOf(id)!}
    <li>
     <span class="order">{index + 1}</span>
     <span class="who">{name(id)} <small>{year(id)}</small></span>
     <select aria-label={`Position for ${name(id)}`} {disabled} value="" onchange={event => swap(slot, event.currentTarget.value)}>
      <option value="">{slot}</option>
      {#each options(slot) as to (to)}<option value={String(to)}>{placeLabel(to)} · swap with {name(typeof to === 'number' ? lineup.reserves[to] : lineup.active[to])}</option>{/each}
     </select>
     <span class="moves">
      <button aria-label={`Move ${name(id)} up`} disabled={disabled || index === 0} onclick={() => move('battingOrder', index, -1)}>↑</button>
      <button aria-label={`Move ${name(id)} down`} disabled={disabled || index === lineup.battingOrder.length - 1} onclick={() => move('battingOrder', index, 1)}>↓</button>
     </span>
    </li>
   {/each}
  </ol>
 </section>

 <section aria-labelledby="rotation-heading">
  <h3 id="rotation-heading">Rotation</h3>
  <ol>
   {#each lineup.starterOrder as id, index (id)}
    {@const slot = slotOf(id)!}
    <li>
     <span class="order">{index + 1}</span>
     <span class="who">{name(id)} <small>{year(id)}</small></span>
     <select aria-label={`Slot for ${name(id)}`} {disabled} value="" onchange={event => swap(slot, event.currentTarget.value)}>
      <option value="">{slot}</option>
      {#each options(slot) as to (to)}<option value={String(to)}>{placeLabel(to)} · swap with {name(typeof to === 'number' ? lineup.reserves[to] : lineup.active[to])}</option>{/each}
     </select>
     <span class="moves">
      <button aria-label={`Move ${name(id)} up`} disabled={disabled || index === 0} onclick={() => move('starterOrder', index, -1)}>↑</button>
      <button aria-label={`Move ${name(id)} down`} disabled={disabled || index === lineup.starterOrder.length - 1} onclick={() => move('starterOrder', index, 1)}>↓</button>
     </span>
    </li>
   {/each}
  </ol>
 </section>

 <section aria-labelledby="bullpen-heading">
  <h3 id="bullpen-heading">Bullpen</h3>
  <ul>
   {#each DRAFT_BULLPEN_SLOTS as slot (slot)}
    {@const id = lineup.active[slot]}
    {@const assigned = lineup.reliefRoles.find(item => item.slot === slot)!}
    <li class="arm">
     <span class="order">{slot}</span>
     <span class="who">{name(id)} <small>{year(id)}</small></span>
     <select aria-label={`Slot for ${name(id)}`} {disabled} value="" onchange={event => swap(slot, event.currentTarget.value)}>
      <option value="">{slot}</option>
      {#each options(slot) as to (to)}<option value={String(to)}>{placeLabel(to)} · swap with {name(typeof to === 'number' ? lineup.reserves[to] : lineup.active[to])}</option>{/each}
     </select>
     <span class="roles">
      <label>Role <select {disabled} value={assigned.primary} onchange={event => role(slot, 'primary', event.currentTarget.value)}>
       {#each RELIEF_ROLES as item (item)}<option value={item}>{ROLE_LABELS[item]}</option>{/each}
      </select></label>
      <label>Backup <select {disabled} value={assigned.secondary ?? ''} onchange={event => role(slot, 'secondary', event.currentTarget.value)}>
       <option value="">None</option>
       {#each RELIEF_ROLES.filter(item => item !== assigned.primary) as item (item)}<option value={item}>{ROLE_LABELS[item]}</option>{/each}
      </select></label>
     </span>
    </li>
   {/each}
  </ul>
 </section>

 <section aria-labelledby="reserves-heading">
  <h3 id="reserves-heading">Reserves</h3>
  <ul>
   {#each lineup.reserves as id, index (id)}
    <li>
     <span class="order">R{index + 1}</span>
     <span class="who">{name(id)} <small>{year(id)}</small></span>
     <select aria-label={`Bring ${name(id)} into a slot`} {disabled} value="" onchange={event => swap(index, event.currentTarget.value)}>
      <option value="">Reserve</option>
      {#each options(index).filter(to => typeof to !== 'number') as to (to)}<option value={String(to)}>{placeLabel(to)} · for {name(lineup.active[to as DraftSlot])}</option>{/each}
     </select>
    </li>
   {/each}
  </ul>
 </section>
 <p class="sr-only" aria-live="polite">{message}</p>
</div>

<style>
 .lineup { display: grid; gap: var(--space-6); }
 @media (min-width: 64rem) { .lineup { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
 h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
 ol, ul { list-style: none; margin: 0; padding: 0; display: grid; }
 li { display: grid; grid-template-columns: 2.25rem minmax(0, 1fr) minmax(6rem, 9rem) auto; align-items: center; gap: var(--space-2); min-height: 3rem; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); }
 .order { color: var(--muted); font-weight: 700; font-size: var(--text-xs); }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
 small { color: var(--muted); font-size: var(--text-xs); }
 select { min-height: 2.75rem; width: 100%; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); padding-inline: var(--space-2); }
 .moves { display: flex; gap: var(--space-1); }
 .moves button { min-width: 2.75rem; padding: 0; }
 .arm { grid-template-columns: 2.25rem minmax(0, 1fr) minmax(6rem, 9rem); padding-bottom: var(--space-2); }
 .roles { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
 .roles label { display: grid; gap: 2px; font-size: var(--text-xs); color: var(--muted); }
 @media (max-width: 30rem) {
  li, .arm { grid-template-columns: 2rem minmax(0, 1fr) auto; padding-bottom: var(--space-2); }
  li > select { grid-column: 2 / -1; grid-row: 2; }
  .roles { grid-row: 3; }
 }
</style>
