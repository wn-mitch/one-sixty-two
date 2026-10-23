import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { uploadAllowed } from '#lib/server/rate-limit.ts';
import { stadiumError, stadiumSummaries, submitStadiumRun } from '#lib/server/stadium-standings.ts';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** Submits one own season at its home park: `{ replayId, token, wins }`. */
export const POST: RequestHandler = async ({ request }) => {
	if (!(await uploadAllowed(env.UPLOAD_LIMIT, request))) return json({ message: 'Too many uploads. Please wait a minute and retry.' }, { status: 429, headers: { 'retry-after': '60' } });
	let body: unknown;
	try { body = await request.json(); }
	catch { return json({ message: 'The submission is invalid.' }, { status: 400, headers: NO_STORE }); }
	try { return json(await submitStadiumRun(env, body), { headers: NO_STORE }); }
	catch (error) { return stadiumError(error); }
};

/** Every park's run count, typical record and top-10% line; every viewer sees the same numbers. */
export const GET: RequestHandler = async () => {
	try { return json({ stadiums: await stadiumSummaries(env) }, { headers: { 'cache-control': 'public, max-age=300' } }); }
	catch (error) { return stadiumError(error); }
};
