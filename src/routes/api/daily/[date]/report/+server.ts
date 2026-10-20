import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { reportName } from '#lib/server/daily-board.ts';
import { DailyRequestError } from '#lib/server/daily-standings.ts';
import { uploadAllowed } from '#lib/server/rate-limit.ts';

/** Reports a board name: `{ entry, token }`. Answers 204 whether or not the report counted, so it reveals nothing. */
export const POST: RequestHandler = async ({ params, request }) => {
	if (!(await uploadAllowed(env.UPLOAD_LIMIT, request))) return json({ message: 'Too many requests. Please wait a minute and retry.' }, { status: 429, headers: { 'retry-after': '60' } });
	let body: unknown;
	try { body = await request.json(); }
	catch { return json({ message: 'The report is invalid.' }, { status: 400 }); }
	try {
		await reportName(env, params.date, body);
		return new Response(null, { status: 204 });
	} catch (error) {
		if (error instanceof DailyRequestError) return json({ message: error.message }, { status: error.status });
		console.error('Name report failed unexpectedly', error);
		return json({ message: 'Reports are unavailable. Please retry.' }, { status: 503 });
	}
};
