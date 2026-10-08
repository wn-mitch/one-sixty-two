import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';
import {
	loadAuthenticatedShareModel,
	parseShareFormat,
	safeShareMessage,
	ShareAuthorizationError,
	ShareIncompatibleError,
	ShareNotFoundError,
	ShareUnavailableError
} from '#lib/server/share-images.ts';

export const load: PageServerLoad = async ({ params, request, setHeaders }) => {
	setHeaders({
		'cache-control': 'no-store',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	try {
		const format = parseShareFormat(params.format ?? '');
		const model = await loadAuthenticatedShareModel(
			env,
			params.model ?? '',
			request.headers.get('x-share-capture-token') ?? ''
		);
		return { model, format, capture: true };
	} catch (caught) {
		const status = caught instanceof ShareAuthorizationError ? 401
			: caught instanceof ShareNotFoundError ? 404
			: caught instanceof ShareIncompatibleError ? 409
			: caught instanceof ShareUnavailableError ? 503
			: 500;
		error(status, safeShareMessage(caught));
	}
};
