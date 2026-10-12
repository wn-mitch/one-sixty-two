import { finishFor, type Finish, type FinishRole } from '../cards/finish.ts';
import { HITTER_SLOTS, STARTER_SLOTS, type DefensiveEnvironment, type HitterSlot, type Position, type Profile, type Rates, type Slot } from '../game/types.ts';
import { createContactReference, type ContactReference, type EventRunWeights, type MatchupFit, type MatchupQuery, type ParkRunValue } from '../engine/node.ts';
import { closerBudget, starterBudget } from '../sim/workload.ts';
import { neutralPark, stadiumRef } from '../sim/park.ts';
import type { StadiumConfig } from '../sim/park-types.ts';
import { HOME_SHARE, PARK_FIT_VERSION, type ParkFitTable } from './park-fit.ts';
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

/** Replacement levels group the three rotation slots, and the closer with the named relievers. */
export type PricingRole = HitterSlot | 'SP' | 'CL';
const PRICING_ROLES: readonly PricingRole[] = [...HITTER_SLOTS, 'SP', 'CL'];
const pricingRole = (slot: Slot): PricingRole => (STARTER_SLOTS as readonly Slot[]).includes(slot) ? 'SP' : slot === 'CL' || slot.startsWith('RP') ? 'CL' : slot as HitterSlot;
const roleSlot = (role: PricingRole): Slot => role === 'SP' ? 'SP1' : role;

export interface DraftCardTable {
 schemaVersion: 1;
 salaryVersion: typeof SALARY_VERSION;
 provisional: true;
 method: typeof SALARY_METHOD & {
  hitterPlateAppearances: number;
  /** Season runs at each role's replacement percentile. */
  replacement: Partial<Record<PricingRole, number>>;
 };
 /** Columns aligned to the draftable manifest candidates (`draftableCandidates`). */
 seasonId: string[];
 year: number[];
 salary: number[];
 finish: Finish[];
 /** Runs above replacement, rounded to 0.1. */
 valueRuns: number[];
 pricedSlot: Slot[];
}

export interface CardWar { battingWAR162: number | null; pitchingWAR162: number | null }

interface RunValues { perPa: number; outsPerPa: number }

/** Run value per plate appearance and outs per plate appearance for one fitted matchup. */
function runValues({ rates, classes }: MatchupFit, weights: EventRunWeights): RunValues {
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
 return role === 'SP' ? 'starter' : role === 'CL' ? 'closer' : 'hitter';
}

/**
 * Prices every candidate by modeled season runs above its role's replacement level: shared-engine
 * linear weights against a league-average opponent in a neutral park, plus fielding runs at the
 * position, scaled by the role's workload. Named relievers price as closers. Finish is cosmetic
 * and never enters the price. `candidates` are the draftable ones; team bullpens are not priced.
 */
