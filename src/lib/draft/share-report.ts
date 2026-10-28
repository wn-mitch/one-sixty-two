import { SEASON_GRADES, type SeasonGrade } from '../game/grade.ts';

/**
 * A finished Draft Mode season as it is shared: a read-only snapshot of the report, published once
 * and shown at `/d/<id>`. It names the run (seed, franchise) and every version it was played under,
 * but it is not a replay: lineups, trainings and votes live in the season, not the run's action log.
 * This module has no browser or engine dependencies, so the Worker validates with it too.
 */
export const DRAFT_REPORT_SCHEMA = 1;

/** One club's runs by inning, with null for a half not played. */
export interface SharedLine { club: string; innings: (number | null)[]; runs: number }

export interface SharedMoment { kind: 'highlight' | 'lowlight'; title: string; decree: string; away: SharedLine; home: SharedLine }

export interface DraftSharedReport {
 schemaVersion: typeof DRAFT_REPORT_SCHEMA;
 runVersion: string; leagueVersion: string; modelVersion: string; rulesVersion: string; dataVersion: string;
 seed: number;
 franchiseId: string;
 club: string;
 record: { wins: number; losses: number; runsFor: number; runsAgainst: number };
 /** Finish, 1-8. */
 place: number;
 grade: SeasonGrade;
 rival: { club: string; wins: number; losses: number };
 standings: { club: string; wins: number; losses: number; runsFor: number; runsAgainst: number; gamesBack: number; you: boolean; rival: boolean }[];
 /** Each chapter's decree name, in chapter order. */
 decrees: string[];
 /** The final roster: active slots in roster order, then reserves (slot "Res"), each with a one-line season. */
 roster: { label: string; slot: string; line: string }[];
 moments: SharedMoment[];
}

export class DraftReportInvalidError extends Error {
 constructor(detail = 'The shared season is not readable.') { super(detail); }
}

const CLUBS = 8;
const CHAPTERS = 6;
const MAX_ROSTER = 40;
const MAX_INNINGS = 30;

const fail = (): never => { throw new DraftReportInvalidError(); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const text = (value: unknown, max = 120): string => typeof value === 'string' && value.length > 0 && value.length <= max ? value : fail();
const count = (value: unknown, max: number): number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max ? value as number : fail();
const flag = (value: unknown): boolean => typeof value === 'boolean' ? value : fail();
const list = (value: unknown, min: number, max: number): unknown[] => Array.isArray(value) && value.length >= min && value.length <= max ? value : fail();

function line(value: unknown): SharedLine {
 const item = object(value);
 return {
  club: text(item.club),
  innings: list(item.innings, 1, MAX_INNINGS).map(runs => runs === null ? null : count(runs, 99)),
  runs: count(item.runs, 999)
 };
}

/**
 * Checks a value is a complete shared report and returns it with only its known fields, in a fixed key
 * order, so equal reports serialize to equal bytes. Throws `DraftReportInvalidError` otherwise.
 */
export function parseDraftReport(value: unknown): DraftSharedReport {
 const report = object(value);
 if (report.schemaVersion !== DRAFT_REPORT_SCHEMA) fail();
 const record = object(report.record);
 const rival = object(report.rival);
 const grade = SEASON_GRADES.includes(report.grade as SeasonGrade) ? report.grade as SeasonGrade : fail();
 const standings = list(report.standings, CLUBS, CLUBS).map(value => {
  const row = object(value);
  const gamesBack = typeof row.gamesBack === 'number' && Number.isFinite(row.gamesBack) && row.gamesBack >= 0 && row.gamesBack <= 162 && Number.isInteger(row.gamesBack * 2) ? row.gamesBack : fail();
  return { club: text(row.club), wins: count(row.wins, 162), losses: count(row.losses, 162), runsFor: count(row.runsFor, 9999), runsAgainst: count(row.runsAgainst, 9999), gamesBack, you: flag(row.you), rival: flag(row.rival) };
 });
 if (standings.filter(row => row.you).length !== 1 || standings.filter(row => row.rival).length !== 1) fail();
 const parsed: DraftSharedReport = {
  schemaVersion: DRAFT_REPORT_SCHEMA,
  runVersion: text(report.runVersion, 40), leagueVersion: text(report.leagueVersion, 40), modelVersion: text(report.modelVersion, 40),
  rulesVersion: text(report.rulesVersion, 40), dataVersion: text(report.dataVersion, 80),
  seed: count(report.seed, 0xffffffff),
  franchiseId: text(report.franchiseId, 8),
  club: text(report.club),
  record: { wins: count(record.wins, 162), losses: count(record.losses, 162), runsFor: count(record.runsFor, 9999), runsAgainst: count(record.runsAgainst, 9999) },
  place: count(report.place, CLUBS),
  grade,
  rival: { club: text(rival.club), wins: count(rival.wins, 162), losses: count(rival.losses, 162) },
  standings,
  decrees: list(report.decrees, CHAPTERS, CHAPTERS).map(name => text(name, 60)),
  roster: list(report.roster, 1, MAX_ROSTER).map(value => {
   const card = object(value);
   return { label: text(card.label), slot: text(card.slot, 4), line: text(card.line) };
  }),
  moments: list(report.moments, 0, 2).map(value => {
   const moment = object(value);
   const kind = moment.kind === 'highlight' || moment.kind === 'lowlight' ? moment.kind : fail();
   return { kind, title: text(moment.title, 160), decree: text(moment.decree, 60), away: line(moment.away), home: line(moment.home) };
  })
 };
 if (parsed.place < 1 || parsed.record.wins + parsed.record.losses !== 162) fail();
 return parsed;
}
