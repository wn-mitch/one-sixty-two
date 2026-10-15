import { chromium } from 'playwright';
import { mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

/** Capture 24 real showcase card fronts from the capture-only OG surface. */
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const output = 'static/loading-cards';
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 1 });
	await page.goto(new URL('/og-image?loading-cards', base).href);
	await page.locator('[data-og-ready="true"]').waitFor({ timeout: 60_000 });
	await page.evaluate(async () => {
		for (const image of document.images) image.loading = 'eager';
		await Promise.all([...document.images].map(image => image.decode()));
		await document.fonts.ready;
	});
	const cards = page.locator('.capture-card > [data-card]');
	const eras = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-card')!));
	const perEra = new Map<string, number>();
	const selected = eras.flatMap((era, index) => {
		const count = perEra.get(era) ?? 0;
		perEra.set(era, count + 1);
		return count < 3 ? [index] : [];
	});
	if (selected.length !== 24) throw new Error(`Showcase provides ${selected.length} cards; three per era required`);
	await mkdir(output, { recursive: true });
	for (let index = 0; index < 24; index += 1) {
		const card = cards.nth(selected[index]!);
		await card.scrollIntoViewIfNeeded();
		await card.locator('[data-fit-state="pending"]').waitFor({ state: 'detached' });
		const png = await card.screenshot({ type: 'png' });
		execFileSync('magick', ['png:-', '-quality', '85', `${output}/${String(index + 1).padStart(2, '0')}.webp`], { input: png });
	}
	const sizes = await Promise.all(Array.from({ length: 24 }, (_, index) => stat(`${output}/${String(index + 1).padStart(2, '0')}.webp`).then(file => file.size)));
	console.log(`Wrote 24 static cards to ${output}/ (${sizes.join(', ')} bytes)`);
} finally {
	await browser.close();
}
