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
	/** This run's public id on the day's board, once the server has answered a submission. */
	entry: string | null;
	/** The board name the server holds for this run; null lists it as Anonymous. */
	name: string | null;
	/** The name just sent was refused, so the run stays Anonymous until another is accepted. */
	nameRefused: boolean;
	/** The day's named board: verified runs only, best first. */
	board: DailyBoardRow[];
}

/** One row of a day's named board. */
export interface DailyBoardRow {
	entry: string;
	/** Null shows as Anonymous. */
	name: string | null;
	wins: number;
	losses: number;
	runDiff: number;
	replayId: string;
	/** Verified runs that drafted this exact roster and orders. */
	copies: number;
}

/** A day's standings for any viewer: the spread of every counted run and the named board. */
export interface DailyBoardView {
	date: string;
	total: number;
	distribution: [number, number][];
	final: boolean;
	board: DailyBoardRow[];
	/** When the server last verified a run that day. */
	checkedAt: string | null;
}

/** Rows on the named board; a run ranked within this many is told it joins once checked. */
export const BOARD_SIZE = 25;

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
	board_entry: string | null;
	board_name: string | null;
	replay: string | null;
	wins: number;
	losses: number;
	runs_scored: number | null;
	runs_allowed: number | null;
}

/**
 * Submits the day's first finished season to the standings, or refreshes an accepted one, and returns its
 * standing with the day's spread and board. Null when the run cannot count: never finished here, refused by the
 * server, or its saved season deleted before it was ever submitted. A closed day still shows its final spread.
 *
 * `name` asks for that board name. Without it, a run with no accepted name offers the device's latest one.
 */
export async function loadDailyStandings(db: Db, manifest: Manifest, date: string, origin: string, fetcher: FetchBoundary = fetch, name?: string): Promise<DailyStandingsView | null> {
	const [run] = await db.all<FinishedDaily & Record<string, string | number | null>>(
		`SELECT daily_runs.submission, daily_runs.board_entry, daily_runs.board_name, seasons.token AS replay, daily_runs.wins, daily_runs.losses,
		 seasons.runs_scored, seasons.runs_allowed
		 FROM daily_runs LEFT JOIN seasons ON seasons.key = daily_runs.season_key
		 WHERE daily_runs.date = ? AND daily_runs.wins IS NOT NULL`, [date]);
	if (!run || run.submission === 'rejected') return null;
	let standing: DailyStanding | null = null;
	let wins = run.wins;
	let entry = run.board_entry;
	let boardName = run.board_name;
	let nameRefused = false;
	if (run.replay && run.runs_scored !== null && run.runs_allowed !== null) {
		const requested = name ?? (boardName === null ? await latestBoardName(db) : null);
		const replay = await storeReplay(decodeReplay(run.replay, manifest), origin, fetcher);
		const response = await fetcher(new URL(`/api/daily/${date}`, origin), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				replayId: replay.id,
				token: await deviceToken(db),
				record: { wins: run.wins, losses: run.losses, runsFor: run.runs_scored, runsAgainst: run.runs_allowed },
				...(requested === null ? {} : { name: requested })
			})
		});
		if (response.ok) {
			const submitted = await response.json() as DailyStanding & { record: { wins: number }; entry: string; name: string | null; nameAccepted?: boolean };
			standing = { rank: submitted.rank, total: submitted.total, topPercent: submitted.topPercent };
			wins = submitted.record.wins;
			entry = submitted.entry;
			boardName = submitted.name;
			// Only a name the player just typed reports a refusal; a carried-over name that no longer passes is dropped quietly.
			nameRefused = name !== undefined && submitted.nameAccepted === false;
			await db.run([{ sql: "UPDATE daily_runs SET submission = 'accepted', board_entry = ?, board_name = ? WHERE date = ?", bind: [entry, boardName, date] }]);
		} else if (REFUSED.has(response.status) && run.submission === null) {
			await db.run([{ sql: "UPDATE daily_runs SET submission = 'rejected' WHERE date = ?", bind: [date] }]);
			return null;
		} else if (response.status !== 410) throw new Error(`Daily standings answered ${response.status}`);
	}
	// A run never accepted cannot place itself in a closed day.
	if (!standing && run.submission !== 'accepted') return null;
	const response = await fetcher(new URL(`/api/daily/${date}?wins=${wins}`, origin));
	if (!response.ok) throw new Error(`Daily standings answered ${response.status}`);
	const day = await response.json() as DailyBoardView & { standing: DailyStanding };
	return {
		date, wins, standing: standing ?? day.standing, total: standing?.total ?? day.total, distribution: day.distribution, final: day.final,
		entry, name: boardName, nameRefused, board: day.board
	};
}

/** The name this device's most recent named run went by, offered for its next daily. */
async function latestBoardName(db: Db): Promise<string | null> {
	const [row] = await db.all<{ board_name: string }>('SELECT board_name FROM daily_runs WHERE board_name IS NOT NULL ORDER BY date DESC LIMIT 1');
	return row?.board_name ?? null;
}

/** A day's spread and named board, for any viewer. */
export async function loadDailyBoard(date: string, origin: string, fetcher: FetchBoundary = fetch): Promise<DailyBoardView> {
	const response = await fetcher(new URL(`/api/daily/${date}`, origin));
	if (!response.ok) throw new Error(response.status === 404 ? 'That daily has no board.' : `Daily standings answered ${response.status}`);
	const day = await response.json() as DailyBoardView;
	return { date, total: day.total, distribution: day.distribution, final: day.final, board: day.board, checkedAt: day.checkedAt };
}

/** This device's own entry on a day's board, and whether it may report names there (a counted run of its own). */
export async function dailyEntry(db: Db, date: string): Promise<string | null> {
	const [row] = await db.all<{ board_entry: string | null }>("SELECT board_entry FROM daily_runs WHERE date = ? AND submission = 'accepted'", [date]);
	return row?.board_entry ?? null;
}

/** Reports a board name from this device. The server answers the same whether or not the report counted. */
export async function reportDailyName(db: Db, date: string, entry: string, origin: string, fetcher: FetchBoundary = fetch): Promise<void> {
	const response = await fetcher(new URL(`/api/daily/${date}/report`, origin), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ entry, token: await deviceToken(db) })
	});
	if (!response.ok) throw new Error(response.status === 429 ? 'Too many reports. Please wait a minute and retry.' : 'The report could not be sent. Please retry.');
}
