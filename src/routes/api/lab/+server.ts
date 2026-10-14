import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { uploadAllowed } from '#lib/server/rate-limit.ts';
import { LAB_LINK_MAX_BYTES, LabLinkInvalidError, storeLabLink } from '#lib/server/lab-links.ts';

/** Reads at most LAB_LINK_MAX_BYTES of the body; null when it is longer. */
async function boundedText(request: Request): Promise<string | null> {
	const reader = request.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > LAB_LINK_MAX_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
	return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

/** Saves a foil lab state and returns its short link, `/lab/s/<id>`. */
export const POST: RequestHandler = async ({ request, url }) => {
	if (!(await uploadAllowed(env.UPLOAD_LIMIT, request))) return json({ message: 'Too many saves. Please wait a minute and retry.' }, { status: 429, headers: { 'retry-after': '60' } });
	const contentLength = request.headers.get('content-length');
	if (contentLength && Number(contentLength) > LAB_LINK_MAX_BYTES) return json({ message: 'Lab setup is too large.' }, { status: 413 });
	let body: unknown;
	try {
		const text = await boundedText(request);
		if (text === null) return json({ message: 'Lab setup is too large.' }, { status: 413 });
		body = JSON.parse(text);
	} catch {
		return json({ message: 'Lab setup is invalid.' }, { status: 400 });
	}
	try {
		const id = await storeLabLink(env.REPLAYS, body);
		return json({ id, url: `${url.origin}/lab/s/${id}` }, { status: 201, headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		if (error instanceof LabLinkInvalidError) return json({ message: 'Lab setup is invalid.' }, { status: 400 });
		console.error('Lab link save failed', error);
		return json({ message: 'Lab link storage is unavailable. Please retry.' }, { status: 503 });
	}
};

export const GET: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
