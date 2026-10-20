import { isDailyDate } from '../game/daily.ts';
import { boardVersions, COUNTED, DailyRequestError, database, deviceHash, validToken, type DailyBindings, type DailyDatabase } from './daily-standings.ts';
import { InvalidReplayError, recomputeReplay } from './daily-verify.ts';
import { loadCurrentDataVersion, loadReplay, ReplayIncompatibleError, ReplayNotFoundError } from './replays.ts';

/** Rows on a day's named board. */
export const BOARD_SIZE = 25;
/** A claim older than this was abandoned (the isolate died mid-check), so another request may take the row. */
const CLAIM_MS = 2 * 60 * 1000;
/** Reports from this many distinct devices hold a name until an admin reviews it. */
export const REPORTS_TO_HOLD = 3;

export interface BoardRow {
	entry: string;
	/** Null shows as Anonymous: no name, or a held or hidden one. */
	name: string | null;
	wins: number;
	losses: number;
	runDiff: number;
	replayId: string;
	/** Verified runs with this exact roster and orders, listed once at the earliest. */
	copies: number;
}

export interface DailyBoard { board: BoardRow[]; checkedAt: string | null }

/** Ranks every counted run by the board's order; the top `BOARD_SIZE` by claimed record are the ones to verify. */
const RANKED = `SELECT date, device, entry, replay_id, status, verifying_at, wins, losses, runs_for, runs_against, roster_key, name, name_state, submitted_at, verified_at,
	RANK() OVER (ORDER BY wins DESC, runs_for - runs_against DESC) AS place
	FROM daily_submissions WHERE ${COUNTED}`;

interface Candidate { device: string; replay_id: string; wins: number; losses: number; runs_for: number; runs_against: number }

/**
 * Recomputes up to `limit` unverified runs whose claimed records would reach the board, best first.
 * Each row is claimed before its check, so concurrent requests never recompute the same run, and
 * only the visible board is ever recomputed. A mismatch rejects the run and flags its device.
 */
export async function verifyBoard(bindings: DailyBindings, date: string, limit: number, now = new Date()): Promise<number> {
	const db = await database(bindings);
	const dataVersion = await loadCurrentDataVersion(bindings.ASSETS);
	const versions = await boardVersions(db, date, dataVersion);
	if (!versions) return 0;
	const stale = new Date(now.getTime() - CLAIM_MS).toISOString();
	const { results } = await db.prepare(`WITH ranked AS (${RANKED})
		SELECT device, replay_id, wins, losses, runs_for, runs_against FROM ranked
		WHERE place <= ${BOARD_SIZE} AND status = 'unverified' AND (verifying_at IS NULL OR verifying_at < ?5)
		ORDER BY place, submitted_at LIMIT ?6`).bind(...versions, stale, limit).all<Candidate>();
	let checked = 0;
	for (const row of results) {
		const claimed = await db.prepare(`UPDATE daily_submissions SET verifying_at = ? WHERE date = ? AND device = ? AND status = 'unverified'
			AND (verifying_at IS NULL OR verifying_at < ?)`).bind(now.toISOString(), date, row.device, stale).run();
		if (claimed.meta.changes !== 1) continue;
		try {
			await settle(db, bindings, date, row, dataVersion, now);
			checked++;
		} catch (error) {
			// Data could not load; release the claim so a later request retries, and stop for now.
			await db.prepare('UPDATE daily_submissions SET verifying_at = NULL WHERE date = ? AND device = ?').bind(date, row.device).run();
			throw error;
		}
	}
	return checked;
}

