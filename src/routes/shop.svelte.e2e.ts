import { expect, test, type Page } from '@playwright/test';
import type { Db } from '../lib/storage/sql.ts';
import { finishName, itemsForTier } from '../lib/cosmetics/catalogue.ts';

const preview = '.preview-card .card';
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

async function earnToken(page: Page, count = 1): Promise<void> {
	// Stage one earned receipt; completion and migration semantics run against real SQLite in unit tests.
	await page.waitForFunction(() => '__deviceDb' in window);
	await page.evaluate(async count => {
		// The app exposes this device database hook for browser scenarios.
		const device = window as unknown as { __deviceDb: Db };
		await device.__deviceDb.run(Array.from({ length: count }, (_, index) => ({ sql: 'INSERT INTO shop_completions (key, completed_at, credit) VALUES (?, ?, 1)', bind: [`test-completed-run-${index}`, 'example'] })));
	}, count);
	await page.reload();
}

test('an empty wallet explains how to earn; unlocking applies the finish in one step and persists', async ({ page }) => {
	await page.goto('/shop');
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await expect(page.getByText('Cosmetic finishes · 1 token each.')).toBeVisible();
	await expect(page.getByText(/No tokens yet/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Play a season' })).toBeVisible();
	await expect(page.getByLabel('Show card')).toHaveCount(0);

	await page.getByRole('button', { name: /^Holo patterns/ }).click();
	await page.getByRole('button', { name: 'Refractor, 1 token', exact: true }).scrollIntoViewIfNeeded();
	const scrolled = await page.evaluate(() => scrollY);
	await page.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Refractor' });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole('button', { name: /^Unlock and apply/ })).toBeDisabled();
	await expect(sheet.getByText(/You need a token/)).toBeVisible();
	await expect(sheet.locator('.card')).toHaveAttribute('data-finish', 'gem');
	await sheet.getByRole('button', { name: 'Close finish' }).click();
	await expect(sheet).toBeHidden();
	// Comparing finishes never moves the catalogue.
	expect(await page.evaluate(() => scrollY)).toBe(scrolled);

	// The pattern and its colorway are separate unlocks.
	await earnToken(page, 2);
	await expect(page.locator('.balance')).toHaveText('2 unlock tokens');
	await expect(page.getByText(/No tokens yet/)).toHaveCount(0);
	await page.getByRole('button', { name: /^Holo patterns/ }).click();
	await page.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	await sheet.getByLabel(/Holo colorway/).selectOption('ice');
	await expect(sheet.getByText('Unlocks the pattern and the colorway.')).toBeVisible();
	await sheet.getByRole('button', { name: 'Unlock and apply to Gem cards, 2 tokens', exact: true }).click();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await expect(sheet.getByRole('button', { name: 'Applied to Gem cards', exact: true })).toBeDisabled();
	await expect(sheet.locator('.card')).toHaveAttribute('data-film', 'refractor');
	const appliedPalette = await sheet.locator('.card').getAttribute('data-palette');
	await expect(page.locator('.site-header .shop-link')).toHaveAccessibleName('Shop, 0 tokens');
	await sheet.getByRole('button', { name: 'Close finish' }).click();

	await page.reload();
	await page.getByRole('button', { name: /^Holo patterns/ }).click();
	await page.getByRole('button', { name: 'Refractor, Applied', exact: true }).click();
	await expect(sheet.getByLabel(/Holo colorway/)).toHaveValue('ice');
	await expect(sheet.locator('.card')).toHaveAttribute('data-palette', appliedPalette!);
	await sheet.getByRole('button', { name: 'Close finish' }).click();
	await page.getByRole('button', { name: /^Original finish/ }).click();
	const original = page.getByRole('dialog', { name: 'Original finish' });
	await original.getByRole('button', { name: 'Restore original Gem finish', exact: true }).click();
	await expect(original.getByRole('button', { name: 'Applied to Gem cards', exact: true })).toBeDisabled();
	await original.getByRole('button', { name: 'Close finish' }).click();
	await expect(page.getByRole('button', { name: 'Refractor, Owned', exact: true })).toBeVisible();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
});

test('one foil unlock applies to Silver and Gold cards without spending again', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/shop');
	await earnToken(page);
	const plate = itemsForTier('foil')[0]!;
	await page.getByRole('button', { name: `${finishName(plate)}, 1 token`, exact: true }).click();
	const detail = page.locator('.side');
	await detail.getByRole('button', { name: 'Unlock and apply to Silver foil cards, 1 token', exact: true }).click();
	await expect(detail.getByRole('button', { name: 'Applied to Silver foil cards', exact: true })).toBeDisabled();
	await detail.getByRole('button', { name: 'Gold emboss cards', exact: true }).click();
	await expect(detail.locator('.card')).toHaveAttribute('data-finish', 'emboss');
	await detail.getByRole('button', { name: 'Apply to Gold emboss cards', exact: true }).click();
	await expect(detail.getByRole('button', { name: 'Applied to Gold emboss cards', exact: true })).toBeDisabled();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
});

test('the finish preview reports data failures and can retry', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.route('**/data/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
	await page.goto('/shop');
	await expect(page.locator('.side').getByRole('alert')).toBeVisible();
	await page.unroute('**/data/**');
	await page.getByRole('button', { name: 'Retry preview', exact: true }).click();
	await expect(page.locator(preview)).toHaveAttribute('data-finish', 'foil', { timeout: 60_000 });
});

for (const width of [390, 1440]) {
	test(`Shop appends every finish without replacing earlier choices at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/shop');
		await page.getByRole('button', { name: /^Holo patterns/ }).click();
		const expected = itemsForTier('gem').map(item => item.id);
		const choices = page.locator('.finish-choice[data-finish-id]');
		await expect(choices.first()).toBeVisible();
		for (;;) {
			const count = await choices.count();
			if (count === expected.length) break;
			await page.locator('.load-more').scrollIntoViewIfNeeded();
			await expect(page.locator(`[data-finish-id="${expected[count]}"]`)).toBeAttached();
		}
		expect(await choices.evaluateAll(buttons => buttons.map(button => button.getAttribute('data-finish-id')))).toEqual(expected);
		await expect(page.getByRole('button', { name: 'More finishes' })).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
		// Several choices are visible together on a phone, without a horizontal rail.
		if (width === 390) {
			await page.evaluate(() => scrollTo(0, 0));
			const visible = await choices.evaluateAll(buttons => buttons.filter(button => button.getBoundingClientRect().top < innerHeight).length);
			expect(visible).toBeGreaterThanOrEqual(2);
		}
	});
}

test('the card factory recolors one era’s own holo, reuses the colorway free, and keeps it after a reload', async ({ page }) => {
	await page.goto('/factory');
	await earnToken(page);
	await page.getByRole('button', { name: /^1980s,/ }).click();
	await page.getByLabel('Holo pattern').selectOption('');
	await page.getByLabel('Colorway').selectOption('synthwave');
	await page.getByRole('button', { name: /Unlock & apply/ }).click();
	await expect(page.getByRole('button', { name: '1980s, Era original · Synthwave' })).toBeVisible();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await page.getByRole('button', { name: /^1990s,/ }).click();
	await page.getByLabel('Holo pattern').selectOption('');
	await page.getByLabel('Colorway').selectOption('synthwave');
	await page.getByRole('button', { name: 'Apply to 1990s cards' }).click();
	await expect(page.getByRole('button', { name: '1990s, Era original · Synthwave' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: '1980s, Era original · Synthwave' })).toBeVisible();
	await page.getByRole('button', { name: /^1980s,/ }).click();
	await page.getByLabel('Holo pattern').selectOption('deck');
	await page.getByRole('button', { name: 'Use deck default' }).click();
	await expect(page.getByRole('button', { name: '1980s, Deck default' })).toBeVisible();
});
