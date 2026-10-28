import { env } from 'cloudflare:workers';
import type { PageServerLoad } from './$types';
import { DRAFT_CARD, draftReportImageUrl, loadDraftReport } from '#lib/server/draft-reports.ts';
import { ShareIncompatibleError, ShareInvalidError, ShareNotFoundError, ShareUnavailableError } from '#lib/server/share-images.ts';
import { sitePreviewImage } from '#lib/share/site-preview.ts';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	const id = params.id ?? '';
	const origin = env.PUBLIC_ORIGIN.replace(/\/+$/, '');
	const canonical = `${origin}/d/${encodeURIComponent(id)}`;
	try {
		const { report, image } = await loadDraftReport(env, id);
		const { wins, losses } = report.record;
		const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
		return {
			report, canonical, missing: null,
			title: `${report.club} ${wins}-${losses} | 162-0 Draft Mode`,
			description: `${ordinal(report.place)} of 8 in a Draft Mode league, grade ${report.grade}. ${report.rival.wins}-${report.rival.losses} against ${report.rival.club}.`,
			image: image
				? { url: draftReportImageUrl(origin, id), width: DRAFT_CARD.width, height: DRAFT_CARD.height, type: 'image/png', alt: `${report.club} ${wins}-${losses} Draft Mode season card` }
				: sitePreviewImage(env.PUBLIC_ORIGIN)
		};
	} catch (caught) {
		if (!(caught instanceof ShareNotFoundError || caught instanceof ShareIncompatibleError || caught instanceof ShareInvalidError || caught instanceof ShareUnavailableError)) throw caught;
		return {
			report: null, canonical,
			missing: caught instanceof ShareUnavailableError ? 'Shared seasons are unavailable right now. Please retry.' : 'This shared season could not be found. Check the link and try again.',
			title: 'Shared Draft Mode season | 162-0', description: 'A finished 162-0 Draft Mode season.', image: sitePreviewImage(env.PUBLIC_ORIGIN)
		};
	}
};
