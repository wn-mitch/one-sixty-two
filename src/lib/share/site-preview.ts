/**
 * The site's own link preview: today's capture with the daily stamp, served by the Worker at `path`, or the
 * undated `fallbackPath` (static/og.png, captured by `npm run og:capture`) when today's cannot be made.
 */
export const SITE_PREVIEW = {
	path: '/og/daily.png',
	fallbackPath: '/og.png',
	width: 1200,
	height: 630,
	type: 'image/png',
	alt: '162-0: a hand of historical baseball cards fanned beside the title and today’s daily stamp'
} as const;

/** Prerendered pages have no request origin, so their absolute preview URL uses the production site. */
export const SITE_ORIGIN = 'https://162-0.dev';

export function sitePreviewImage(origin: string = SITE_ORIGIN) {
	const { width, height, type, alt } = SITE_PREVIEW;
	return { width, height, type, alt, url: new URL(SITE_PREVIEW.path, origin).href };
}
