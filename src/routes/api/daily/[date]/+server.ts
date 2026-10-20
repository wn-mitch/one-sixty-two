import { json } from '@sveltejs/kit';
import { env, waitUntil } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { dailyBoard, verifyBoard } from '#lib/server/daily-board.ts';
import { dailyStandings, DailyRequestError, submitDaily } from '#lib/server/daily-standings.ts';
import { uploadAllowed } from '#lib/server/rate-limit.ts';
import { ReplayUnavailableError } from '#lib/server/replays.ts';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function errorResponse(error: unknown): Response {
	if (error instanceof DailyRequestError) return json({ message: error.message }, { status: error.status, headers: NO_STORE });
	if (!(error instanceof ReplayUnavailableError)) console.error('Daily standings request failed unexpectedly', error);
	return json({ message: 'Daily standings are unavailable. Please retry.' }, { status: 503, headers: NO_STORE });
}

/** Submits this device's daily season: `{ replayId, token, record }`. */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!(await uploadAllowed(env.UPLOAD_LIMIT, request))) return json({ message: 'Too many uploads. Please wait a minute and retry.' }, { status: 429, headers: { 'retry-after': '60' } });
	let body: unknown;
	try { body = await request.json(); }
	catch { return json({ message: 'The submission is invalid.' }, { status: 400, headers: NO_STORE }); }
	try { return json(await submitDaily(env, params.date, body), { headers: NO_STORE }); }
	catch (error) { return errorResponse(error); }
};

/** Runs checked per standings request, after the response is sent; about a second of CPU each. */
const CHECKS_PER_REQUEST = 2;

/** The day's counted runs, their spread and the named board; `?wins=N` adds that record's standing. */
export const GET: RequestHandler = async ({ params, url }) => {
	const wins = url.searchParams.get('wins');
	try {
		const [day, board] = await Promise.all([dailyStandings(env, params.date, wins === null ? null : Number(wins)), dailyBoard(env, params.date)]);
		const standings = { ...day, ...board };
		// Viewing the standings is what drives verification: the board's unchecked runs are recomputed in the background.
		if (!day.final) waitUntil(verifyBoard(env, params.date, CHECKS_PER_REQUEST).catch(error => console.error('Daily verification failed', error)));
		// Every viewer sees the same numbers, so a short shared cache absorbs bursts; a closed day no longer changes.
		return json(standings, { headers: { 'cache-control': standings.final ? 'public, max-age=3600' : 'public, max-age=60' } });
	} catch (error) { return errorResponse(error); }
};
