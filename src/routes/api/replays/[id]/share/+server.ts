import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import {
	prepareSharePublication,
	readSharePublication,
	safeShareMessage,
	ShareIncompatibleError,
	ShareNotFoundError,
	ShareUnavailableError
} from '#lib/server/share-images.ts';

const NO_STORE = { 'cache-control': 'no-store' } as const;
const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' } as const;


function errorResponse(error: unknown): Response {
	const status = error instanceof ShareNotFoundError ? 404
		: error instanceof ShareIncompatibleError ? 409
		: error instanceof ShareUnavailableError ? 503
		: 500;
	return json({ message: safeShareMessage(error) }, { status, headers: NO_STORE });
}

export const POST: RequestHandler = async ({ params }) => {
	try {
		const publication = await prepareSharePublication(env, params.id ?? '');
		return json(publication, { headers: NO_STORE });
	} catch (error) {
		return errorResponse(error);
	}
};

export const GET: RequestHandler = async ({ params }) => {
	try {
		const publication = await readSharePublication(env, params.id ?? '');
		if (!publication) return json({ message: 'Share publication has not been prepared.' }, { status: 404, headers: NO_STORE });
		return json(publication, { headers: IMMUTABLE });
	} catch (error) {
		return errorResponse(error);
	}
};
