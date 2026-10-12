import { chromium } from 'playwright';

/**
 * Captures the site link preview to static/og.png from a running dev server:
 * `npm run og:capture -- http://127.0.0.1:5173`.
 */
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
	await page.goto(new URL('/og-image', base).href);
	await page.locator('[data-og-ready="true"]').waitFor({ timeout: 60_000 });
	// Card photos load lazily after the frame renders.
	await page.waitForFunction(() => [...document.images].every(image => image.complete));
	// Development overlays (feedback tools, toasts) sit above the frame; keep only the preview.
	await page.addStyleTag({ content: 'body > :not(:has([data-site-og])) { display: none !important; }' });
	await page.locator('[data-site-og]').screenshot({ path: 'static/og.png' });
	console.log('Wrote static/og.png');
} finally {
	await browser.close();
}
