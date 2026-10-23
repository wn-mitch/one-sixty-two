import { json } from '@sveltejs/kit';
import { database, DailyRequestError, deviceHash, RETENTION_DAYS, standing, validToken, type DailyBindings, type DailyStanding } from './daily-standings.ts';
import { loadCurrentDataVersion, loadReplay, REPLAY_ID_PATTERN, ReplayIncompatibleError, ReplayNotFoundError, ReplayUnavailableError } from './replays.ts';
import { placeAmong, runCount, winsAtShare } from '../game/win-distribution.ts';
import type { Replay } from '../game/types.ts';

export interface StadiumStandings {
	stadium: string;
	total: number;
	/** Counted runs at each win total that occurs, best first, as `[wins, count]`. */
	distribution: [number, number][];
	/** Present when the request named a win total. */
	standing?: DailyStanding;
}

export interface ParkSummary {
	stadium: string;
	total: number;
	/** The median run's wins. */
	typical: number;
	/** The wins the best tenth of runs reached. */
	top10: number;
	/** Counted runs at each win total, best first, as `[wins, count]`. */
	distribution: [number, number][];
}

const STADIUM_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Rows that count: the versions bound as ?1–?3, from devices not banned. */
const COUNTED = `data_version = ?1 AND model_version = ?2 AND rules_version = ?3
	AND device NOT IN (SELECT device FROM devices WHERE banned_at IS NOT NULL)`;

/**
 * The deployed data version with the model and rules of the latest run on it, since a deploy that changes
 * either starts every park's numbers over. Null before the first run on this data.
 */
async function currentVersions(bindings: DailyBindings): Promise<[string, string, string] | null> {
	const dataVersion = await loadCurrentDataVersion(bindings.ASSETS);
	const db = await database(bindings);
	const latest = await db.prepare('SELECT model_version, rules_version FROM stadium_runs WHERE data_version = ? ORDER BY submitted_at DESC LIMIT 1')
		.bind(dataVersion).first<{ model_version: string; rules_version: string }>();
	return latest ? [dataVersion, latest.model_version, latest.rules_version] : null;
}

/**
 * Records one own season at its home park from the stored replay; the stadium and versions come from the
 * replay, the record from the client. The same replay from the same device counts once, so retries are safe.
 */
export async function submitStadiumRun(bindings: DailyBindings, body: unknown, now = new Date()): Promise<StadiumStandings & { standing: DailyStanding }> {
	const input = body as Record<string, unknown> | null;
	const wins = input?.wins;
	if (!input || !validToken(input.token) || typeof input.replayId !== 'string' || !REPLAY_ID_PATTERN.test(input.replayId)
		|| !Number.isInteger(wins) || (wins as number) < 0 || (wins as number) > 162) {
		throw new DailyRequestError(400, 'The submission is invalid.');
	}
	const dataVersion = await loadCurrentDataVersion(bindings.ASSETS);
	let replay: Replay;
	try { replay = await loadReplay(bindings.REPLAYS, input.replayId, dataVersion); }
	catch (error) {
		if (error instanceof ReplayNotFoundError) throw new DailyRequestError(404, error.message);
		if (error instanceof ReplayIncompatibleError) throw new DailyRequestError(409, error.message);
		throw error;
	}
	if (!replay.homeStadium) throw new DailyRequestError(409, 'That replay has no home stadium.');
	const db = await database(bindings);
	const device = await deviceHash(input.token);
	const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
	await db.batch([
		db.prepare(`INSERT INTO stadium_runs (device, replay_id, stadium, stadium_version, data_version, model_version, rules_version, wins, submitted_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (device, replay_id) DO NOTHING`)
			.bind(device, input.replayId, replay.homeStadium.id, replay.homeStadium.version, replay.dataVersion, replay.modelVersion, replay.rulesVersion, wins, now.toISOString()),
		db.prepare('DELETE FROM stadium_runs WHERE submitted_at < ?').bind(cutoff)
	]);
	const counted = await stadiumStandings(bindings, replay.homeStadium.id, null);
	// A banned device still sees its own run placed among the counted ones.
	return { ...counted, standing: placeAmong(counted.distribution, wins as number) };
}

