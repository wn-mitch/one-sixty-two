import { HITTER_SLOTS, POSITIONS, type FieldingCounts, type HitterSlot, type Position, type Profile } from '../../src/lib/game/types.ts';
import { inEra, numberField, seasonKey, type Row, type Tables } from './counts.ts';

const emptyCounts = (): FieldingCounts => ({ PO: 0, A: 0, E: 0, DP: 0, SB: 0, CS: 0, InnOuts: 0 });

export interface FieldRecord {
 counts: FieldingCounts;
 complete: {
  errors: boolean;
  doublePlay: boolean;
  arm: boolean;
  catcher: boolean;
  innings: boolean;
 };
 year: number;
 league: string;
}
export interface FieldingCohort {
 errors: { PO: number; A: number; E: number } | null;
 doublePlay: { DP: number; InnOuts: number } | null;
 arm: { A: number; InnOuts: number } | null;
 catcher: { SB: number; CS: number } | null;
}


export interface FieldingData {
 exact: Map<string, FieldRecord>;
 generic: Map<string, FieldRecord>;
 cohorts: Map<string, FieldingCohort>;
 appearances: Map<string, Partial<Record<HitterSlot, number>>>;
}

const fieldKey = (id: string, position: string): string => `${id}:${position}`;
const cohortKey = (year: number, league: string, position: string): string => `${year}:${league}:${position}`;

function newRecord(row: Row): FieldRecord {
 return {
  counts: emptyCounts(),
  complete: { errors: true, doublePlay: true, arm: true, catcher: true, innings: true },
  year: Number(row.yearID),
  league: row.lgID
 };
}

function accumulate(map: Map<string, FieldRecord>, key: string, row: Row): void {
 const record = map.get(key) ?? newRecord(row);
 if (record.year !== Number(row.yearID) || record.league !== row.lgID) throw new Error(`Mixed fielding cohort: ${key}`);
 for (const column of ['PO', 'A', 'E', 'DP', 'SB', 'CS', 'InnOuts'] as const) {
  const value = numberField(row, column);
  if (value === undefined) {
   if (column === 'PO' || column === 'A' || column === 'E') record.complete.errors = false;
   if (column === 'DP') record.complete.doublePlay = false;
   if (column === 'A') record.complete.arm = false;
   if (column === 'SB' || column === 'CS') record.complete.catcher = false;
   if (column === 'InnOuts') record.complete.innings = false;
  } else record.counts[column] += value;
 }
 map.set(key, record);
}

function accumulateCohort(map: Map<string, FieldingCohort>, key: string, source: FieldRecord): void {
 const cohort = map.get(key) ?? { errors: null, doublePlay: null, arm: null, catcher: null };
 const counts = source.counts;
 if (source.complete.errors) {
  const errors = cohort.errors ?? { PO: 0, A: 0, E: 0 };
  errors.PO += counts.PO;
  errors.A += counts.A;
  errors.E += counts.E;
  cohort.errors = errors;
 }
 if (source.complete.doublePlay && source.complete.innings) {
  const doublePlay = cohort.doublePlay ?? { DP: 0, InnOuts: 0 };
  doublePlay.DP += counts.DP;
  doublePlay.InnOuts += counts.InnOuts;
  cohort.doublePlay = doublePlay;
 }
 if (source.complete.arm && source.complete.innings) {
  const arm = cohort.arm ?? { A: 0, InnOuts: 0 };
  arm.A += counts.A;
  arm.InnOuts += counts.InnOuts;
  cohort.arm = arm;
 }
 if (source.complete.catcher) {
  const catcher = cohort.catcher ?? { SB: 0, CS: 0 };
  catcher.SB += counts.SB;
  catcher.CS += counts.CS;
  cohort.catcher = catcher;
 }
 map.set(key, cohort);
}

export function buildFielding(tables: Tables): FieldingData {
 const exact: FieldingData['exact'] = new Map();
 const generic: FieldingData['generic'] = new Map();
 const cohorts: FieldingData['cohorts'] = new Map();
 const appearances: FieldingData['appearances'] = new Map();
 // Exact OF split rows take precedence; generic OF rows are retained only as a fallback.
 const splits = new Set(tables.FieldingOFsplit.filter(inEra).map(row => fieldKey(seasonKey(row), row.POS)));
 const splitRows = new Set(tables.FieldingOFsplit);
 for (const row of [...tables.Fielding, ...tables.FieldingOFsplit]) {
  if (!inEra(row)) continue;
  const position = row.POS;
  const id = seasonKey(row);
  if (position === 'OF') {
   accumulate(generic, id, row);
   continue;
  }
  if (!POSITIONS.includes(position as Position)) continue;
  if (!splitRows.has(row) && splits.has(fieldKey(id, position))) continue;
  accumulate(exact, fieldKey(id, position), row);
 }
 // Cohorts aggregate only complete player/team/position records. A missing stint
 // therefore cannot masquerade as a complete rate.
 for (const [key, record] of exact) {
  const position = key.slice(key.lastIndexOf(':') + 1);
  accumulateCohort(cohorts, cohortKey(record.year, record.league, position), record);
  accumulateCohort(cohorts, cohortKey(record.year, 'ALL', position), record);
 }
 for (const record of generic.values()) {
  accumulateCohort(cohorts, cohortKey(record.year, record.league, 'OF'), record);
  accumulateCohort(cohorts, cohortKey(record.year, 'ALL', 'OF'), record);
 }
 for (const row of tables.Appearances) {
  if (!inEra(row)) continue;
  const id = seasonKey(row);
  if (appearances.has(id)) throw new Error(`Duplicate Appearances team-season: ${id}`);
  const counts: Partial<Record<HitterSlot, number>> = {};
  for (const slot of HITTER_SLOTS) {
   const count = numberField(row, `G_${slot.toLowerCase()}`);
   if (count !== undefined) counts[slot] = count;
  }
  appearances.set(id, counts);
 }
 return { exact, generic, cohorts, appearances };
}

export function leagueFielding(data: FieldingData, key: string): { errors: Record<Position, number> } {
 const separator = key.indexOf(':');
 const year = Number(key.slice(0, separator));
 const league = key.slice(separator + 1);
 const errors = {} as Record<Position, number>;
 for (const position of POSITIONS) {
  const record = data.cohorts.get(cohortKey(year, league, position));
  const counts = record?.errors;
  if (!counts) throw new Error(`Missing positional fielding baseline: ${key}:${position}`);
  const { PO, A, E } = counts;
  if (PO + A + E <= 0) throw new Error(`Empty positional fielding baseline: ${key}:${position}`);
  errors[position] = E / (PO + A + E);
 }
 return { errors };
}

export function applyFielding(profile: Profile, data: FieldingData): void {
 const allAppearances = data.appearances.get(profile.seasonId) ?? {};
 profile.appearances = { ...allAppearances };
 profile.primaryHitterSlot = null;
 let mostAppearances = 0;
 for (const slot of HITTER_SLOTS) {
  const count = allAppearances[slot] ?? 0;
  if (count > mostAppearances) {
   mostAppearances = count;
   profile.primaryHitterSlot = slot;
  }
 }
 for (const position of POSITIONS) {
  const record = data.exact.get(fieldKey(profile.seasonId, position));
  if (record) profile.fielding[position] = { ...record.counts };
 }
}
