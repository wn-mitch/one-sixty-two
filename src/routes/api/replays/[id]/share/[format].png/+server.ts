import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import {
	loadPublishedShareImage,
	parseShareFormat,
	safeShareMessage,
	ShareIncompatibleError,
	ShareNotFoundError,
	ShareUnavailableError
} from '#lib/server/share-images.ts';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function errorResponse(error: unknown): Response {
	const status = error instanceof ShareNotFoundError ? 404
		: error instanceof ShareIncompatibleError ? 409
		: error instanceof ShareUnavailableError ? 503
		: 500;
	return json({ message: safeShareMessage(error) }, { status, headers: NO_STORE });
}

export const GET: RequestHandler = async ({ params, request }) => {
	try {
		const format = parseShareFormat(params.format ?? '');
		const published = await loadPublishedShareImage(env, params.id ?? '', format);
		const headers = {
			'cache-control': 'public, max-age=31536000, immutable',
			'content-type': 'image/png',
			'content-length': String(published.bytes.byteLength),
			'etag': published.etag,
			'x-content-type-options': 'nosniff',
			'x-image-width': String(published.image.width),
			'x-image-height': String(published.image.height)
		};
		if (request.headers.get('if-none-match') === published.etag) return new Response(null, { status: 304, headers });
		return new Response(published.bytes as BodyInit, { headers });
	} catch (error) {
		return errorResponse(error);
	}
};

export const POST: RequestHandler = () => new Response(null, {
	status: 405,
	headers: { allow: 'GET', ...NO_STORE }
});