async function settle(db: DailyDatabase, bindings: DailyBindings, date: string, row: Candidate, dataVersion: string, now: Date): Promise<void> {
	let recomputed: Awaited<ReturnType<typeof recomputeReplay>> | null = null;
	try {
		recomputed = await recomputeReplay(bindings.ASSETS, await loadReplay(bindings.REPLAYS, row.replay_id, dataVersion));
	} catch (error) {
		if (!(error instanceof InvalidReplayError || error instanceof ReplayNotFoundError || error instanceof ReplayIncompatibleError)) throw error;
	}
	const { record } = recomputed ?? {};
	const matches = !!record && record.wins === row.wins && record.losses === row.losses && record.runsFor === row.runs_for && record.runsAgainst === row.runs_against;
	const stamp = now.toISOString();
	if (matches) {
		await db.prepare("UPDATE daily_submissions SET status = 'verified', verified_at = ?, verifying_at = NULL, roster_key = ? WHERE date = ? AND device = ?")
			.bind(stamp, recomputed!.rosterKey, date, row.device).run();
		return;
	}
	await db.batch([
		db.prepare("UPDATE daily_submissions SET status = 'rejected', verified_at = ?, verifying_at = NULL WHERE date = ? AND device = ?").bind(stamp, date, row.device),
		db.prepare('INSERT INTO devices (device, flags) VALUES (?, 1) ON CONFLICT (device) DO UPDATE SET flags = flags + 1').bind(row.device)
	]);
}

/** The day's named board: verified runs only, best record first, then run differential, then earliest submission. */
export async function dailyBoard(bindings: DailyBindings, date: string): Promise<DailyBoard> {
	const db = await database(bindings);
	const versions = await boardVersions(db, date, await loadCurrentDataVersion(bindings.ASSETS));
	if (!versions) return { board: [], checkedAt: null };
	const { results } = await db.prepare(`WITH verified AS (SELECT * FROM daily_submissions WHERE ${COUNTED} AND status = 'verified'),
		grouped AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY roster_key ORDER BY submitted_at, device) AS position,
			COUNT(*) OVER (PARTITION BY roster_key) AS copies FROM verified)
		SELECT entry, CASE WHEN name_state = 'shown' THEN name END AS name, wins, losses, runs_for - runs_against AS run_diff, replay_id, copies
		FROM grouped WHERE position = 1 ORDER BY wins DESC, run_diff DESC, submitted_at ASC LIMIT ${BOARD_SIZE}`)
		.bind(...versions).all<{ entry: string; name: string | null; wins: number; losses: number; run_diff: number; replay_id: string; copies: number }>();
	const checked = await db.prepare(`SELECT MAX(verified_at) AS at FROM daily_submissions WHERE ${COUNTED}`).bind(...versions).first<{ at: string | null }>();
	return {
		board: results.map(row => ({ entry: row.entry, name: row.name, wins: row.wins, losses: row.losses, runDiff: row.run_diff, replayId: row.replay_id, copies: row.copies })),
		checkedAt: checked?.at ?? null
	};
}

/**
 * Records one device's report of a board name. Only a device with its own counted run that day may report,
 * once per entry and never its own; enough distinct reporters hold the name until an admin reviews it.
 */
export async function reportName(bindings: DailyBindings, date: string, body: unknown, now = new Date()): Promise<void> {
	if (!isDailyDate(date)) throw new DailyRequestError(404, 'That daily does not exist.');
	const input = body as Record<string, unknown> | null;
	if (!input || !validToken(input.token) || typeof input.entry !== 'string' || !/^[0-9a-f]{16}$/.test(input.entry)) throw new DailyRequestError(400, 'The report is invalid.');
	const db = await database(bindings);
	const reporter = await deviceHash(input.token);
	const eligible = await db.prepare(`SELECT 1 AS ok FROM daily_submissions mine
		WHERE mine.date = ?1 AND mine.device = ?2 AND mine.status NOT IN ('rejected', 'retired')
		AND NOT EXISTS (SELECT 1 FROM devices WHERE devices.device = ?2 AND banned_at IS NOT NULL)
		AND EXISTS (SELECT 1 FROM daily_submissions target WHERE target.date = ?1 AND target.entry = ?3 AND target.device <> ?2)`)
		.bind(date, reporter, input.entry).first();
	if (!eligible) return;
	await db.batch([
		db.prepare('INSERT INTO name_reports (date, entry, reporter, reported_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(date, input.entry, reporter, now.toISOString()),
		db.prepare(`UPDATE daily_submissions SET name_state = 'held' WHERE date = ?1 AND entry = ?2 AND name_state = 'shown' AND name IS NOT NULL
			AND (SELECT COUNT(*) FROM name_reports WHERE name_reports.date = ?1 AND name_reports.entry = ?2
				AND reporter NOT IN (SELECT device FROM devices WHERE banned_at IS NOT NULL)) >= ${REPORTS_TO_HOLD}`).bind(date, input.entry)
	]);
}
