<script lang="ts">
 import { canSwap, swapPlaces, type ClubLineup, type Place } from '../../draft/league.ts';
 import { DRAFT_BULLPEN_SLOTS } from '../../draft/rules.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { HITTER_SLOTS, RELIEF_ROLES, STARTER_SLOTS, type Profile, type ReliefRole } from '../../game/types.ts';
 import type { DraftSlot } from '../../draft/types.ts';
 import { smartBattingOrder, smartReliefRoles, smartRotation } from '../../game/smart-lineup.ts';
 import { innings } from '../../game/format.ts';
 import { loadMedia } from '../../media/client.ts';
 import type { MediaManifest } from '../../media/types.ts';
 import type { BatterLine, PitcherLine } from '../../sim/types.ts';
 import TeamLogo from '../TeamLogo.svelte';

 /**
  * The player's lineup for the next chapter; every change is checked and saved at once. Each row
  * sets the card's own line beside its line so far this season, tinted when it runs well above or
  * below the card.
  */
 let { run, lineup, profiles, lines, disabled, onChange }: {
  run: DraftRun; lineup: ClubLineup; profiles: ReadonlyMap<string, Profile>;
  /** Season-to-date lines for this club, by player-season. */
  lines: { batting: readonly BatterLine[]; pitching: readonly PitcherLine[] };
  disabled: boolean;
  onChange: (lineup: ClubLineup) => Promise<string | null>;
 } = $props();
 let message = $state('');
 let media = $state.raw<MediaManifest | null>(null);
 $effect(() => { let live = true; void loadMedia().then(value => { if (live) media = value; }).catch(() => {}); return () => { live = false; }; });
 const teamColor = (id: string) => media?.teams[profiles.get(id)?.franchiseId ?? '']?.color ?? 'var(--border)';

 const batting = $derived(new Map(lines.batting.map(line => [line.seasonId, line])));
 const pitching = $derived(new Map(lines.pitching.map(line => [line.seasonId, line])));
 const three = (value: number) => value.toFixed(3).replace(/^0/, '');
 /** OPS from counting stats; null without at-bats. */
 const ops = (c: { AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SF: number }) => {
  if (c.AB <= 0) return null;
  const onBase = (c.H + c.BB + c.HBP) / Math.max(1, c.AB + c.BB + c.HBP + c.SF);
  return onBase + (c.H + c.doubles + 2 * c.triples + 3 * c.HR) / c.AB;
 };
 /** Unearned runs add about 9% to ERA, so the card's ERA is scaled before it is compared with runs allowed per nine. */
 const UNEARNED = 1.09;
 type Form = 'hot' | 'cold' | null;
 function hitterForm(id: string): { card: string; now: string; form: Form } {
  const counts = profiles.get(id)?.batting;
  const card = counts ? ops({ ...counts }) : null;
  const line = batting.get(id);
  const now = line ? ops(line) : null;
  const form: Form = card === null || now === null || !line || line.PA < 30 ? null : now - card >= .06 ? 'hot' : card - now >= .06 ? 'cold' : null;
  return {
   card: card === null ? '' : `card ${three(card)}`,
   now: !line || now === null ? 'No at-bats yet' : `${three(now)} OPS · ${line.HR} HR · ${line.PA} PA`,
   form
  };
 }
 function pitcherForm(id: string): { card: string; now: string; form: Form } {
  const counts = profiles.get(id)?.pitching;
  const era = counts && counts.IPouts > 0 ? counts.ER * 27 / counts.IPouts : null;
  const line = pitching.get(id);
  const ra9 = line && line.outs > 0 ? line.R * 27 / line.outs : null;
  const expected = era === null ? null : era * UNEARNED;
  const form: Form = expected === null || ra9 === null || line!.outs < 45 ? null : expected - ra9 >= .75 ? 'hot' : ra9 - expected >= .75 ? 'cold' : null;
  return {
   card: era === null ? '' : `card ${era.toFixed(2)} ERA`,
   now: !line || ra9 === null ? 'Not used yet' : `${ra9.toFixed(2)} RA9 · ${innings(line.outs)} IP · ${line.SO} SO`,
   form
  };
 }

 const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);
 const smartBatting = $derived(smartBattingOrder([...lineup.battingOrder], profiles));
 const smartStarters = $derived(smartRotation([...lineup.starterOrder], profiles));
 const bullpenProfiles = $derived(new Map(DRAFT_BULLPEN_SLOTS.flatMap(slot => { const profile = profiles.get(lineup.active[slot]); return profile ? [[slot, profile] as const] : []; })));
 const smartRoles = $derived(smartReliefRoles(lineup.reliefRoles, bullpenProfiles));
 const rolesAreSmart = $derived(lineup.reliefRoles.every((item, index) => item.primary === smartRoles[index]?.primary && item.secondary === smartRoles[index]?.secondary));
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
 const applySmartBatting = () => apply({ ...lineup, battingOrder: smartBatting }, `Smart lineup set: ${smartBatting.map(name).join(', ')}`);
 const applySmartRotation = () => apply({ ...lineup, starterOrder: smartStarters }, `Ace first: ${smartStarters.map(name).join(', ')}`);
 const applySmartRoles = () => apply({ ...lineup, reliefRoles: smartRoles }, 'Smart roles set');
 function role(slot: string, field: 'primary' | 'secondary', value: string) {
  const reliefRoles = lineup.reliefRoles.map(item => item.slot !== slot ? item : field === 'primary'
   ? { ...item, primary: value as ReliefRole, secondary: item.secondary === value ? null : item.secondary }
   : { ...item, secondary: value === '' ? null : value as ReliefRole });
  void apply({ ...lineup, reliefRoles }, `${slot} role updated`);
 }
