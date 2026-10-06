import { MAX_SEASON_YEAR, MIN_SEASON_YEAR, type BattingCounts, type PitchingCounts } from '../../src/lib/game/types.ts';

export type Row = Record<string, string>;
export type Tables = Record<string, Row[]>;
export interface Group { row: Row; values: Record<string, number>; missing: Set<string>; invalid: string[] }
export const battingColumns = ['AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SO', 'SH', 'SF', 'SB', 'CS', 'GIDP'];
export const pitchingColumns = ['G', 'GS', 'IPouts', 'H', 'HR', 'BB', 'HBP', 'SO', 'BFP', 'ER', 'SV'];
export const teamKey = (row: Row): string => `${row.yearID}:${row.lgID}:${row.teamID}`;
export const seasonKey = (row: Row): string => `${row.playerID}:${teamKey(row)}`;
export const leagueKey = (row: Row): string => `${row.yearID}:${row.lgID}`;
export const inEra = (row: Row): boolean => (row.lgID === 'AL' || row.lgID === 'NL') && Number(row.yearID) >= MIN_SEASON_YEAR && Number(row.yearID) <= MAX_SEASON_YEAR;

export function numberField(row: Row, column: string): number | undefined {
 const raw = row[column];
 if (raw === undefined || raw.trim() === '') return undefined;
 const value = Number(raw);
 return Number.isFinite(value) && value >= 0 && Number.isInteger(value) ? value : undefined;
}

/** Stints are summed by exact player/year/league/team, never by player-year. */
export function groupCounts(rows: Row[], columns: string[]): Map<string, Group> {
 const groups = new Map<string, Group>();
 for (const row of rows) {
  if (!inEra(row)) continue;
  const key = seasonKey(row);
  let group = groups.get(key);
  if (!group) {
   group = { row, values: Object.fromEntries(columns.map(column => [column, 0])), missing: new Set(), invalid: [] };
   groups.set(key, group);
  }
  for (const column of columns) {
   const value = numberField(row, column);
   if (value === undefined) {
    group.missing.add(column);
    if (row[column]?.trim()) group.invalid.push(column);
   } else group.values[column] += value;
  }
 }
 return groups;
}

export function rejectCore(group: Group, fields: string[]): void {
 const invalid = [...new Set([...group.invalid, ...fields.filter(field => group.missing.has(field))])];
 if (invalid.length) throw new Error(`Missing or malformed counts: ${invalid.join(',')}`);
}

export function battingCounts(group: Group): BattingCounts {
 rejectCore(group, ['AB', 'H', '2B', '3B', 'HR', 'BB', 'HBP', 'SO', 'SH']);
 const n = group.values;
 if (n.H > n.AB || n.SO > n.AB) throw new Error('Batting hits or strikeouts exceed at-bats');
 return { AB: n.AB, H: n.H, doubles: n['2B'], triples: n['3B'], HR: n.HR, BB: n.BB, HBP: n.HBP, SO: n.SO, SH: n.SH, SF: n.SF, SB: n.SB, CS: n.CS, GIDP: n.GIDP, PA: n.AB + n.BB + n.HBP + n.SH + n.SF };
}

export function pitchingCounts(group: Group): PitchingCounts {
 rejectCore(group, ['G', 'GS', 'IPouts', 'H', 'HR', 'BB', 'SO']);
 const n = group.values;
 if (n.GS > n.G) throw new Error('Pitcher starts exceed games');
 return { G: n.G, GS: n.GS, IPouts: n.IPouts, H: n.H, HR: n.HR, BB: n.BB, HBP: n.HBP, SO: n.SO, BFP: group.missing.has('BFP') ? n.IPouts + n.H + n.BB + n.HBP : n.BFP, ER: n.ER, SV: n.SV };
}
