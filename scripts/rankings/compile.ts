import { createHash } from 'node:crypto';
import { canonicalJSON } from '../data/compile.ts';
import { compileProfiles } from '../data/profiles.ts';
import { compareId, type Profile } from '../../src/lib/game/types.ts';
import type { WarRankings, WarRankingSource, WarSeasonRanking } from '../../src/lib/rankings/types.ts';
import {
	RANKINGS_LICENSE_TEXT,
	RANKINGS_LICENSE_URL,
	RANKINGS_README_URL,
	RANKINGS_SOURCE_COMMIT,
	RANKINGS_SOURCE_DESCRIPTION,
	RANKINGS_SOURCE_REPOSITORY,
	RANKINGS_SOURCE_URL
} from './source.ts';
import type { CsvRow } from '../data/acquire.ts';
import type { Tables } from '../data/counts.ts';

interface JoinedWarRow {
	seasonId: string;
	row: CsvRow;
}

export interface WarAggregation {
	battingWAR162: number | null;
	pitchingWAR162: number | null;
}

export interface RankingDiagnostics {
	matchedRows: number;
	duplicateRows: number;
	unmatchedPeople: number;
	unmatchedTeams: number;
	franchiseMismatches: number;
	missingBatting: number;
	missingPitching: number;
	missingBoth: number;
	missingBattingNoSource: number;
	missingBattingUnavailable: number;
	missingPitchingNoSource: number;
	missingPitchingUnavailable: number;
	partialSeasonRows: number;
}

export interface RankingCompilation {
	rankings: WarRankings;
	diagnostics: RankingDiagnostics;
}

export interface RankingJoinInput {
	people: CsvRow[];
	teams: CsvRow[];
}

function parseNullableNumber(row: CsvRow, field: string): number | null {
	const raw = row[field]?.trim();
	if (!raw || raw.toUpperCase() === 'NA') return null;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`Invalid WAR value in ${field}: ${raw}`);
	return value;
}

function sourceSeasonId(playerId: string, team: CsvRow): string {
	return `${playerId}:${team.yearID}:${team.lgID}:${team.teamID}`;
}

function sourceStintKey(row: CsvRow): string {
	return `${row.key_bbref}:${row.year_ID}:${row.lg_ID}:${row.team_ID}:${row.stint_ID}`;
}

function sourceRole(row: CsvRow, field: 'batting' | 'pitching'): boolean {
	const indicator = field === 'batting' ? row.pa : row.innings;
	const value = indicator === undefined || indicator.trim() === '' ? null : Number(indicator);
	return value !== null && Number.isFinite(value) && value > 0;
}

function sumRole(rows: CsvRow[], field: string): number | null {
	if (!rows.length) return null;
	let total = 0;
	for (const row of rows) {
		const value = parseNullableNumber(row, field);
		if (value === null) return null;
		total += value;
	}
	return Number.isFinite(total) ? total : null;
}
function sourceTeamKey(row: CsvRow): string {
	return `${row.year_ID}:${row.lg_ID}:${row.team_ID}`;
}

/**
 * MLB's shortest completed season in the covered 1961–2025 window is 60 games
 * (2020). A season whose source rows cover fewer scheduled games is a partial
 * capture of a live season, so its per-162 rate extrapolates a fraction of a
 * year and is published unavailable instead of outranking completed seasons.
 */
const COMPLETED_SEASON_MIN_SCHEDULED = 60;

