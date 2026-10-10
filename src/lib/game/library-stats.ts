import { compareId } from './types.ts';
import type { LibraryEntry, SavedBatter, SavedPitcher } from './library.ts';

/** Batting-title and ERA-title thresholds for a 162-game season: 3.1 PA and 1 inning per team game. */
export const QUALIFYING_PA = 502;
export const QUALIFYING_OUTS = 486;

type Entry = Pick<LibraryEntry, 'key' | 'savedAt' | 'nickname' | 'record' | 'runs' | 'stadium' | 'batting' | 'pitching'>;

export interface Leader {
 entryKey: string;
 team: string;
 /** Player label, or null on a team leaderboard. */
 player: string | null;
 seasonId: string | null;
 value: number;
 display: string;
}
export interface Leaderboard { id: string; title: string; note?: string; leaders: Leader[] }
export interface LeaderGroups { teams: Leaderboard[]; batting: Leaderboard[]; pitching: Leaderboard[]; value: Leaderboard[] }

/** A saved club's display name: its nickname, else its record and park. */
export function teamTitle(entry: Pick<LibraryEntry, 'nickname' | 'record' | 'stadium'>): string {
 return entry.nickname ?? `${entry.record.wins}–${entry.record.losses}${entry.stadium ? ` at ${entry.stadium.name}` : ''}`;
}

export const average = (line: Pick<SavedBatter, 'H' | 'AB'>) => line.AB ? line.H / line.AB : 0;
export const onBase = (line: Pick<SavedBatter, 'H' | 'BB' | 'HBP' | 'AB' | 'SF'>) => {
 const chances = line.AB + line.BB + line.HBP + line.SF;
 return chances ? (line.H + line.BB + line.HBP) / chances : 0;
};
export const slugging = (line: Pick<SavedBatter, 'H' | 'doubles' | 'triples' | 'HR' | 'AB'>) =>
 line.AB ? (line.H + line.doubles + 2 * line.triples + 3 * line.HR) / line.AB : 0;
export const ops = (line: Pick<SavedBatter, 'H' | 'BB' | 'HBP' | 'AB' | 'SF' | 'doubles' | 'triples' | 'HR'>) => onBase(line) + slugging(line);
/** Runs allowed per nine innings; the simulation does not separate earned runs. */
export const ra9 = (line: Pick<SavedPitcher, 'R' | 'outs'>) => line.outs ? line.R * 27 / line.outs : 0;

export const rate = (value: number) => value.toFixed(3).replace(/^0(?=\.)/, '');
export const innings = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;

/** Team batting and pitching totals for one saved club. */
export function teamTotals(entry: Entry) {
 const sum = <T>(lines: readonly T[], pick: (line: T) => number) => lines.reduce((total, line) => total + pick(line), 0);
 const batting = {
  PA: sum(entry.batting, line => line.PA), AB: sum(entry.batting, line => line.AB), H: sum(entry.batting, line => line.H),
  doubles: sum(entry.batting, line => line.doubles), triples: sum(entry.batting, line => line.triples), HR: sum(entry.batting, line => line.HR),
  BB: sum(entry.batting, line => line.BB), HBP: sum(entry.batting, line => line.HBP), SF: sum(entry.batting, line => line.SF),
  RBI: sum(entry.batting, line => line.RBI), SB: sum(entry.batting, line => line.SB)
 };
 const pitching = { outs: sum(entry.pitching, line => line.outs), R: sum(entry.pitching, line => line.R), SO: sum(entry.pitching, line => line.SO) };
 return {
  runDifferential: entry.runs.scored - entry.runs.allowed,
  avg: average(batting), obp: onBase(batting), slg: slugging(batting), ops: ops(batting),
  HR: batting.HR, SB: batting.SB, SO: pitching.SO,
  runsPerGame: entry.runs.scored / Math.max(1, entry.record.wins + entry.record.losses),
  // Every run allowed counts, including the pooled support bullpen's.
  allowedPerGame: entry.runs.allowed / Math.max(1, entry.record.wins + entry.record.losses),
  war: sum(entry.batting, line => line.war) + sum(entry.pitching, line => line.war)
 };
}

/** The roster's most valuable seasons by estimated WAR, for a club card's photo collage. */
export function stars(entry: Entry, count: number): string[] {
 return [...entry.batting, ...entry.pitching]
  .sort((a, b) => b.war - a.war || compareId(a.seasonId, b.seasonId))
  .slice(0, count).map(line => line.seasonId);
}

function board(id: string, title: string, rows: { entry: Entry; value: number; player: string | null; seasonId: string | null }[], display: (value: number) => string, lowerIsBetter = false, note?: string, limit = 5): Leaderboard {
 const ordered = [...rows].sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value)
  || a.entry.savedAt.localeCompare(b.entry.savedAt) || compareId(a.seasonId ?? '', b.seasonId ?? ''));
 return {
  id, title, ...(note ? { note } : {}),
  leaders: ordered.slice(0, limit).map(row => ({ entryKey: row.entry.key, team: teamTitle(row.entry), player: row.player, seasonId: row.seasonId, value: row.value, display: display(row.value) }))
 };
}

/** All-time leaders across every saved club. Ties go to the earlier save, then the season id. */
export function libraryLeaders(entries: readonly Entry[], limit = 5): LeaderGroups {
 const hitters = entries.flatMap(entry => entry.batting.map(line => ({ entry, line, player: line.label, seasonId: line.seasonId })));
 const qualified = hitters.filter(row => row.line.PA >= QUALIFYING_PA);
 const pitchers = entries.flatMap(entry => entry.pitching.map(line => ({ entry, line, player: line.label, seasonId: line.seasonId })));
 const value = [...hitters, ...pitchers];
 const teams = entries.map(entry => ({ entry, player: null, seasonId: null }));
 const count = (value: number) => String(value);
 return {
  teams: [
   board('wins', 'Wins', teams.map(row => ({ ...row, value: row.entry.record.wins })), count, false, undefined, limit),
   board('run-differential', 'Run differential', teams.map(row => ({ ...row, value: row.entry.runs.scored - row.entry.runs.allowed })), signed, false, undefined, limit)
  ],
  batting: [
   board('hr', 'Home runs', hitters.map(row => ({ ...row, value: row.line.HR })), count, false, undefined, limit),
   board('avg', 'Batting average', qualified.map(row => ({ ...row, value: average(row.line) })), rate, false, `Minimum ${QUALIFYING_PA} PA`, limit),
   board('ops', 'OPS', qualified.map(row => ({ ...row, value: ops(row.line) })), rate, false, `Minimum ${QUALIFYING_PA} PA`, limit),
   board('rbi', 'RBI', hitters.map(row => ({ ...row, value: row.line.RBI })), count, false, undefined, limit),
   board('sb', 'Stolen bases', hitters.map(row => ({ ...row, value: row.line.SB })), count, false, undefined, limit)
  ],
  pitching: [
   board('so', 'Strikeouts', pitchers.map(row => ({ ...row, value: row.line.SO })), count, false, undefined, limit),
   board('ra9', 'RA9', pitchers.filter(row => row.line.outs >= QUALIFYING_OUTS).map(row => ({ ...row, value: ra9(row.line) })), value => value.toFixed(2), true, `Runs allowed per nine · minimum ${QUALIFYING_OUTS / 3} IP`, limit)
  ],
  value: [
   board('war', 'Estimated WAR', value.map(row => ({ ...row, value: Math.round(row.line.war * 10) / 10 })), value => value.toFixed(1), false, 'Batting, running, defense and pitching value', limit)
  ]
 };
}
