import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { loadDraftReportImage } from '#lib/server/draft-reports.ts';
import { safeShareMessage, ShareNotFoundError, ShareUnavailableError } from '#lib/server/share-images.ts';

/** A shared Draft season's card image; immutable once stored. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const bytes = await loadDraftReportImage(env, params.id ?? '');
		return new Response(bytes as BodyInit, {
			headers: { 'cache-control': 'public, max-age=31536000, immutable', 'content-type': 'image/png', 'content-length': String(bytes.byteLength), 'x-content-type-options': 'nosniff' }
		});
	} catch (error) {
		const status = error instanceof ShareNotFoundError ? 404 : error instanceof ShareUnavailableError ? 503 : 500;
		return json({ message: safeShareMessage(error) }, { status, headers: { 'cache-control': 'no-store' } });
	}
};
