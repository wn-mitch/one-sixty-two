import { fetchJson } from '../game/data.ts';
import type { WarRankings, WarRankingsPointer, WarSeasonRanking } from './types.ts';

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value: unknown): value is number | null {
	return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function version(value: unknown): value is string {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function validateRankingsPointer(value: unknown, dataVersion: string): asserts value is WarRankingsPointer {
	if (!record(value) || value.schemaVersion !== 1 || value.dataVersion !== dataVersion || !version(value.dataVersion)
		|| !version(value.rankingVersion) || value.manifestUrl !== `/rankings/${value.rankingVersion}/manifest.json`) {
		throw new Error('Rankings pointer is incompatible; refresh and retry.');
	}
}

export function validateRankings(value: unknown, dataVersion: string, rankingVersion: string): asserts value is WarRankings {
	if (!record(value) || value.schemaVersion !== 1 || value.dataVersion !== dataVersion || value.rankingVersion !== rankingVersion
		|| !version(value.dataVersion) || !version(value.rankingVersion) || !record(value.source) || !record(value.seasons)
		|| !record(value.coverage)) {
		throw new Error('Rankings manifest is incompatible; refresh and retry.');
	}
	const source = value.source;
	if (typeof source.name !== 'string' || !source.name.trim() || typeof source.url !== 'string' || !source.url.startsWith('https://')
		|| typeof source.licenceUrl !== 'string' || !source.licenceUrl.startsWith('https://') || typeof source.licenceText !== 'string'
		|| !source.licenceText.trim() || typeof source.commit !== 'string' || !/^[a-f0-9]{40}$/.test(source.commit)
		|| typeof source.description !== 'string' || !source.description.trim()) {
		throw new Error('Rankings source provenance is incomplete; refresh and retry.');
	}
	for (const key of ['candidates', 'batting', 'pitching', 'missing']) {
		const count = value.coverage[key];
		if (!Number.isInteger(count) || Number(count) < 0) throw new Error('Rankings coverage is invalid; refresh and retry.');
	}
	for (const [seasonId, ranking] of Object.entries(value.seasons)) {
		if (!record(ranking) || !finiteOrNull(ranking.battingWAR162) || !finiteOrNull(ranking.pitchingWAR162)) {
			throw new Error(`Rankings value for ${seasonId} is invalid; refresh and retry.`);
		}
	}
}

export async function loadRankings(dataVersion: string): Promise<WarRankings> {
	if (!version(dataVersion)) throw new Error('Cannot load rankings: core data version is invalid.');
	const pointer = await fetchJson<WarRankingsPointer>('/rankings/current.json', value => validateRankingsPointer(value, dataVersion));
	return fetchJson<WarRankings>(pointer.manifestUrl, value => validateRankings(value, dataVersion, pointer.rankingVersion));
}

export function rankingForSeason(rankings: WarRankings | null | undefined, seasonId: string): WarSeasonRanking | null {
	return rankings?.seasons[seasonId] ?? null;
}
