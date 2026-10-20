import { dailyDate } from '../game/daily.ts';
import { SITE_PREVIEW } from '../share/site-preview.ts';
import type { ReplayAssets, ReplayBucket } from './replays.ts';
import { pngDimensions } from './share-images.ts';

/** Under `shares/`, so the bucket's 90-day lifecycle rule also expires old daily previews. */
export const DAILY_PREVIEW_PREFIX = 'shares/site/daily/';
const ASSET_ORIGIN = 'https://162-zero.internal';
const CAPTURE_TIMEOUT_MS = 25_000;

/** Cloudflare's Browser Run binding, declared as `BROWSER` in wrangler.jsonc; only the screenshot quick action is used. */
export interface BrowserRun {
	quickAction(action: 'screenshot', options: {
		url: string;
		selector: string;
		viewport: { width: number; height: number };
		waitForSelector: { selector: string; timeout: number };
		gotoOptions: { waitUntil: 'networkidle0'; timeout: number };
	}): Promise<Response>;
}

export interface SitePreviewBindings {
	REPLAYS: ReplayBucket;
	ASSETS: ReplayAssets;
	PUBLIC_ORIGIN: string;
	BROWSER?: BrowserRun;
}

export interface SitePreview {
	bytes: Uint8Array<ArrayBuffer>;
	/** The day's stamped preview; false when serving the undated `static/og.png` instead. */
	dated: boolean;
}

export function dailyPreviewKey(date: string): string {
	return `${DAILY_PREVIEW_PREFIX}${date}.png`;
}

async function bytesOf(body: BodyInit | null): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await new Response(body).arrayBuffer());
}

/** Screenshots the `/og-image` page stamped for `date`; throws unless it returns a 1200×630 PNG. */
async function capture(browser: BrowserRun, origin: string, date: string): Promise<Uint8Array<ArrayBuffer>> {
	const response = await browser.quickAction('screenshot', {
		url: new URL(`/og-image?date=${date}`, origin).href,
		selector: '[data-site-og]',
		viewport: { width: SITE_PREVIEW.width, height: SITE_PREVIEW.height },
		waitForSelector: { selector: '[data-og-ready="true"]', timeout: CAPTURE_TIMEOUT_MS },
		gotoOptions: { waitUntil: 'networkidle0', timeout: CAPTURE_TIMEOUT_MS }
	});
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`Site preview capture failed with ${response.status}`);
	}
	const bytes = await bytesOf(response.body);
	const { width, height } = pngDimensions(bytes);
	if (width !== SITE_PREVIEW.width || height !== SITE_PREVIEW.height) throw new Error(`Site preview capture is ${width}×${height}`);
	return bytes;
}

/**
 * Today's site preview with the daily stamp: stored in R2 once captured, captured with Browser Run on
 * the day's first request, and `static/og.png` whenever the binding is absent or the capture fails.
 */
export async function dailySitePreview(bindings: SitePreviewBindings, now = new Date()): Promise<SitePreview> {
	const date = dailyDate(now);
	const key = dailyPreviewKey(date);
	try {
		const stored = await bindings.REPLAYS.get(key);
		if (stored) return { bytes: await bytesOf(stored.body as BodyInit), dated: true };
		if (bindings.BROWSER) {
			const bytes = await capture(bindings.BROWSER, bindings.PUBLIC_ORIGIN, date);
			// Two first requests may both capture; the first stored copy wins and both are the same day's preview.
			await bindings.REPLAYS.put(key, bytes, { httpMetadata: { contentType: 'image/png' }, onlyIf: { etagDoesNotMatch: '*' } });
			return { bytes, dated: true };
		}
	} catch (error) {
		console.error('Daily site preview unavailable', error);
	}
	const fallback = await bindings.ASSETS.fetch(new URL(SITE_PREVIEW.fallbackPath, ASSET_ORIGIN));
	if (!fallback.ok) throw new Error(`Site preview fallback is missing (${fallback.status})`);
	return { bytes: await bytesOf(fallback.body), dated: false };
}