export function buildDraftCardTable(candidates: readonly Profile[], environment: DefensiveEnvironment, war: (seasonId: string) => CardWar | undefined): DraftCardTable {
 const league = environment.leagueRates;
 const reference = createContactReference(environment);
 const weights = reference.eventRunWeights();
 const hitterPlateAppearances = 162 * 9 * reference.stateVisits().reduce((sum, value) => sum + value, 0) / 9;
 // Each role prices against a league-average opponent at unknown side and average speed.
 const query = (battingRates: Rates, pitchingRates: Rates, label: string): MatchupQuery => ({ battingRates, bats: '', pitchingRates, throws: '', speed: 0.5, unknownSide: true, label });
 const queries: MatchupQuery[] = [];
 const pricedRoles = candidates.map(profile => {
  if (profile.bullpen) throw new Error(`${profile.seasonId}: team bullpens are not draftable`);
  return new Set(profile.eligibleSlots.map(slot => pricingRole(slot as Slot)));
 });
 const pricesHitter = (roles: Set<PricingRole>) => [...roles].some(role => (HITTER_SLOTS as readonly string[]).includes(role));
 const pricesPitcher = (roles: Set<PricingRole>) => roles.has('SP') || roles.has('CL');
 candidates.forEach((profile, index) => {
  if (pricesHitter(pricedRoles[index]) && profile.battingRates) queries.push(query(profile.battingRates, league, profile.seasonId));
  if (pricesPitcher(pricedRoles[index]) && profile.pitchingRates) queries.push(query(league, profile.pitchingRates, profile.seasonId));
 });
 const fits = reference.fitMatchups(queries);
 let nextFit = 0;

 // Season runs relative to league average at each eligible role.
 const seasonRuns = candidates.map((profile, index) => {
  const runs = new Map<PricingRole, number>();
  const roles = pricedRoles[index];
  const battingFit = pricesHitter(roles) && profile.battingRates ? fits[nextFit++] : null;
  const pitchingFit = pricesPitcher(roles) && profile.pitchingRates ? fits[nextFit++] : null;
  if (pricesHitter(roles)) {
   if (!battingFit) throw new Error(`${profile.seasonId}: hitter has no batting rates`);
   const batting = runValues(battingFit, weights).perPa * hitterPlateAppearances;
   for (const role of roles) {
    if (role === 'DH') runs.set(role, batting);
    else if ((HITTER_SLOTS as readonly string[]).includes(role)) runs.set(role, batting + (profile.defense.positions[role as Position]?.expectedRunsSaved162 ?? 0));
   }
  }
  const pitcherRoles = [...roles].filter(role => role === 'SP' || role === 'CL');
  if (pitcherRoles.length) {
   if (!pitchingFit) throw new Error(`${profile.seasonId}: pitcher has no pitching rates`);
   const allowed = runValues(pitchingFit, weights);
   const savedPerOut = -allowed.perPa / allowed.outsPerPa;
   for (const role of pitcherRoles) {
    const outs = role === 'SP' ? SALARY_METHOD.starts * starterBudget(profile) : Math.min(closerBudget(profile), SALARY_METHOD.closerOutsCap);
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
  method: { ...SALARY_METHOD, hitterPlateAppearances, replacement },
  seasonId: [], year: [], salary: [], finish: [], valueRuns: [], pricedSlot: []
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
 });
 return table;
}

const isHitterSlot = (slot: Slot): boolean => (HITTER_SLOTS as readonly Slot[]).includes(slot);

/**
 * Prices how each card plays in every home park. A card's contact fit is played out in the park
 * and the neutral park; its change, less the same change for a league-average player in that
 * role, is scaled to the card's priced workload over the home half of the season. Hitters gain
 * runs scored per plate appearance; pitchers gain runs saved per out. Positive is a better fit.
 * `parkBasis` traces a park, normally through a cache, since each trace takes seconds.
 */
export function buildParkFits(candidates: readonly Profile[], environment: DefensiveEnvironment, stadiums: readonly StadiumConfig[], table: DraftCardTable, parkBasis: (reference: ContactReference, stadium: StadiumConfig) => Float64Array): ParkFitTable[] {
 const league = environment.leagueRates;
 const reference = createContactReference(environment);
 const query = (profile: Profile, slot: Slot): MatchupQuery => isHitterSlot(slot)
  ? { battingRates: profile.battingRates!, bats: profile.bats, pitchingRates: league, throws: '', speed: 0.5, unknownSide: true, label: profile.seasonId }
  : { battingRates: league, bats: '', pitchingRates: profile.pitchingRates!, throws: '', speed: 0.5, unknownSide: true, label: profile.seasonId };
 const queries = [
  { battingRates: league, bats: '', pitchingRates: league, throws: '', speed: 0.5, unknownSide: true, label: 'league' },
  ...candidates.map((profile, index) => {
   if (table.seasonId[index] !== profile.seasonId) throw new Error(`Park fit row ${index} is ${profile.seasonId}, expected ${table.seasonId[index]}`);
   return query(profile, table.pricedSlot[index]);
  })
 ];
 const [neutral, ...parks] = reference.parkRunValues([neutralPark(), ...stadiums].map(stadium => parkBasis(reference, stadium)), queries);
 const perOut = (value: ParkRunValue): number => value.runs / value.outs;
 const { hitterPlateAppearances } = table.method;
 return stadiums.map((stadium, park) => {
  const values = parks[park];
  const leaguePa = values[0].runs - neutral[0].runs;
  const leagueOut = perOut(values[0]) - perOut(neutral[0]);
  const tenths = candidates.map((profile, index) => {
   const slot = table.pricedSlot[index];
   const here = values[index + 1];
   const there = neutral[index + 1];
   let runs: number;
   if (isHitterSlot(slot)) runs = (here.runs - there.runs - leaguePa) * hitterPlateAppearances;
   else {
    const outs = slot === 'CL' ? Math.min(closerBudget(profile), SALARY_METHOD.closerOutsCap) : SALARY_METHOD.starts * starterBudget(profile);
    runs = -(perOut(here) - perOut(there) - leagueOut) * outs;
   }
   if (!Number.isFinite(runs)) throw new Error(`${profile.seasonId}: non-finite park fit at ${stadium.id}`);
   return Math.round(runs * HOME_SHARE * 10);
  });
  return { schemaVersion: 1 as const, parkFitVersion: PARK_FIT_VERSION, franchiseId: stadium.franchiseId, stadium: stadiumRef(stadium), tenths };
 });
}
