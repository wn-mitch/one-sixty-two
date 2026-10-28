import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { uploadAllowed } from '#lib/server/rate-limit.ts';
import { loadCurrentDataVersion } from '#lib/server/replays.ts';
import { DRAFT_REPORT_MAX_BYTES, publishDraftReport } from '#lib/server/draft-reports.ts';
import { PNG_MAX_BYTES, safeShareMessage, ShareIncompatibleError, ShareInvalidError, ShareNotFoundError, ShareUnavailableError } from '#lib/server/share-images.ts';

const NO_STORE = { 'cache-control': 'no-store' } as const;
/** The report, its card image and a little room for multipart framing. */
const UPLOAD_MAX_BYTES = DRAFT_REPORT_MAX_BYTES + PNG_MAX_BYTES + 16 * 1024;

/** Publishes a finished Draft season: multipart `report` (JSON) and an optional `card` PNG. */
export const POST: RequestHandler = async ({ request }) => {
	if (!(await uploadAllowed(env.UPLOAD_LIMIT, request))) return json({ message: 'Too many uploads. Please wait a minute and retry.' }, { status: 429, headers: { ...NO_STORE, 'retry-after': '60' } });
	try {
		if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) throw new ShareInvalidError('The share upload is too large.');
		let form: FormData;
		try { form = await request.formData(); }
		catch { throw new ShareInvalidError(); }
		let report: unknown;
		try { report = JSON.parse(String(form.get('report') ?? '')); }
		catch { throw new ShareInvalidError('The shared season is not readable.'); }
		const card = form.get('card');
		const image = card instanceof Blob ? new Uint8Array(await card.arrayBuffer()) : null;
		return json(await publishDraftReport(env, report, image, await loadCurrentDataVersion(env.ASSETS)), { status: 201, headers: NO_STORE });
	} catch (error) {
		const status = error instanceof ShareNotFoundError ? 404 : error instanceof ShareInvalidError ? 400 : error instanceof ShareIncompatibleError ? 409 : error instanceof ShareUnavailableError ? 503 : 500;
		return json({ message: safeShareMessage(error) }, { status, headers: NO_STORE });
	}
};

export const GET: RequestHandler = () => new Response(null, { status: 405, headers: { allow: 'POST' } });
