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
	RANKINGS_SOURCE_URL
} from './source.ts';
import type { CsvRow } from '../data/acquire.ts';
import type { Tables } from '../data/counts.ts';
import { groupJoinedWarRows, sourceRole, sumComplete, type SourceJoinInput } from '../data/source-join.ts';
export { joinWarRows } from '../data/source-join.ts';


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

export type RankingJoinInput = SourceJoinInput;

export function aggregateWarRows(rows: CsvRow[], input: RankingJoinInput): {
	values: Map<string, WarAggregation>;
	diagnostics: RankingDiagnostics;
	roleRows: Map<string, { batting: number; pitching: number }>;
} {
	const result = groupJoinedWarRows(rows, input);
	const bySeason = result.bySeason;
	const values = new Map<string, WarAggregation>();
	const roleRows = new Map<string, { batting: number; pitching: number }>();
	for (const [seasonId, seasonRows] of bySeason) {
		const battingRows = seasonRows.filter(row => sourceRole(row, 'batting'));
		const pitchingRows = seasonRows.filter(row => sourceRole(row, 'pitching'));
		roleRows.set(seasonId, { batting: battingRows.length, pitching: pitchingRows.length });
		values.set(seasonId, {
			battingWAR162: sumComplete(battingRows, 'bwar162'),
			pitchingWAR162: sumComplete(pitchingRows, 'pwar162')
		});
	}
	return {
		values,
		roleRows,
		diagnostics: {
			matchedRows: [...bySeason.values()].reduce((total, seasonRows) => total + seasonRows.length, 0),
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
	const profiles = compileProfiles(tables).candidates.filter(profile => !profile.eligibleSlots.includes('BP')).sort((a, b) => compareId(a.seasonId, b.seasonId));
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
