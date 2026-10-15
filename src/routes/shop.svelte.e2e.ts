import { expect, test } from '@playwright/test';
import type { Db } from '../lib/storage/sql.ts';
import { itemsForTier } from '../lib/cosmetics/catalogue.ts';

const palette = '.preview-card .card';
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

test('owned finishes persist without changing tiers, and an empty wallet cannot buy', async ({ page }) => {
	await page.goto('/shop');
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await page.getByRole('button', { name: 'refractor 1 token', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Unlock · 1 token', exact: true })).toBeDisabled();
	await expect(page.locator(palette)).toHaveAttribute('data-finish', 'gem');

	// Stage one earned receipt; completion and migration semantics run against real SQLite in unit tests.
	await page.evaluate(async () => {
		// The app exposes this device database hook for browser scenarios.
		const device = window as unknown as { __deviceDb: Db };
		await device.__deviceDb.run([{ sql: "INSERT INTO shop_completions (key, completed_at, credit) VALUES ('test-completed-run', 'example', 1)" }]);
	});
	await page.reload();
	await expect(page.locator('.balance')).toHaveText('1 unlock token');
	await page.getByRole('button', { name: 'refractor 1 token', exact: true }).click();
	await page.getByLabel('Holo colorway').selectOption('ice');
	await page.getByRole('button', { name: 'Unlock · 1 token', exact: true }).click();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await expect(page.locator('.site-header .wallet-link')).toHaveAccessibleName('Shop: 0 unlock tokens');
	await page.getByRole('button', { name: 'Equip for all Gem cards', exact: true }).click();
	await expect(page.locator('.commit').getByRole('button', { name: 'Equipped', exact: true })).toBeDisabled();
	const equippedPalette = await page.locator(palette).getAttribute('data-palette');
	await expect(page.locator(palette)).toHaveAttribute('data-film', 'refractor');
	await expect(page.locator(`${palette} canvas[data-presented]`)).toBeVisible();

	await page.reload();
	await expect(page.locator('.preview h2')).toHaveText('refractor');
	await expect(page.getByLabel('Holo colorway')).toHaveValue('ice');
	await expect(page.locator(palette)).toHaveAttribute('data-palette', equippedPalette!);
	await expect(page.locator(palette)).toHaveAttribute('data-finish', 'gem');
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await page.getByRole('link', { name: 'Play', exact: true }).click();
	await page.getByRole('link', { name: 'Shop: 0 unlock tokens', exact: true }).click();
	await expect(page).toHaveURL(/\/shop$/);

	await page.getByRole('button', { name: 'Silver foil', exact: true }).click();
	await expect(page.getByLabel('Holo colorway')).toHaveCount(0);
	await expect(page.locator(palette)).toHaveAttribute('data-finish', 'foil');
	await expect(page.locator(palette)).not.toHaveAttribute('data-film', 'refractor');
	await page.getByRole('button', { name: 'Gem', exact: true }).click();
	await page.getByRole('button', { name: 'Original by era', exact: true }).click();
	await page.getByRole('button', { name: 'Equip for all Gem cards', exact: true }).click();
	await page.reload();
	await expect(page.locator('.preview h2')).toHaveText('Original by era');
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await expect(page.getByRole('button', { name: 'refractor Owned', exact: true })).toBeVisible();
});

test('Base preview reports data failures and can retry without changing tiers', async ({ page }) => {
	await page.route('**/data/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
	await page.goto('/shop');
	await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Base', exact: true }).click();
	await expect(page.locator('.stock').getByRole('alert')).toBeVisible();
	await page.unroute('**/data/**');
	await page.getByRole('button', { name: 'Retry preview', exact: true }).click();
	await expect(page.locator('.stock .card')).toHaveAttribute('data-finish', 'base', { timeout: 60_000 });
});

for (const width of [390, 1440]) {
	test(`Shop appends every finish without replacing earlier choices at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/shop');
		await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
		const expected = itemsForTier('gem').map(item => item.id);
		const choices = page.locator('.plate-choice');
		const first = page.locator(`[data-finish-id="${expected[0]}"]`);
		await first.click();
		for (;;) {
			const count = await choices.count();
			if (count === expected.length) break;
			await page.locator('.load-more').scrollIntoViewIfNeeded();
			await expect(page.locator(`[data-finish-id="${expected[count]}"]`)).toBeAttached();
		}
		expect(await choices.evaluateAll(buttons => buttons.map(button => button.getAttribute('data-finish-id')))).toEqual(expected);
		await expect(first).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('button', { name: 'Load more finishes' })).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

		await page.getByRole('button', { name: 'Silver foil', exact: true }).click();
		const silver = itemsForTier('foil').map(item => item.id);
		await expect(page.locator(`[data-finish-id="${silver[0]}"]`)).toBeAttached();
		const shown = await choices.evaluateAll(buttons => buttons.map(button => button.getAttribute('data-finish-id')));
		expect(shown).toEqual(silver.slice(0, shown.length));
	});
}

test('hiding card artwork previews the real finish without losing the selected pattern or colorway', async ({ page }) => {
	await page.goto('/shop');
	await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'cracked-ice 1 token', exact: true }).click();
	await page.getByLabel('Show card', { exact: true }).uncheck();
	const sample = page.locator('.preview-card [data-finish-sample]');
	await expect(sample).toHaveAttribute('data-film', 'cracked-ice');
	await expect(sample.locator('canvas[data-presented]')).toBeVisible();
	await expect(page.locator('.shop-layout .card')).toHaveCount(0);
	await page.getByLabel('Holo colorway').selectOption('ice');
	const selectedPalette = await sample.getAttribute('data-palette');
	expect(selectedPalette).not.toBeNull();
	await page.getByLabel('Show card', { exact: true }).check();
	await expect(page.locator(palette)).toHaveAttribute('data-film', 'cracked-ice');
	await expect(page.locator(palette)).toHaveAttribute('data-palette', selectedPalette!);
	await expect(page.getByLabel('Holo colorway')).toHaveValue('ice');
	await page.getByRole('button', { name: 'Silver foil', exact: true }).click();
	await page.getByLabel('Show card', { exact: true }).uncheck();
	await expect(sample).toHaveAttribute('data-finish', 'foil');
	await expect(sample.locator('canvas[data-presented]')).toBeVisible();
	await expect(page.getByLabel('Holo colorway')).toHaveCount(0);
});
