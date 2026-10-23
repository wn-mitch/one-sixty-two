import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { stadiumError, stadiumStandings } from '#lib/server/stadium-standings.ts';

/** A park's counted runs and their spread; `?wins=N` adds that record's standing. */
export const GET: RequestHandler = async ({ params, url }) => {
	const wins = url.searchParams.get('wins');
	try { return json(await stadiumStandings(env, params.id, wins === null ? null : Number(wins)), { headers: { 'cache-control': 'public, max-age=60' } }); }
	catch (error) { return stadiumError(error); }
};
