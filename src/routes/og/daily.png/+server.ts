import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { dailySitePreview } from '#lib/server/site-preview.ts';

/** The site link preview stamped with today's daily; see `dailySitePreview`. */
export const GET: RequestHandler = async () => {
	const preview = await dailySitePreview(env);
	return new Response(preview.bytes, {
		headers: {
			'content-type': 'image/png',
			'content-length': String(preview.bytes.byteLength),
			// A dated preview is good until midnight New York; the fallback retries the capture soon.
			'cache-control': preview.dated ? 'public, max-age=900' : 'public, max-age=60'
		}
	});
};
