import { POSITIONS, type DefensiveEnvironment, type DefensiveEvidence, type DefensivePosition, type DefensiveSkillName, type DefensiveSkills, type Position, type Profile } from '../../src/lib/game/types.ts';
import { createDefensiveReference, expectedDefensiveRuns, type DefensiveReference } from '../../src/lib/sim/defense.ts';
import type { CsvRow } from './acquire.ts';
import type { FieldingCohort, FieldingData, FieldRecord } from './fielding.ts';
import { parseNullableNumber, scheduledGames, sourceRole, type GroupedWarRows, type SourceJoinDiagnostics } from './source-join.ts';

const INFIELD_POSITIONS: readonly Position[] = ['1B', '2B', '3B', 'SS'];
const OUTFIELD_POSITIONS: readonly Position[] = ['LF', 'CF', 'RF'];
const FIELDING_SOURCE_POSITION_COLUMNS = ['gms_C', 'gms_1B', 'gms_2B', 'gms_3B', 'gms_SS', 'gms_LF', 'gms_CF', 'gms_RF', 'gms_OF'] as const;
const SKILLS: readonly DefensiveSkillName[] = ['hitPrevention', 'doublePlay', 'outfieldThrowing', 'errorAvoidance', 'catcherThrowing'];
const COHORT_MIN_INNING_OUTS = 4374;
const COHORT_MIN_ERROR_CHANCES = 1000;
const COHORT_MIN_CATCHER_ATTEMPTS = 100;

interface AggregateBudget {
 budget: number | null;
 exposure: number;
 reason?: string;
}