function scheduledGames(row: CsvRow): number {
	const value = Number(row.sched);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Maximum scheduled games recorded by the source for each covered season. */
function coveredScheduledGames(rows: CsvRow[]): Map<number, number> {
	const byYear = new Map<number, number>();
	for (const row of rows) {
		const year = Number(row.year_ID);
		if (!Number.isInteger(year) || year < 1961 || year > 2025 || (row.lg_ID !== 'AL' && row.lg_ID !== 'NL')) continue;
		const scheduled = scheduledGames(row);
		if (scheduled > (byYear.get(year) ?? 0)) byYear.set(year, scheduled);
	}
	return byYear;
}

function teamKey(row: CsvRow): string {
	return `${row.yearID}:${row.lgID}:${row.teamID}`;
}

export function joinWarRows(rows: CsvRow[], input: RankingJoinInput): {
	joined: JoinedWarRow[];
	diagnostics: Pick<RankingDiagnostics, 'duplicateRows' | 'unmatchedPeople' | 'unmatchedTeams' | 'franchiseMismatches' | 'partialSeasonRows'>;
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
		if (!Number.isInteger(year) || year < 1961 || year > 2025) continue;
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
		if (!Number.isInteger(year) || year < 1961 || year > 2025 || (row.lg_ID !== 'AL' && row.lg_ID !== 'NL')) continue;
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
		const canonical = canonicalJSON(row);
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

export function aggregateWarRows(rows: CsvRow[], input: RankingJoinInput): {
	values: Map<string, WarAggregation>;
	diagnostics: RankingDiagnostics;
	roleRows: Map<string, { batting: number; pitching: number }>;
} {
	const result = joinWarRows(rows, input);
	const bySeason = new Map<string, CsvRow[]>();
	for (const { seasonId, row } of result.joined) {
		const seasonRows = bySeason.get(seasonId) ?? [];
		seasonRows.push(row);
		bySeason.set(seasonId, seasonRows);
	}
	const values = new Map<string, WarAggregation>();
	const roleRows = new Map<string, { batting: number; pitching: number }>();
	for (const [seasonId, seasonRows] of bySeason) {
		const battingRows = seasonRows.filter(row => sourceRole(row, 'batting'));
		const pitchingRows = seasonRows.filter(row => sourceRole(row, 'pitching'));
		roleRows.set(seasonId, { batting: battingRows.length, pitching: pitchingRows.length });
		values.set(seasonId, {
			battingWAR162: sumRole(battingRows, 'bwar162'),
			pitchingWAR162: sumRole(pitchingRows, 'pwar162')
		});
	}
	return {
		values,
		roleRows,
		diagnostics: {
			matchedRows: result.joined.length,
			...result.diagnostics,
			missingBatting: 0,
			missingPitching: 0,
			missingBoth: 0,
			missingBattingNoSource: 0,
			missingBattingUnavailable: 0,
			missingPitchingNoSource: 0,
			missingPitchingUnavailable: 0
		}
	};
}

function source(): WarRankingSource {
	return {
		name: 'MLB-WAR-data-historical — JEFFBAGWELL',
		url: RANKINGS_SOURCE_URL,
		licenceUrl: RANKINGS_LICENSE_URL,
		licenceText: RANKINGS_LICENSE_TEXT,
		commit: RANKINGS_SOURCE_COMMIT,
		description: `${RANKINGS_SOURCE_DESCRIPTION} Repository documentation: ${RANKINGS_README_URL}.`
	};
}

function battingEligible(profile: Profile): boolean {
	return profile.eligibleSlots.some(slot => ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].includes(slot));
}

function pitchingEligible(profile: Profile): boolean {
	return profile.eligibleSlots.some(slot => ['SP1', 'SP2', 'SP3', 'CL'].includes(slot));
}

export function compileRankings(dataVersion: string, warRows: CsvRow[], tables: Tables): RankingCompilation {
	if (!/^[a-f0-9]{64}$/.test(dataVersion)) throw new Error(`Invalid core data version: ${dataVersion}`);
	const profiles = compileProfiles(tables).candidates.sort((a, b) => compareId(a.seasonId, b.seasonId));
	const aggregation = aggregateWarRows(warRows, { people: tables.People, teams: tables.Teams });
	const seasons: Record<string, WarSeasonRanking> = {};
	let expectedBatting = 0;
	let expectedPitching = 0;
	let missingBatting = 0;
	let missingPitching = 0;
	let missingBoth = 0;
	let missingBattingNoSource = 0;
	let missingBattingUnavailable = 0;
	let missingPitchingNoSource = 0;
	let missingPitchingUnavailable = 0;
	for (const profile of profiles) {
		const batting = battingEligible(profile);
		const pitching = pitchingEligible(profile);
		if (batting) expectedBatting++;
		if (pitching) expectedPitching++;
		const value = aggregation.values.get(profile.seasonId);
		const ranking: WarSeasonRanking = {
			battingWAR162: batting ? value?.battingWAR162 ?? null : null,
			pitchingWAR162: pitching ? value?.pitchingWAR162 ?? null : null
		};
		if (batting && ranking.battingWAR162 === null) {
			missingBatting++;
			if ((aggregation.roleRows.get(profile.seasonId)?.batting ?? 0) === 0) missingBattingNoSource++;
			else missingBattingUnavailable++;
		}
		if (pitching && ranking.pitchingWAR162 === null) {
			missingPitching++;
			if ((aggregation.roleRows.get(profile.seasonId)?.pitching ?? 0) === 0) missingPitchingNoSource++;
			else missingPitchingUnavailable++;
		}
		if (ranking.battingWAR162 === null && ranking.pitchingWAR162 === null) missingBoth++;
		seasons[profile.seasonId] = ranking;
	}
	const coverage = {
		candidates: profiles.length,
		batting: expectedBatting - missingBatting,
		pitching: expectedPitching - missingPitching,
		missing: missingBatting + missingPitching
	};
	const payload = { schemaVersion: 1 as const, dataVersion, source: source(), seasons, coverage };
	const rankingVersion = createHash('sha256').update(canonicalJSON(payload)).digest('hex');
	const diagnostics: RankingDiagnostics = {
		...aggregation.diagnostics,
		missingBatting,
		missingPitching,
		missingBoth,
		missingBattingNoSource,
		missingBattingUnavailable,
		missingPitchingNoSource,
		missingPitchingUnavailable
	};
	return { rankings: { ...payload, rankingVersion }, diagnostics };
}
