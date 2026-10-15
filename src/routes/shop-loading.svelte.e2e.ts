import { expect, test, type Page } from '@playwright/test';

/** Holds the real manifest request so the route cannot become ready early. */
async function holdShopManifest(page: Page): Promise<() => void> {
	let release!: () => void;
	const gate = new Promise<void>(resolve => { release = resolve; });
	await page.route('**/data/current.json', async route => {
		await gate;
		await route.continue();
	});
	return release;
}

test.use({ reducedMotion: 'no-preference' });

test('shop keeps the screen loader through delayed content and fades in when previews and wallet are ready', async ({ page }) => {
	await page.goto('/about');
	const release = await holdShopManifest(page);
	await page.getByRole('link', { name: /^Shop/ }).click();
	// The request is held by the route handler before readiness can be published.

	const loader = page.locator('[data-card-loader]');
	const destination = page.locator('.shop-page');
	await expect(destination).toHaveClass(/motion-enabled/);
	await expect(loader).toBeVisible();
	await expect(destination).not.toHaveClass(/content-ready/);
	await expect.poll(() => destination.evaluate(node => getComputedStyle(node).opacity)).toBe('0');
	release();
	await expect(destination).toHaveClass(/content-ready/, { timeout: 30_000 });
	await expect(page.getByRole('heading', { name: 'Shop' })).toBeVisible();
	await expect(destination).toHaveCSS('opacity', '1', { timeout: 30_000 });
	await expect(destination).toHaveCSS('transform', 'none');
	await expect(loader).toHaveCount(0, { timeout: 1_000 });
});
