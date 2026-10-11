import { finishFor, type Finish, type FinishRole } from '../cards/finish.ts';
import { HITTER_SLOTS, STARTER_SLOTS, type DefensiveEnvironment, type Profile, type Rates, type Slot } from '../game/types.ts';
import { contactTargets, fitContact, leagueContactFit, matchup } from '../sim/contact-profile.ts';
import { contactClasses, eventRunWeights, getPhysicalReference, type EventRunWeights } from '../sim/physical-expectation.ts';
import { closerBudget, starterBudget } from '../sim/workload.ts';
import { SALARY_VERSION } from './versions.ts';

/** Provisional pricing constants; the table header records them with the derived workloads. */
export const SALARY_METHOD = Object.freeze({
 minSalary: 5,
 pricePerRun: 4,
 replacementPercentile: 0.2,
 starts: 54,
 closerOutsCap: 195,
 leagueStarterOuts: 18,
 teamOuts: 162 * 27,
 omitted: Object.freeze(['baserunning', 'park fit', 'platoon'])
});

/** Replacement levels group the three rotation slots. */
export type PricingRole = Exclude<Slot, 'SP1' | 'SP2' | 'SP3'> | 'SP';
const PRICING_ROLES: readonly PricingRole[] = [...HITTER_SLOTS, 'SP', 'CL', 'BP'];
const pricingRole = (slot: Slot): PricingRole => (STARTER_SLOTS as readonly Slot[]).includes(slot) ? 'SP' : slot as PricingRole;
const roleSlot = (role: PricingRole): Slot => role === 'SP' ? 'SP1' : role;

export interface DraftCardTable {
 schemaVersion: 1;
 salaryVersion: typeof SALARY_VERSION;
 provisional: true;
 method: typeof SALARY_METHOD & {
  hitterPlateAppearances: number;
  bullpenOuts: number;
  /** Season runs at each role's replacement percentile. */
  replacement: Partial<Record<PricingRole, number>>;
 };
 /** Columns aligned to `manifest.candidates`. */
 seasonId: string[];
 year: number[];
 salary: number[];
 finish: Finish[];
 /** Runs above replacement, rounded to 0.1. */
 valueRuns: number[];
 pricedSlot: Slot[];
 /** Bullpen card id to the member player-seasons it aggregates. */
 bullpenMembers: Record<string, string[]>;
}

export interface CardWar { battingWAR162: number | null; pitchingWAR162: number | null }

interface RunValues { perPa: number; outsPerPa: number }

function runValues(rates: Rates, environment: DefensiveEnvironment, weights: EventRunWeights, prior: Float64Array, label: string): RunValues {
 const model = environment.contactModel;
 const fit = fitContact(model.basis, prior, contactTargets(rates), '', 0.5, label);
 const classes = contactClasses(model, fit);
 const contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
 let perPa = (rates[0] + rates[1]) * weights.walk + rates[2] * weights.strikeout;
 let outsPerPa = rates[2];
 for (let cls = 0; cls < classes.length; cls++) {
  perPa += contact * classes[cls] * weights.classes[cls];
  outsPerPa += contact * classes[cls] * weights.classOuts[cls];
 }
 return { perPa, outsPerPa };
}

function percentile(values: number[], share: number): number {
 const sorted = [...values].sort((a, b) => a - b);
 return sorted[Math.floor(share * (sorted.length - 1))];
}

function finishRole(slot: Slot): FinishRole {
 const role = pricingRole(slot);
 return role === 'SP' ? 'starter' : role === 'CL' ? 'closer' : role === 'BP' ? 'bullpen' : 'hitter';
}

/**
 * Prices every candidate by modeled season runs above its role's replacement level: shared-engine
 * linear weights against a league-average opponent in a neutral park, plus fielding runs at the
 * position, scaled by the role's workload. Finish is cosmetic and never enters the price.
 */
