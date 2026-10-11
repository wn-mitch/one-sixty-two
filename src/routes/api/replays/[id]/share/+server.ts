import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import {
	PNG_MAX_BYTES,
	publishShare,
	readSharePublication,
	safeShareMessage,
	ShareIncompatibleError,
	ShareInvalidError,
	ShareNotFoundError,
	ShareUnavailableError
} from '#lib/server/share-images.ts';
import { SHARE_FORMATS, type ShareFormat } from '#lib/share/types.ts';

const NO_STORE = { 'cache-control': 'no-store' } as const;
const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' } as const;
/** The PNG plus a little room for the record and multipart framing. */
const UPLOAD_MAX_BYTES = PNG_MAX_BYTES * SHARE_FORMATS.length + 64 * 1024;

function errorResponse(error: unknown): Response {
	const status = error instanceof ShareNotFoundError ? 404
		: error instanceof ShareInvalidError ? 400
		: error instanceof ShareIncompatibleError ? 409
		: error instanceof ShareUnavailableError ? 503
		: 500;
	return json({ message: safeShareMessage(error) }, { status, headers: NO_STORE });
}

/** Publishes the season images the player's browser captured: multipart `record` (JSON) and one PNG per format. */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) throw new ShareInvalidError('The share upload is too large.');
		let form: FormData;
		try { form = await request.formData(); }
		catch { throw new ShareInvalidError(); }
		let record: unknown;
		try { record = JSON.parse(String(form.get('record') ?? '')); }
		catch { throw new ShareInvalidError('The shared record is not readable.'); }
		const images: Partial<Record<ShareFormat, Uint8Array<ArrayBuffer>>> = {};
		for (const format of SHARE_FORMATS) {
			const file = form.get(format);
			if (file instanceof Blob) images[format] = new Uint8Array(await file.arrayBuffer());
		}
		return json(await publishShare(env, params.id ?? '', record, images), { headers: NO_STORE });
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
