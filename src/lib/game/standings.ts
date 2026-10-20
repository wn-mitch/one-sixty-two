import type { Db } from '../storage/sql.ts';
import { decodeReplay, storeReplay } from './share.ts';
import type { Manifest } from './types.ts';

export interface DailyStanding { rank: number; total: number; topPercent: number }

/** A day's standings as this device shows them: where its run stands and the spread of every counted run. */
export interface DailyStandingsView {
	date: string;
	wins: number;
	standing: DailyStanding;
	total: number;
	/** Counted runs at each win total, best first, as `[wins, count]`. */
	distribution: [number, number][];
	/** The day's grace period has ended, so the numbers are final. */
	final: boolean;
}

type FetchBoundary = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Answers that mean the run can never count; anything else (offline, 429, 5xx) is retried on the next view. */
const REFUSED = new Set([400, 404, 409]);

/** This device's standings token, made on first use: 128 random bits as 22 base64url characters. */
export async function deviceToken(db: Db): Promise<string> {
	const read = async () => (await db.all<{ token: string }>('SELECT token FROM device_identity WHERE id = 1'))[0]?.token;
	const existing = await read();
	if (existing) return existing;
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	// Two tabs may race; the first token stored is the device's.
	await db.run([{ sql: 'INSERT INTO device_identity (id, token) VALUES (1, ?) ON CONFLICT (id) DO NOTHING', bind: [token] }]);
	return (await read())!;
}

interface FinishedDaily {
	submission: 'accepted' | 'rejected' | null;
	replay: string | null;
	wins: number;
	losses: number;
	runs_scored: number | null;
	runs_allowed: number | null;
}

/**
 * Submits the day's first finished season to the standings, or refreshes an accepted one, and returns its
 * standing with the day's spread. Null when the run cannot count: never finished here, refused by the server,
 * or its saved season deleted before it was ever submitted. A closed day still shows its final spread.
 */
export async function loadDailyStandings(db: Db, manifest: Manifest, date: string, origin: string, fetcher: FetchBoundary = fetch): Promise<DailyStandingsView | null> {
	const [run] = await db.all<FinishedDaily & Record<string, string | number | null>>(
		`SELECT daily_runs.submission, seasons.token AS replay, daily_runs.wins, daily_runs.losses, seasons.runs_scored, seasons.runs_allowed
		 FROM daily_runs LEFT JOIN seasons ON seasons.key = daily_runs.season_key
		 WHERE daily_runs.date = ? AND daily_runs.wins IS NOT NULL`, [date]);
	if (!run || run.submission === 'rejected') return null;
	let standing: DailyStanding | null = null;
	let wins = run.wins;
	if (run.replay && run.runs_scored !== null && run.runs_allowed !== null) {
		const replay = await storeReplay(decodeReplay(run.replay, manifest), origin, fetcher);
		const response = await fetcher(new URL(`/api/daily/${date}`, origin), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				replayId: replay.id,
				token: await deviceToken(db),
				record: { wins: run.wins, losses: run.losses, runsFor: run.runs_scored, runsAgainst: run.runs_allowed }
			})
		});
		if (response.ok) {
			const submitted = await response.json() as DailyStanding & { record: { wins: number } };
			standing = { rank: submitted.rank, total: submitted.total, topPercent: submitted.topPercent };
			wins = submitted.record.wins;
			if (run.submission === null) await db.run([{ sql: "UPDATE daily_runs SET submission = 'accepted' WHERE date = ?", bind: [date] }]);
		} else if (REFUSED.has(response.status) && run.submission === null) {
			await db.run([{ sql: "UPDATE daily_runs SET submission = 'rejected' WHERE date = ?", bind: [date] }]);
			return null;
		} else if (response.status !== 410) throw new Error(`Daily standings answered ${response.status}`);
	}
	// A run never accepted cannot place itself in a closed day.
	if (!standing && run.submission !== 'accepted') return null;
	const response = await fetcher(new URL(`/api/daily/${date}?wins=${wins}`, origin));
	if (!response.ok) throw new Error(`Daily standings answered ${response.status}`);
	const day = await response.json() as { total: number; distribution: [number, number][]; standing: DailyStanding; final: boolean };
	return { date, wins, standing: standing ?? day.standing, total: standing?.total ?? day.total, distribution: day.distribution, final: day.final };
}
