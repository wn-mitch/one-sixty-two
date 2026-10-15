import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Db } from '../lib/storage/sql.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

async function seedOwnedHoloPatterns(page: Page): Promise<void> {
	await page.waitForFunction(() => '__deviceDb' in window);
	await page.evaluate(async () => {
		const device = window as unknown as { __deviceDb: Db };
		await device.__deviceDb.run([
			...Array.from({ length: 4 }, (_, index) => ({
				sql: 'INSERT INTO shop_completions (key, completed_at, credit) VALUES (?, ?, 1)',
				bind: [`equipment-fixture-${index}`, 'example']
			})),
			...['film:atomic', 'film:refractor', 'film:xfractor'].map(itemId => ({
				sql: 'INSERT INTO shop_owned (item_id, cost) VALUES (?, 1)',
				bind: [itemId]
			}))
		]);
	});
}

async function openHoloShop(page: Page): Promise<void> {
	await page.goto('/shop');
	await page.getByRole('button', { name: 'Holo patterns', exact: true }).click();
}

function choice(page: Page, name: string): Locator {
	return page.getByRole('button', { name, exact: true });
}

test('shop marks effective holo equipment across deck and era precedence', async ({ page }) => {
	await page.goto('/shop');
	await seedOwnedHoloPatterns(page);
	await page.reload();
	await page.getByRole('button', { name: 'Holo patterns', exact: true }).click();

	const atomic = choice(page, 'Atomic, Owned');
	const refractor = choice(page, 'Refractor, Owned');
	await expect(atomic.locator('.equipped-tag')).toHaveAttribute('title', 'Equipped for Gem cards in 1950s');
	await expect(refractor.locator('.equipped-tag')).toHaveCount(0);

	await refractor.click();
	const shopSheet = page.getByRole('dialog', { name: 'Refractor' });
	await shopSheet.getByRole('button', { name: 'Apply to Gem cards', exact: true }).click();
	await expect(choice(page, 'Refractor, Applied').locator('.equipped-tag')).toHaveAttribute(
		'title',
		'Equipped for Gem cards in 1950s, 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s'
	);
	await expect(atomic.locator('.equipped-tag')).toHaveCount(0);

	await page.goto('/factory');
	await page.getByRole('button', { name: /^1980s,/ }).click();
	await page.getByRole('group', { name: 'Holo pattern', exact: true }).getByRole('button', { name: 'Atomic, Owned', exact: true }).click();
	await page.getByRole('button', { name: 'Apply to 1980s cards', exact: true }).click();

	await openHoloShop(page);
	await expect(choice(page, 'Atomic, Owned').locator('.equipped-tag')).toHaveAttribute('title', 'Equipped for Gem cards in 1980s');
	await expect(choice(page, 'Refractor, Applied').locator('.equipped-tag')).toHaveAttribute(
		'title',
		'Equipped for Gem cards in 1950s, 1960s, 1970s, 1990s, 2000s, 2010s, 2020s'
	);

	await page.goto('/factory');
	await page.getByRole('button', { name: /^1980s,/ }).click();
	await page.getByRole('button', { name: 'Era original, Free', exact: true }).click();
	await page.getByRole('button', { name: 'Apply to 1980s cards', exact: true }).click();

	await openHoloShop(page);
	await expect(choice(page, 'Xfractor, Owned').locator('.equipped-tag')).toHaveAttribute('title', 'Equipped for Gem cards in 1980s');
	await expect(choice(page, 'Refractor, Applied').locator('.equipped-tag')).toHaveAttribute(
		'title',
		'Equipped for Gem cards in 1950s, 1960s, 1970s, 1990s, 2000s, 2010s, 2020s'
	);
});
