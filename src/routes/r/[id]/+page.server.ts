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
	const canonical = new URL(`/r/${encodeURIComponent(replayId)}`, env.PUBLIC_ORIGIN).href;
	const generic = {
		title: 'Shared roster | 162-0',
		description: 'Open this shared 162-0 roster and replay its 162-game season.',
		canonical,
		image: null
	};
	try {
		const publication = await readSharePublication(env, replayId);
		if (!publication) return generic;
		const { wins, losses, firstLoss, longestWinningStreak } = publication.record;
		const streakGames = `${longestWinningStreak} ${longestWinningStreak === 1 ? 'game' : 'games'}`;
		const resultSummary = firstLoss === null ? 'No losses.' : `First loss: Game ${firstLoss}.`;
		return {
			title: `${wins}-${losses} season | 162-0`,
			description: `${resultSummary} Longest winning streak: ${streakGames}. Can you beat ${wins}-${losses}?`,
			canonical: new URL(publication.replayUrl, env.PUBLIC_ORIGIN).href,
			image: {
				url: new URL(publication.images.wide.url, env.PUBLIC_ORIGIN).href,
				width: publication.images.wide.width,
				height: publication.images.wide.height,
				type: 'image/png',
				alt: `162-0 share card for a ${wins}-${losses} season`
			}
		};
	} catch (caught) {
		if (caught instanceof ShareNotFoundError || caught instanceof ShareIncompatibleError || caught instanceof ShareUnavailableError) return generic;
		throw caught;
	}
};