</script>

<div class="lineup">
 <section aria-labelledby="batting-heading">
  <div class="heading"><h3 id="batting-heading">Batting order</h3>{@render smart('Smart lineup', sameOrder(lineup.battingOrder, smartBatting), applySmartBatting)}</div>
  <ol>
   {#each lineup.battingOrder as id, index (id)}
    {@const slot = slotOf(id)!}
    <li style:--team={teamColor(id)}>
     <span class="order">{index + 1}</span>
     {@render who(id)}
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
  <div class="heading"><h3 id="rotation-heading">Rotation</h3>{@render smart('Ace first', sameOrder(lineup.starterOrder, smartStarters), applySmartRotation)}</div>
  <ol>
   {#each lineup.starterOrder as id, index (id)}
    {@const slot = slotOf(id)!}
    <li style:--team={teamColor(id)}>
     <span class="order">{index + 1}</span>
     {@render who(id)}
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
  <div class="heading"><h3 id="bullpen-heading">Bullpen</h3>{@render smart('Smart roles', rolesAreSmart, applySmartRoles)}</div>
  <ul>
   {#each DRAFT_BULLPEN_SLOTS as slot (slot)}
    {@const id = lineup.active[slot]}
    {@const assigned = lineup.reliefRoles.find(item => item.slot === slot)!}
    <li class="arm" style:--team={teamColor(id)}>
     <span class="order">{slot}</span>
     {@render who(id)}
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
    <li style:--team={teamColor(id)}>
     <span class="order">R{index + 1}</span>
     {@render who(id)}
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

{#snippet smart(label: string, applied: boolean, run: () => void)}
 <button type="button" class="secondary smart" disabled={disabled || applied} title={applied ? 'Already in this order' : undefined} onclick={run}>
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 4.5h10M3 8h7M3 11.5h4"></path></svg>{label}
 </button>
{/snippet}

{#snippet who(id: string)}
 {@const profile = profiles.get(id)}
 {@const pitcher = !profile?.batting || (!!profile.pitching && !profile.eligibleSlots.some(slot => (HITTER_SLOTS as readonly string[]).includes(slot)))}
 {@const form = pitcher ? pitcherForm(id) : hitterForm(id)}
 <span class="who">
  {#if profile}<TeamLogo franchiseId={profile.franchiseId} year={profile.year} label={profile.historicalTeam} size="small" />{/if}
  <span class="name"><span>{name(id)} <small>{year(id)}</small></span>
   <span class="form" data-form={form.form}>{form.now}{#if form.card}<span class="card-line">{` · ${form.card}`}</span>{/if}{#if form.form}<span class="sr-only">, {form.form === 'hot' ? 'running hot' : 'running cold'}</span>{/if}</span>
  </span>
 </span>
{/snippet}

<style>
 .lineup { display: grid; gap: var(--space-6); }
 @media (min-width: 64rem) { .lineup { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
 h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
 ol, ul { list-style: none; margin: 0; padding: 0; display: grid; }
 li { display: grid; grid-template-columns: 2.25rem minmax(0, 1fr) minmax(6rem, 9rem) auto; align-items: center; gap: var(--space-2); min-height: 3.5rem; padding-left: var(--space-2); border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); border-left: 3px solid var(--team, var(--border)); background: linear-gradient(90deg, color-mix(in oklch, var(--team, transparent) 14%, transparent), transparent 55%); font-size: var(--text-sm); }
 .heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); }
 .heading h3 { margin: 0; }
 .smart { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.25rem; padding-inline: var(--space-3); font-size: var(--text-xs); }
 .smart svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
 .who { display: flex; align-items: center; gap: var(--space-2); }
 .name { display: grid; min-width: 0; }
 .form { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .form[data-form='hot'] { color: var(--success); }
 .form[data-form='cold'] { color: var(--error); }
 .card-line { color: var(--muted); }
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