/** A park's counted runs on the current versions, with the standing of `wins` when given. */
export async function stadiumStandings(bindings: DailyBindings, stadium: string, wins: number | null): Promise<StadiumStandings> {
	if (!STADIUM_ID.test(stadium)) throw new DailyRequestError(404, 'That stadium does not exist.');
	if (wins !== null && (!Number.isInteger(wins) || wins < 0 || wins > 162)) throw new DailyRequestError(400, 'The win total is invalid.');
	const versions = await currentVersions(bindings);
	const empty = { stadium, total: 0, distribution: [] as [number, number][], ...(wins === null ? {} : { standing: standing(1, 1) }) };
	if (!versions) return empty;
	const db = await database(bindings);
	// The park's latest version on this data; an older layout's runs no longer describe it.
	const latest = await db.prepare(`SELECT stadium_version FROM stadium_runs WHERE ${COUNTED} AND stadium = ?4 ORDER BY submitted_at DESC LIMIT 1`)
		.bind(...versions, stadium).first<{ stadium_version: string }>();
	if (!latest) return empty;
	const { results } = await db.prepare(`SELECT wins, COUNT(*) AS count FROM stadium_runs WHERE ${COUNTED} AND stadium = ?4 AND stadium_version = ?5
		GROUP BY wins ORDER BY wins DESC`).bind(...versions, stadium, latest.stadium_version).all<{ wins: number; count: number }>();
	const distribution = results.map(row => [row.wins, row.count] as [number, number]);
	const total = runCount(distribution);
	return { stadium, total, distribution, ...(wins === null ? {} : { standing: placeAmong(distribution, wins) }) };
}

/** Every park with counted runs on the current versions: its run count, typical record and top-10% line. */
export async function stadiumSummaries(bindings: DailyBindings): Promise<ParkSummary[]> {
	const versions = await currentVersions(bindings);
	if (!versions) return [];
	const db = await database(bindings);
	const { results } = await db.prepare(`SELECT stadium, stadium_version, wins, COUNT(*) AS count, MAX(submitted_at) AS latest
		FROM stadium_runs WHERE ${COUNTED} GROUP BY stadium, stadium_version, wins`).bind(...versions)
		.all<{ stadium: string; stadium_version: string; wins: number; count: number; latest: string }>();
	// Each park keeps only its most recently submitted version, as `stadiumStandings` does.
	const newest = new Map<string, { version: string; latest: string }>();
	for (const row of results) {
		const seen = newest.get(row.stadium);
		if (!seen || row.latest > seen.latest) newest.set(row.stadium, { version: row.stadium_version, latest: row.latest });
	}
	const byStadium = new Map<string, [number, number][]>();
	for (const row of results) {
		if (newest.get(row.stadium)?.version !== row.stadium_version) continue;
		const list = byStadium.get(row.stadium) ?? [];
		list.push([row.wins, row.count]);
		byStadium.set(row.stadium, list);
	}
	return [...byStadium].map(([stadium, distribution]) => ({
		stadium, total: runCount(distribution), typical: winsAtShare(distribution, 0.5)!, top10: winsAtShare(distribution, 0.1)!,
		distribution: distribution.sort((a, b) => b[0] - a[0])
	})).sort((a, b) => a.stadium.localeCompare(b.stadium));
}

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** The JSON error response for a failed stadium standings request. */
export function stadiumError(error: unknown): Response {
	if (error instanceof DailyRequestError) return json({ message: error.message }, { status: error.status, headers: NO_STORE });
	if (!(error instanceof ReplayUnavailableError)) console.error('Stadium standings request failed unexpectedly', error);
	return json({ message: 'Stadium standings are unavailable. Please retry.' }, { status: 503, headers: NO_STORE });
}