export interface DefensiveCompilationDiagnostics extends SourceJoinDiagnostics {
 aggregateAvailable: number;
 aggregateUnavailable: number;
 residualClamped: number;
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
const exactKey = (seasonId: string, position: Position): string => `${seasonId}:${position}`;
const cohortKey = (year: number, league: string, position: Position | 'OF'): string => `${year}:${league}:${position}`;

function applicable(position: Position, skill: DefensiveSkillName): boolean {
 if (skill === 'hitPrevention' || skill === 'errorAvoidance') return true;
 if (skill === 'doublePlay') return INFIELD_POSITIONS.includes(position);
 if (skill === 'outfieldThrowing') return OUTFIELD_POSITIONS.includes(position);
 return position === 'C';
}

function unavailable(reason: string, exposure = 0): DefensiveEvidence {
 return { status: 'neutralMissingEvidence', exposure, reason };
}

function notApplicable(): DefensiveEvidence {
 return { status: 'notApplicable', exposure: 0 };
}

function cohortFor(
 data: FieldingData,
 profile: Profile,
 position: Position | 'OF',
 sufficient: (cohort: FieldingCohort) => boolean
): FieldingCohort | null {
 const league = data.cohorts.get(cohortKey(profile.year, profile.league, position));
 if (league && sufficient(league)) return league;
 const combined = data.cohorts.get(cohortKey(profile.year, 'ALL', position));
 return combined && sufficient(combined) ? combined : null;
}

function normalizedError(profile: Profile, position: Position, record: FieldRecord | undefined, data: FieldingData): { value: number; evidence: DefensiveEvidence } {
 if (!record?.complete.errors) return { value: 0, evidence: unavailable('Exact-position handled-chance evidence is incomplete or unavailable.') };
 const exposure = record.counts.PO + record.counts.A + record.counts.E;
 if (exposure <= 0) return { value: 0, evidence: unavailable('Exact-position handled-chance exposure is zero.') };
 const cohort = cohortFor(data, profile, position, item => (item.errors ? item.errors.PO + item.errors.A + item.errors.E : 0) >= COHORT_MIN_ERROR_CHANCES);
 if (!cohort?.errors) return { value: 0, evidence: unavailable('The year/position error cohort has insufficient complete exposure.', exposure) };
 const cohortExposure = cohort.errors.PO + cohort.errors.A + cohort.errors.E;
 const historical = cohort.errors.E / cohortExposure;
 const smoothed = (record.counts.E + 300 * historical) / (exposure + 300);
 return { value: clamp((historical - smoothed) / 0.02, -1, 1), evidence: { status: 'exact', exposure } };
}

function normalizedDoublePlay(profile: Profile, position: Position, record: FieldRecord | undefined, data: FieldingData): { value: number; evidence: DefensiveEvidence } {
 if (!record?.complete.doublePlay || !record.complete.innings) return { value: 0, evidence: unavailable('Exact-position double-play or innings evidence is incomplete or unavailable.') };
 const exposure = record.counts.InnOuts;
 if (exposure <= 0) return { value: 0, evidence: unavailable('Exact-position double-play exposure is zero.') };
 const cohort = cohortFor(data, profile, position, item => (item.doublePlay?.InnOuts ?? 0) >= COHORT_MIN_INNING_OUTS);
 const baseline = cohort?.doublePlay && cohort.doublePlay.InnOuts > 0 ? cohort.doublePlay.DP / cohort.doublePlay.InnOuts : 0;
 if (!(baseline > 0)) return { value: 0, evidence: unavailable('The year/position double-play cohort has insufficient complete exposure.', exposure) };
 const smoothed = (record.counts.DP + 2700 * baseline) / (exposure + 2700);
 return { value: clamp((smoothed / baseline - 1) / 0.5, -1, 1), evidence: { status: 'exact', exposure } };
}

function normalizedArm(profile: Profile, position: Position, exact: FieldRecord | undefined, generic: FieldRecord | undefined, data: FieldingData): { value: number; evidence: DefensiveEvidence } {
 let record = exact;
 let cohortPosition: Position | 'OF' = position;
 let status: DefensiveEvidence['status'] = 'exact';
 let strength = 1;
 if (!record?.complete.arm || !record.complete.innings) {
  record = generic;
  cohortPosition = 'OF';
  status = 'genericOutfield';
  strength = 0.5;
 }
 if (!record?.complete.arm || !record.complete.innings) return { value: 0, evidence: unavailable('Exact and generic-outfield assist or innings evidence is incomplete or unavailable.') };
 const exposure = record.counts.InnOuts;
 if (exposure <= 0) return { value: 0, evidence: unavailable('Outfield throwing exposure is zero.') };
 const cohort = cohortFor(data, profile, cohortPosition, item => (item.arm?.InnOuts ?? 0) >= COHORT_MIN_INNING_OUTS);
 const baseline = cohort?.arm && cohort.arm.InnOuts > 0 ? cohort.arm.A / cohort.arm.InnOuts : 0;
 if (!(baseline > 0)) return { value: 0, evidence: unavailable('The year/outfield assist cohort has insufficient complete exposure.', exposure) };
 const smoothed = (record.counts.A + 2700 * baseline) / (exposure + 2700);
 return { value: strength * clamp((smoothed / baseline - 1) / 0.5, -1, 1), evidence: { status, exposure } };
}

function normalizedCatcher(profile: Profile, record: FieldRecord | undefined, data: FieldingData): { value: number; evidence: DefensiveEvidence } {
 if (!record?.complete.catcher) return { value: 0, evidence: unavailable('Exact catcher stolen-base evidence is incomplete or unavailable.') };
 const exposure = record.counts.SB + record.counts.CS;
 if (exposure <= 0) return { value: 0, evidence: unavailable('Catcher throwing exposure is zero.') };
 const cohort = cohortFor(data, profile, 'C', item => (item.catcher ? item.catcher.SB + item.catcher.CS : 0) >= COHORT_MIN_CATCHER_ATTEMPTS);
 const attempts = cohort?.catcher ? cohort.catcher.SB + cohort.catcher.CS : 0;
 if (!cohort?.catcher || attempts <= 0) return { value: 0, evidence: unavailable('The year/catcher throwing cohort has insufficient complete exposure.', exposure) };
 const historical = cohort.catcher.CS / attempts;
 const smoothed = (record.counts.CS + 50 * historical) / (exposure + 50);
 return { value: clamp((smoothed - historical) / 0.2, -1, 1), evidence: { status: 'exact', exposure } };
}

function sourceDefensiveGames(row: CsvRow): number | null {
 let total = 0;
 for (const column of FIELDING_SOURCE_POSITION_COLUMNS) {
  const value = parseNullableNumber(row, column);
  if (value === null || value < 0) return null;
  total += value;
 }
 return total;
}

function aggregateBudget(profile: Profile, sourceRows: CsvRow[] | undefined, fielding: FieldingData): AggregateBudget {
 if (!sourceRows?.length) return { budget: null, exposure: 0, reason: 'No complete-season aggregate fielding source row joined to this team-season.' };
 let accumulatedRuns = 0;
 let hasDefensiveRow = false;
 for (const row of sourceRows) {
  const games = sourceDefensiveGames(row);
  if (games === null) return { budget: null, exposure: 0, reason: 'Aggregate source position appearances are incomplete.' };
  if (games === 0) continue;
  hasDefensiveRow = true;
  if (sourceRole(row, 'pitching')) return { budget: null, exposure: 0, reason: 'Pitching and non-pitching aggregate fielding roles cannot be separated reliably.' };
  const fld162 = parseNullableNumber(row, 'fld162');
  const schedule = scheduledGames(row);
  if (fld162 === null || schedule <= 0) return { budget: null, exposure: 0, reason: 'Aggregate fielding runs or scheduled games are incomplete.' };
  accumulatedRuns += fld162 * schedule / 162;
 }
 if (!hasDefensiveRow) return { budget: null, exposure: 0, reason: 'The aggregate source has no non-pitcher defensive exposure.' };
 let exposure = 0;
 for (const position of POSITIONS) {
  if (OUTFIELD_POSITIONS.includes(position) || (profile.appearances[position] ?? 0) <= 0) continue;
  const record = fielding.exact.get(exactKey(profile.seasonId, position));
  if (!record?.complete.innings) return { budget: null, exposure: 0, reason: `Exact ${position} innings evidence is incomplete or unavailable.` };
  if (record.counts.InnOuts <= 0) return { budget: null, exposure: 0, reason: `Exact ${position} innings exposure is zero.` };
  exposure += record.counts.InnOuts;
 }
 const outfieldPositions = OUTFIELD_POSITIONS.filter(position => (profile.appearances[position] ?? 0) > 0);
 const exactOutfield = outfieldPositions.map(position => fielding.exact.get(exactKey(profile.seasonId, position)));
 if (exactOutfield.some(Boolean)) {
  for (let index = 0; index < outfieldPositions.length; index++) {
   const record = exactOutfield[index];
   if (!record?.complete.innings) return { budget: null, exposure: 0, reason: `Exact ${outfieldPositions[index]} innings evidence is incomplete or unavailable.` };
   if (record.counts.InnOuts <= 0) return { budget: null, exposure: 0, reason: `Exact ${outfieldPositions[index]} innings exposure is zero.` };
   exposure += record.counts.InnOuts;
  }
 } else if (outfieldPositions.length) {
  const generic = fielding.generic.get(profile.seasonId);
  if (!generic?.complete.innings) return { budget: null, exposure: 0, reason: 'Generic-outfield innings evidence is incomplete or unavailable.' };
  if (generic.counts.InnOuts <= 0) return { budget: null, exposure: 0, reason: 'Generic-outfield innings exposure is zero.' };
  exposure += generic.counts.InnOuts;
 }
 if (exposure <= 0) return { budget: null, exposure: 0, reason: 'Non-pitcher defensive innings exposure is zero.' };
 return { budget: clamp(4374 * accumulatedRuns / (exposure + 2700), -15, 15), exposure };
}

function positionSkills(profile: Profile, position: Position, fielding: FieldingData): { skills: DefensiveSkills; evidence: Record<DefensiveSkillName, DefensiveEvidence> } {
 const exact = fielding.exact.get(exactKey(profile.seasonId, position));
 const generic = fielding.generic.get(profile.seasonId);
 const error = normalizedError(profile, position, exact, fielding);
 const doublePlay = INFIELD_POSITIONS.includes(position) ? normalizedDoublePlay(profile, position, exact, fielding) : { value: 0, evidence: notApplicable() };
 const arm = OUTFIELD_POSITIONS.includes(position) ? normalizedArm(profile, position, exact, generic, fielding) : { value: 0, evidence: notApplicable() };
 const catcher = position === 'C' ? normalizedCatcher(profile, exact, fielding) : { value: 0, evidence: notApplicable() };
 return {
  skills: { hitPrevention: 0, doublePlay: doublePlay.value, outfieldThrowing: arm.value, errorAvoidance: error.value, catcherThrowing: catcher.value },
  evidence: { hitPrevention: unavailable('Aggregate fielding evidence has not been applied.'), doublePlay: doublePlay.evidence, outfieldThrowing: arm.evidence, errorAvoidance: error.evidence, catcherThrowing: catcher.evidence }
 };
}

function residualizedPosition(
 reference: DefensiveReference,
 profile: Profile,
 position: Position,
 fielding: FieldingData,
 aggregate: AggregateBudget
): DefensivePosition {
 const { skills, evidence } = positionSkills(profile, position, fielding);
 for (const skill of SKILLS) if (!applicable(position, skill)) evidence[skill] = notApplicable();
 if (aggregate.budget === null) {
  evidence.hitPrevention = unavailable(aggregate.reason ?? 'Aggregate fielding evidence is unavailable.');
  return { ...skills, evidence, expectedRunsSaved162: null, residualClamped: false };
 }
 evidence.hitPrevention = { status: 'exact', exposure: aggregate.exposure };
 const neutral = expectedDefensiveRuns(reference, position, skills);
 const positive = expectedDefensiveRuns(reference, position, { ...skills, hitPrevention: 1 });
 const negative = expectedDefensiveRuns(reference, position, { ...skills, hitPrevention: -1 });
 let raw = 0;
 if (aggregate.budget > neutral) {
  const slope = positive - neutral;
  if (!Number.isFinite(slope) || slope <= 0) throw new Error(`Nonpositive defensive reference slope: ${profile.seasonId}:${position}:positive`);
  raw = (aggregate.budget - neutral) / slope;
 } else if (aggregate.budget < neutral) {
  const slope = neutral - negative;
  if (!Number.isFinite(slope) || slope <= 0) throw new Error(`Nonpositive defensive reference slope: ${profile.seasonId}:${position}:negative`);
  raw = -(neutral - aggregate.budget) / slope;
 }
 const hitPrevention = clamp(raw, -1, 1);
 const expectedRunsSaved162 = expectedDefensiveRuns(reference, position, { ...skills, hitPrevention });
 if (!Number.isFinite(expectedRunsSaved162)) throw new Error(`Non-finite defensive estimate: ${profile.seasonId}:${position}`);
 return { ...skills, hitPrevention, evidence, expectedRunsSaved162: Object.is(expectedRunsSaved162, -0) ? 0 : expectedRunsSaved162, residualClamped: raw < -1 || raw > 1 };
}

/** Compiles all current defensive inputs onto canonical profiles in place. */
export function applyDefense(
 profiles: Profile[],
 fielding: FieldingData,
 source: GroupedWarRows,
 environment: DefensiveEnvironment
): DefensiveCompilationDiagnostics {
 const reference = createDefensiveReference(environment);
 let aggregateAvailable = 0;
 let aggregateUnavailable = 0;
 let residualClamped = 0;
 for (const profile of profiles) {
  profile.defense = { positions: {} };
  if (!profile.batting) continue;
  const aggregate = aggregateBudget(profile, source.bySeason.get(profile.seasonId), fielding);
  for (const position of POSITIONS) {
   if ((profile.appearances[position] ?? 0) <= 0 && !profile.eligibleSlots.includes(position)) continue;
   const defensive = residualizedPosition(reference, profile, position, fielding, aggregate);
   profile.defense.positions[position] = defensive;
   if (defensive.expectedRunsSaved162 === null) aggregateUnavailable++;
   else aggregateAvailable++;
   if (defensive.residualClamped) residualClamped++;
  }
 }
 return { ...source.diagnostics, aggregateAvailable, aggregateUnavailable, residualClamped };
}
