/** The site's own link preview, captured to static/og.png by `npm run og:capture`. */
export const SITE_PREVIEW = {
	path: '/og.png',
	width: 1200,
	height: 630,
	type: 'image/png',
	alt: '162-0: a hand of historical baseball cards fanned beside the title'
} as const;

/** Prerendered pages have no request origin, so their absolute preview URL uses the production site. */
export const SITE_ORIGIN = 'https://162-0.dev';

export function sitePreviewImage(origin: string = SITE_ORIGIN) {
	const { path, ...image } = SITE_PREVIEW;
	return { ...image, url: new URL(path, origin).href };
}
