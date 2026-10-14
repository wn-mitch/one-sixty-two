import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { labFragment, loadLabLink } from '#lib/server/lab-links.ts';

/** Opens a saved lab link: the lab, loaded with the saved state through its `#…` fragment. */
export const GET: RequestHandler = async ({ params }) => {
	let state: Record<string, unknown> | null;
	try {
		state = await loadLabLink(env.REPLAYS, params.id ?? '');
	} catch (error) {
		console.error('Lab link load failed', error);
		return new Response('Lab link storage is unavailable. Please retry.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
	}
	if (!state) return new Response('This lab link does not exist.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
	// Saved links never change, so the redirect can be cached; a day keeps a moved lab route recoverable.
	return new Response(null, { status: 302, headers: { location: `/lab#${labFragment(state)}`, 'cache-control': 'public, max-age=86400' } });
};
