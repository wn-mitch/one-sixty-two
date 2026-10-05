import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { loadAuthoritativeManifest, loadReplay, safeReplayMessage } from '#lib/server/replays.ts';

export const GET: RequestHandler = async ({ params }) => {
	const id = params.id ?? '';
	if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return json({ message: 'Replay not found. Check the link and try again.' }, { status: 404 });
	try {
		const manifest = await loadAuthoritativeManifest(env.ASSETS);
		const replay = await loadReplay(env.REPLAYS, id, manifest);
		return json(replay, {
			headers: {
				'cache-control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (error) {
		const message = safeReplayMessage(error);
		const status = message === 'Replay not found. Check the link and try again.' ? 404 : message === 'Replay is incompatible with this dataset.' ? 409 : 503;
		return json({ message }, { status });
	}
};

export const POST: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'GET' } });
