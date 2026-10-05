import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { loadAuthoritativeManifest, REPLAY_MAX_BYTES, safeReplayMessage, storeReplay } from '#lib/server/replays.ts';
const boundedBody = async (request: Request): Promise<Uint8Array | null> => {
	const reader = request.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > REPLAY_MAX_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
	return body;
};

export const POST: RequestHandler = async ({ request, url }) => {
	const contentLength = request.headers.get('content-length');
	if (contentLength && Number(contentLength) > REPLAY_MAX_BYTES) return json({ message: 'Replay is too large.' }, { status: 413 });
	let body: unknown;
	try {
		const bytes = await boundedBody(request);
		if (!bytes) return json({ message: 'Replay is too large.' }, { status: 413 });
		body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		return json({ message: 'Replay payload is invalid.' }, { status: 400 });
	}
	try {
		const manifest = await loadAuthoritativeManifest(env.ASSETS);
		const stored = await storeReplay(env.REPLAYS, body, manifest);
		return json({ id: stored.id, url: `${url.origin}/r/${stored.id}` }, {
			status: 201,
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		const message = safeReplayMessage(error);
		const status = message === 'Replay is incompatible with this dataset.' ? 409 : message === 'Replay storage is unavailable. Please retry.' ? 503 : 400;
		return json({ message }, { status });
	}
};

export const GET: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
