import { env } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';
import {
	readSharePublication,
	ShareIncompatibleError,
	ShareNotFoundError,
	ShareUnavailableError
} from '#lib/server/share-images.ts';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	const replayId = params.id ?? '';
	const canonical = new URL(`/c/${encodeURIComponent(replayId)}`, env.PUBLIC_ORIGIN).href;
	const generic = {
		replayId,
		record: null,
		title: 'Challenge | 162-0',
		description: 'Draft a historical roster, play 162 games, then take on this club in a best-of-five.',
		canonical,
		image: null
	};
	try {
		const publication = await readSharePublication(env, replayId);
		if (!publication) return generic;
		const { wins, losses } = publication.record;
		return {
			replayId: publication.replayId,
			record: { wins, losses },
			title: `Beat ${wins}-${losses} | 162-0`,
			description: `Draft your own club, play 162 games, then take on this ${wins}-${losses} club in a best-of-five.`,
			canonical,
			image: {
				url: new URL(publication.images.field.url, env.PUBLIC_ORIGIN).href,
				width: publication.images.field.width,
				height: publication.images.field.height,
				type: 'image/png',
				alt: `162-0 share card for a ${wins}-${losses} season`
			}
		};
	} catch (caught) {
		if (caught instanceof ShareNotFoundError || caught instanceof ShareIncompatibleError || caught instanceof ShareUnavailableError) return generic;
		throw caught;
	}
};