export function buildDraftCardTable(candidates: readonly Profile[], environment: DefensiveEnvironment, war: (seasonId: string) => CardWar | undefined): DraftCardTable {
 const league = environment.leagueRates;
 const reference = getPhysicalReference(environment);
 const weights = eventRunWeights(reference);
 const prior = leagueContactFit(environment.contactModel, league).regionWeights;
 const average = { seasonId: 'league', bats: '', throws: '', battingRates: league, pitchingRates: league, speed: 0.5 } as unknown as Profile;
 const hitterPlateAppearances = 162 * 9 * reference.stateVisits.reduce((sum, value) => sum + value, 0) / 9;
 const bullpenOuts = SALARY_METHOD.teamOuts - STARTER_SLOTS.length * SALARY_METHOD.starts * SALARY_METHOD.leagueStarterOuts - SALARY_METHOD.closerOutsCap;

 // Season runs relative to league average at each eligible role.
 const seasonRuns = candidates.map(profile => {
  const runs = new Map<PricingRole, number>();
  const roles = new Set(profile.eligibleSlots.map(pricingRole));
  if ([...roles].some(role => (HITTER_SLOTS as readonly string[]).includes(role))) {
   if (!profile.battingRates) throw new Error(`${profile.seasonId}: hitter has no batting rates`);
   const batting = runValues(matchup(profile, average, league), environment, weights, prior, profile.seasonId).perPa * hitterPlateAppearances;
   for (const role of roles) {
    if (role === 'DH') runs.set(role, batting);
    else if ((HITTER_SLOTS as readonly string[]).includes(role)) runs.set(role, batting + (profile.defense.positions[role as Exclude<PricingRole, 'DH' | 'SP' | 'CL' | 'BP'>]?.expectedRunsSaved162 ?? 0));
   }
  }
  const pitcherRoles = [...roles].filter(role => role === 'SP' || role === 'CL' || role === 'BP');
  if (pitcherRoles.length) {
   if (!profile.pitchingRates) throw new Error(`${profile.seasonId}: pitcher has no pitching rates`);
   const allowed = runValues(matchup(average, profile, league), environment, weights, prior, profile.seasonId);
   const savedPerOut = -allowed.perPa / allowed.outsPerPa;
   for (const role of pitcherRoles) {
    const outs = role === 'SP' ? SALARY_METHOD.starts * starterBudget(profile) : role === 'CL' ? Math.min(closerBudget(profile), SALARY_METHOD.closerOutsCap) : bullpenOuts;
    runs.set(role, savedPerOut * outs);
   }
  }
  if (!runs.size) throw new Error(`${profile.seasonId}: card has no priced role`);
  for (const value of runs.values()) if (!Number.isFinite(value)) throw new Error(`${profile.seasonId}: non-finite run value`);
  return runs;
 });

 const replacement: Partial<Record<PricingRole, number>> = {};
 for (const role of PRICING_ROLES) {
  const values = seasonRuns.flatMap(runs => runs.has(role) ? [runs.get(role)!] : []);
  if (values.length) replacement[role] = percentile(values, SALARY_METHOD.replacementPercentile);
 }

 const table: DraftCardTable = {
  schemaVersion: 1, salaryVersion: SALARY_VERSION, provisional: true,
  method: { ...SALARY_METHOD, hitterPlateAppearances, bullpenOuts, replacement },
  seasonId: [], year: [], salary: [], finish: [], valueRuns: [], pricedSlot: [], bullpenMembers: {}
 };
 candidates.forEach((profile, index) => {
  let best: { role: PricingRole; value: number } | null = null;
  for (const [role, runs] of seasonRuns[index]) {
   const value = runs - replacement[role]!;
   if (!best || value > best.value || (value === best.value && PRICING_ROLES.indexOf(role) < PRICING_ROLES.indexOf(best.role))) best = { role, value };
  }
  const valueRuns = Math.round(best!.value * 10) / 10;
  const slot = roleSlot(best!.role);
  const cardWar = war(profile.seasonId);
  table.seasonId.push(profile.seasonId);
  table.year.push(profile.year);
  table.valueRuns.push(valueRuns);
  table.pricedSlot.push(slot);
  table.salary.push(SALARY_METHOD.minSalary + Math.round(SALARY_METHOD.pricePerRun * Math.max(0, valueRuns)));
  table.finish.push(finishFor(finishRole(slot), cardWar?.battingWAR162, cardWar?.pitchingWAR162));
  if (profile.bullpen) table.bullpenMembers[profile.seasonId] = profile.bullpen.members.map(member => member.seasonId);
 });
 return table;
}
