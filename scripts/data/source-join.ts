import { MAX_SEASON_YEAR, MIN_SEASON_YEAR } from '../../src/lib/game/types.ts';
import type { CsvRow } from './acquire.ts';

export interface JoinedWarRow {
	seasonId: string;
	row: CsvRow;
}

export interface SourceJoinInput {
	people: CsvRow[];
	teams: CsvRow[];
}

export interface SourceJoinDiagnostics {
	duplicateRows: number;
	unmatchedPeople: number;
	unmatchedTeams: number;
	franchiseMismatches: number;
	partialSeasonRows: number;
}

/** MLB's shortest completed season in the covered window was the 60-game 2020 season. */
export const COMPLETED_SEASON_MIN_SCHEDULED = 60;

export interface GroupedWarRows {
 bySeason: Map<string, CsvRow[]>;
 diagnostics: SourceJoinDiagnostics;
}

export function parseNullableNumber(row: CsvRow, field: string): number | null {
	const raw = row[field]?.trim();
	if (!raw || raw.toUpperCase() === 'NA') return null;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`Invalid WAR source value in ${field}: ${raw}`);
	return value;
}

export function sourceRole(row: CsvRow, field: 'batting' | 'pitching'): boolean {
	const indicator = field === 'batting' ? row.pa : row.innings;
	const value = indicator === undefined || indicator.trim() === '' ? null : Number(indicator);
	return value !== null && Number.isFinite(value) && value > 0;
}

export function sumComplete(rows: CsvRow[], field: string): number | null {
	if (!rows.length) return null;
	let total = 0;
	for (const row of rows) {
		const value = parseNullableNumber(row, field);
		if (value === null) return null;
		total += value;
	}
	return Number.isFinite(total) ? total : null;
}

export function scheduledGames(row: CsvRow): number {
	const value = Number(row.sched);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function sourceSeasonId(playerId: string, team: CsvRow): string {
	return `${playerId}:${team.yearID}:${team.lgID}:${team.teamID}`;
}

function sourceStintKey(row: CsvRow): string {
	return `${row.key_bbref}:${row.year_ID}:${row.lg_ID}:${row.team_ID}:${row.stint_ID}`;
}

function sourceTeamKey(row: CsvRow): string {
	return `${row.year_ID}:${row.lg_ID}:${row.team_ID}`;
}

function canonicalRow(row: CsvRow): string {
	return JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}

function coveredScheduledGames(rows: CsvRow[]): Map<number, number> {
	const byYear = new Map<number, number>();
	for (const row of rows) {
		const year = Number(row.year_ID);
		if (!Number.isInteger(year) || year < MIN_SEASON_YEAR || year > MAX_SEASON_YEAR || (row.lg_ID !== 'AL' && row.lg_ID !== 'NL')) continue;
		const scheduled = scheduledGames(row);
		if (scheduled > (byYear.get(year) ?? 0)) byYear.set(year, scheduled);
	}
	return byYear;
}

export function joinWarRows(rows: CsvRow[], input: SourceJoinInput): {
	joined: JoinedWarRow[];
	diagnostics: SourceJoinDiagnostics;
} {
	const peopleByBbref = new Map<string, CsvRow>();
	for (const person of input.people) {
		const bbref = person.bbrefID?.trim();
		if (bbref) peopleByBbref.set(bbref, person);
	}
	const teamsByKey = new Map<string, CsvRow>();
	for (const team of input.teams) {
		if (team.lgID !== 'AL' && team.lgID !== 'NL') continue;
		const year = Number(team.yearID);
		if (!Number.isInteger(year) || year < MIN_SEASON_YEAR || year > MAX_SEASON_YEAR) continue;
		for (const identifier of [team.teamID, team.teamIDBR]) {
			if (!identifier?.trim()) continue;
			const key = `${team.yearID}:${team.lgID}:${identifier}`;
			const existing = teamsByKey.get(key);
			if (existing && existing.teamID !== team.teamID) throw new Error(`Duplicate Lahman team key: ${key}`);
			teamsByKey.set(key, team);
		}
	}
	const seenStints = new Map<string, string>();
	const scheduled = coveredScheduledGames(rows);
	const joined: JoinedWarRow[] = [];
	let duplicateRows = 0;
	let unmatchedPeople = 0;
	let unmatchedTeams = 0;
	let franchiseMismatches = 0;
	let partialSeasonRows = 0;
	for (const row of rows) {
		const year = Number(row.year_ID);
		if (!Number.isInteger(year) || year < MIN_SEASON_YEAR || year > MAX_SEASON_YEAR || (row.lg_ID !== 'AL' && row.lg_ID !== 'NL')) continue;
		const maximum = scheduled.get(year) ?? 0;
		if (maximum > 0 && maximum < COMPLETED_SEASON_MIN_SCHEDULED) {
			partialSeasonRows++;
			continue;
		}
		const person = peopleByBbref.get(row.key_bbref?.trim());
		if (!person?.playerID) {
			unmatchedPeople++;
			continue;
		}
		const team = teamsByKey.get(sourceTeamKey(row));
		if (!team) {
			unmatchedTeams++;
			continue;
		}
		if (row.franch_ID?.trim() && row.franch_ID !== team.franchID) franchiseMismatches++;
		const stintKey = sourceStintKey(row);
		const canonical = canonicalRow(row);
		const previous = seenStints.get(stintKey);
		if (previous !== undefined) {
			if (previous !== canonical) throw new Error(`Conflicting duplicate WAR row: ${stintKey}`);
			duplicateRows++;
			continue;
		}
		seenStints.set(stintKey, canonical);
		joined.push({ seasonId: sourceSeasonId(person.playerID, team), row });
	}
	return { joined, diagnostics: { duplicateRows, unmatchedPeople, unmatchedTeams, franchiseMismatches, partialSeasonRows } };
}

export function groupJoinedWarRows(rows: CsvRow[], input: SourceJoinInput): GroupedWarRows {
	const result = joinWarRows(rows, input);
	const bySeason = new Map<string, CsvRow[]>();
	for (const { seasonId, row } of result.joined) {
		const seasonRows = bySeason.get(seasonId) ?? [];
		seasonRows.push(row);
		bySeason.set(seasonId, seasonRows);
	}
	return { bySeason, diagnostics: result.diagnostics };
}
