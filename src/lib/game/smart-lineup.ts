import { DEFAULT_RELIEF_ROLES, type BullpenSlot, type Profile, type Rates, type ReliefAssignment } from './types.ts';

// Rate vectors are per plate appearance: BB, HBP, SO, 1B, 2B, 3B, HR, other outs.

/** Weighted on-base average from 2019 linear weights; the overall bat a lineup spot rewards. */
export function hitterValue(rates: Rates): number {
 const [bb, hbp, , single, double, triple, hr] = rates;
 return .69 * bb + .72 * hbp + .89 * single + 1.27 * double + 1.62 * triple + 2.1 * hr;
}

export function onBase(rates: Rates): number {
 const [bb, hbp, , single, double, triple, hr] = rates;
 return bb + hbp + single + double + triple + hr;
}

/** Extra bases per plate appearance, the power a cleanup hitter brings. */
export function power(rates: Rates): number {
 const [, , , , double, triple, hr] = rates;
 return double + 2 * triple + 3 * hr;
}

/** FIP's weights per batter faced; lower allows fewer runs. */
export function pitcherCost(rates: Rates): number {
 const [bb, hbp, so, , , , hr] = rates;
 return 13 * hr + 3 * (bb + hbp) - 2 * so;
}

/** Profiles without rates sort after every rated one, keeping their current order. */
function rank<T>(items: T[], score: (item: T) => number | null): T[] {
 return items.map((item, index) => ({ item, index, value: score(item) }))
  .sort((a, b) => (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) || (b.value ?? 0) - (a.value ?? 0) || a.index - b.index)
  .map(entry => entry.item);
}

/**
 * The Book's batting order: the three best bats hit 1, 2 and 4, with the best on-base hitter
 * leading off and the most power at cleanup; the next two hit 5 then 3; the rest follow by value.
 */
export function smartBattingOrder(order: string[], profiles: ReadonlyMap<string, Profile>): string[] {
 const rates = (id: string) => profiles.get(id)?.battingRates ?? null;
 const ranked = rank(order, id => { const r = rates(id); return r ? hitterValue(r) : null; });
 if (ranked.length !== 9) return ranked;
 const top = ranked.slice(0, 3);
 const leadoff = rank(top, id => { const r = rates(id); return r ? onBase(r) : null; })[0];
 const [cleanup, second] = rank(top.filter(id => id !== leadoff), id => { const r = rates(id); return r ? power(r) : null; });
 const [fourth, fifth, ...rest] = ranked.slice(3);
 return [leadoff, second, fifth, cleanup, fourth, ...rest];
}

/** Starters best first, so the ace opens the season and every third game after. */
export function smartRotation(order: string[], profiles: ReadonlyMap<string, Profile>): string[] {
 return rank(order, id => { const r = profiles.get(id)?.pitchingRates; return r ? -pitcherCost(r) : null; });
}

/** The default role template, handed out best arm first: the best closes, the next two set up. */
export function smartReliefRoles(assignments: ReliefAssignment[], profiles: ReadonlyMap<BullpenSlot, Profile>): ReliefAssignment[] {
 const ranked = rank(assignments.map(assignment => assignment.slot), slot => { const r = profiles.get(slot)?.pitchingRates; return r ? -pitcherCost(r) : null; });
 return assignments.map(assignment => {
  const [primary, secondary] = DEFAULT_RELIEF_ROLES[ranked.indexOf(assignment.slot)] ?? DEFAULT_RELIEF_ROLES.at(-1)!;
  return { ...assignment, primary, secondary };
 });
}
