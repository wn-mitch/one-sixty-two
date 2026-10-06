import { POSITIONS, type FieldingCounts, type Position, type Profile } from '../../src/lib/game/types.ts';
import { inEra, leagueKey, numberField, seasonKey, type Row, type Tables } from './counts.ts';

const empty = (): FieldingCounts => ({ PO: 0, A: 0, E: 0, SB: 0, CS: 0, InnOuts: 0 });
interface FieldRecord { counts: FieldingCounts; reliability: boolean; catcher: boolean; innings: boolean }
export interface FieldingData {
 exact: Map<string, FieldRecord>; generic: Map<string, FieldRecord>;
 league: Map<string, FieldRecord>; appearances: Map<string, Partial<Record<Position, number>>>;
}
const fieldKey = (id: string, position: string): string => `${id}:${position}`;
function accumulate(map: Map<string, FieldRecord>, key: string, row: Row): void {
 const record = map.get(key) ?? { counts: empty(), reliability: true, catcher: true, innings: true };
 for (const column of ['PO', 'A', 'E', 'SB', 'CS', 'InnOuts'] as const) {
  const value = numberField(row, column);
  if (value === undefined) {
   if (column === 'PO' || column === 'A' || column === 'E') record.reliability = false;
   if (column === 'SB' || column === 'CS') record.catcher = false;
   if (column === 'InnOuts') record.innings = false;
  } else record.counts[column] += value;
 }
 map.set(key, record);
}

export function buildFielding(tables: Tables): FieldingData {
 const exact: FieldingData['exact'] = new Map();
 const generic: FieldingData['generic'] = new Map();
 const league: FieldingData['league'] = new Map();
 const appearances: FieldingData['appearances'] = new Map();
 // OF splits are the authoritative exact outfield rows, never additive to generic OF.
 const splits = new Set(tables.FieldingOFsplit.filter(inEra).map(row => fieldKey(seasonKey(row), row.POS)));
 const splitRows = new Set(tables.FieldingOFsplit);
 for (const row of [...tables.Fielding, ...tables.FieldingOFsplit]) {
  if (!inEra(row)) continue;
  const position = row.POS;
  const id = seasonKey(row);
  if (position === 'OF') {
   accumulate(generic, id, row);
   if (['PO', 'A', 'E'].every(column => numberField(row, column) !== undefined)) accumulate(league, fieldKey(leagueKey(row), position), row);
   continue;
  }
  if (!POSITIONS.includes(position as Position)) continue;
  if (!splitRows.has(row) && splits.has(fieldKey(id, position))) continue;
  accumulate(exact, fieldKey(id, position), row);
  // League estimates use only complete exact-position evidence.
  if (['PO', 'A', 'E'].every(column => numberField(row, column) !== undefined)) {
   const catcherEvidence = position === 'C' && (numberField(row, 'SB') === undefined || numberField(row, 'CS') === undefined)
    ? { ...row, SB: '', CS: '' } : row;
   accumulate(league, fieldKey(leagueKey(row), position), catcherEvidence);
   if (row.yearID === '2025') accumulate(league, fieldKey('2025:ALL', position), catcherEvidence);
  }
 }
 for (const row of tables.Appearances) {
  if (!inEra(row)) continue;
  const id = seasonKey(row);
  if (appearances.has(id)) throw new Error(`Duplicate Appearances team-season: ${id}`);
  const counts: Partial<Record<Position, number>> = {};
  for (const position of POSITIONS) {
   const count = numberField(row, `G_${position.toLowerCase()}`);
   if (count !== undefined) counts[position] = count;
  }
  appearances.set(id, counts);
 }
 return { exact, generic, league, appearances };
}

export function leagueFielding(data: FieldingData, key: string): { errors: Record<Position, number>; catcherCS: number; catcherPrior2025: boolean } {
 const errors = {} as Record<Position, number>;
 for (const position of POSITIONS) {
  const record = data.league.get(fieldKey(key, position))
   ?? (['LF', 'CF', 'RF'].includes(position) ? data.league.get(fieldKey(key, 'OF')) : undefined);
  if (!record) throw new Error(`Missing positional fielding baseline: ${key}:${position}`);
  const { PO, A, E } = record.counts;
  if (PO + A + E <= 0) throw new Error(`Empty positional fielding baseline: ${key}:${position}`);
  errors[position] = E / (PO + A + E);
 }
 let catcher = data.league.get(fieldKey(key, 'C'))!.counts;
 const catcherPrior2025 = catcher.SB + catcher.CS === 0;
 if (catcherPrior2025) catcher = data.league.get(fieldKey('2025:ALL', 'C'))!.counts;
 const attempts = catcher.SB + catcher.CS;
 if (!attempts) throw new Error(`Missing catcher baseline: ${key}`);
 return { errors, catcherCS: catcher.CS / attempts, catcherPrior2025 };
}

export function applyFielding(profile: Profile, data: FieldingData): void {
 const baseline = leagueFielding(data, `${profile.year}:${profile.league}`);
 if (baseline.catcherPrior2025) profile.estimatedFields.push('catcherCS.prior2025');
 profile.appearances = data.appearances.get(profile.seasonId) ?? {};
 for (const position of POSITIONS) {
  let record = data.exact.get(fieldKey(profile.seasonId, position));
  let genericOutfield = false;
  if (!record?.reliability && ['LF', 'CF', 'RF'].includes(position)) {
   record = data.generic.get(profile.seasonId);
   if (record?.reliability) {
    genericOutfield = true;
    profile.estimatedFields.push(`fielding.${position}.genericOF`);
   }
  }
  if (record?.reliability) {
   const counts = record.counts;
   if (!genericOutfield) profile.fielding[position] = { ...counts };
   if (!record.innings) profile.estimatedFields.push(`fielding.${position}.InnOuts.unavailable`);
   profile.errorRates[position] = (counts.E + 100 * baseline.errors[position]) / (counts.PO + counts.A + counts.E + 100);
  } else {
   profile.errorRates[position] = baseline.errors[position];
   profile.estimatedFields.push(`fielding.${position}.league`);
  }
 }
 const catcher = data.exact.get(fieldKey(profile.seasonId, 'C'));
 if (catcher?.catcher) profile.catcherCS = (catcher.counts.CS + 10 * baseline.catcherCS) / (catcher.counts.SB + catcher.counts.CS + 10);
 else { profile.catcherCS = baseline.catcherCS; profile.estimatedFields.push('catcherCS.league'); }
}
