/**
 * The distribution surface the page runs in. The iOS app's web view marks the document before any page
 * script runs (`ios/Sources/GameViewController.swift`); everything else is the website. Screen width and
 * user agent never decide this: mobile Safari is the website.
 */
export type AppHost = 'web' | 'ios-app';

export function appHost(): AppHost {
	if (typeof document === 'undefined') return 'web';
	return document.documentElement.dataset.host === 'ios-app' ? 'ios-app' : 'web';
}

/** The website's support page. */
export const SUPPORT_URL = 'https://ko-fi.com/thealpacalypse';

/** External support links (Ko-fi) appear on the website only; the iOS app ships without them. */
export function showsExternalSupport(): boolean {
	return appHost() === 'web';
}
