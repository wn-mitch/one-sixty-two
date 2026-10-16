import { expect, test } from '@playwright/test';
import { finishName, itemsForTier } from '../lib/cosmetics/catalogue.ts';
import { earnToken, finishState } from './shop-test-fixtures.ts';

const preview = '.preview-card .card';
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

test('shop swatches drift at rest and become still under reduced motion', async ({ page }) => {
	await page.setViewportSize({ width: 1512, height: 828 });
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto('/shop');
	const sample = page.locator('[data-finish-sample]').first();
	await expect(sample).toBeVisible();
	const pose = () => sample.evaluate(node => node.style.transform);
	await expect.poll(pose).not.toBe('');
	const initial = await pose();
	await expect.poll(pose).not.toBe(initial);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect.poll(pose).toBe('');
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await expect.poll(pose).not.toBe('');
});

test('shop unlocks a finish type once without equipping, then factory applies it free', async ({ page }) => {
	await page.goto('/shop');
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await expect(page.getByLabel('Show card')).toHaveCount(0);
	await page.getByRole('button', { name: 'Holo patterns', exact: true }).click();
	await page.getByRole('button', { name: 'Refractor, 1 token', exact: true }).scrollIntoViewIfNeeded();
	const scrolled = await page.evaluate(() => scrollY);
	await page.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Refractor' });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Unlock Refractor, 1 token', exact: true })).toBeDisabled();
	await expect(sheet.locator('.card')).toHaveAttribute('data-finish', 'gem');
	await expect(sheet.getByLabel(/Holo colorway/)).toHaveCount(0);
	await sheet.getByRole('button', { name: 'Close finish' }).click();
	await expect(sheet).toBeHidden();
	expect(await page.evaluate(() => scrollY)).toBe(scrolled);

	await earnToken(page, 2);
	await expect(page.locator('.balance')).toHaveText('2 unlock tokens');
	const before = await finishState(page);
	const refractor = itemsForTier('gem').find(item => item.film === 'refractor')!;
	await page.getByRole('button', { name: 'Holo patterns', exact: true }).click();
	await page.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	await sheet.getByRole('button', { name: 'Unlock Refractor, 1 token', exact: true }).click();
	await expect(page.locator('.balance')).toHaveText('1 unlock token');
	await expect(sheet.getByRole('link', { name: 'Card factory', exact: true })).toBeVisible();
	await expect(sheet.getByRole('button', { name: /^Unlock / })).toHaveCount(0);
	const purchased = { ...before, owned: [{ item_id: refractor.id }] };
	await expect.poll(() => finishState(page)).toEqual(purchased);
	await sheet.getByRole('button', { name: 'Close finish' }).click();

	await page.reload();
	await expect(page.locator('.balance')).toHaveText('1 unlock token');
	await page.getByRole('button', { name: 'Holo patterns', exact: true }).click();
	await page.getByRole('button', { name: 'Refractor, Owned', exact: true }).click();
	await expect.poll(() => finishState(page)).toEqual(purchased);
	await sheet.getByRole('link', { name: 'Card factory', exact: true }).click();
	await page.getByRole('link', { name: /^1980s,/ }).click();
	await page.getByRole('group', { name: 'Holo pattern', exact: true }).getByRole('button', { name: 'Refractor, Owned', exact: true }).click();
	await expect.poll(() => finishState(page)).toEqual(purchased);
	await page.getByRole('button', { name: 'Apply to 1980s cards', exact: true }).click();
	await expect(page.locator('.balance')).toHaveText('1 unlock token');
	const applied = { ...purchased, eras: [{ tier: 'gem', era: '1980s', item_id: refractor.id, colorway: null }] };
	await expect.poll(() => finishState(page)).toEqual(applied);
	await page.goto('/factory');
	await expect(page.getByRole('link', { name: '1980s, Refractor', exact: true })).toBeVisible();
	await expect.poll(() => finishState(page)).toEqual(applied);
});

test('default-era tags distinguish original foil and holo patterns from optional finishes', async ({ page }) => {
	await page.goto('/shop');
	const brushed = page.getByRole('button', { name: 'Brushed, 1 token', exact: true });
	await expect(brushed.locator('.era-tag')).toContainText('1960s');
	await expect(brushed).toHaveAccessibleDescription(/1960s default/);
	await page.getByRole('button', { name: 'Holo patterns', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Atomic, 1 token', exact: true }).locator('.era-tag')).toContainText('1950s');
	await expect(page.getByRole('button', { name: 'Refractor, 1 token', exact: true }).locator('.era-tag')).toHaveCount(0);
});

test('one shop foil unlock is reusable free in factory for independent era and tier choices', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/shop');
	await earnToken(page);
	const before = await finishState(page);
	const plate = itemsForTier('foil')[0]!;
	await page.getByRole('button', { name: `${finishName(plate)}, 1 token`, exact: true }).click();
	const detail = page.locator('.side');
	await detail.getByRole('button', { name: `Unlock ${finishName(plate)}, 1 token`, exact: true }).click();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	const purchased = { ...before, owned: [{ item_id: plate.id }] };
	await expect.poll(() => finishState(page)).toEqual(purchased);
	await detail.getByRole('button', { name: 'Gold emboss cards', exact: true }).click();
	await expect(detail.locator('.card')).toHaveAttribute('data-finish', 'emboss');
	await expect(page.getByRole('button', { name: `${finishName(plate)}, Owned`, exact: true })).toBeVisible();
	await expect.poll(() => finishState(page)).toEqual(purchased);
	await detail.getByRole('button', { name: 'Silver foil cards', exact: true }).click();
	await expect(detail.locator('.card')).toHaveAttribute('data-finish', 'foil');
	await expect.poll(() => finishState(page)).toEqual(purchased);
	await detail.getByRole('link', { name: 'Card factory', exact: true }).click();
	await page.getByRole('button', { name: 'Silver foil', exact: true }).click();
	await page.getByRole('link', { name: /^1980s,/ }).click();
	await page.getByRole('group', { name: 'Foil finish', exact: true }).getByRole('button', { name: `${finishName(plate)}, Owned`, exact: true }).click();
	await page.getByRole('button', { name: 'Apply to 1980s cards', exact: true }).click();
	const silver = { tier: 'foil', era: '1980s', item_id: plate.id, colorway: null };
	await expect.poll(() => finishState(page)).toEqual({ ...purchased, eras: [silver] });
	await page.getByRole('link', { name: '← All eras', exact: true }).click();
	await page.getByRole('button', { name: 'Gold emboss', exact: true }).click();
	await expect(page.getByRole('link', { name: '1980s, Deck default', exact: true })).toBeVisible();
	await page.getByRole('link', { name: /^1990s,/ }).click();
	await page.getByRole('group', { name: 'Foil finish', exact: true }).getByRole('button', { name: `${finishName(plate)}, Owned`, exact: true }).click();
	await page.getByRole('button', { name: 'Apply to 1990s cards', exact: true }).click();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	const applied = { ...purchased, eras: [{ tier: 'emboss', era: '1990s', item_id: plate.id, colorway: null }, silver] };
	await expect.poll(() => finishState(page)).toEqual(applied);
	await page.goto('/factory');
	await page.getByRole('button', { name: 'Silver foil', exact: true }).click();
	await expect(page.getByRole('link', { name: `1980s, ${finishName(plate)}`, exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Gold emboss', exact: true }).click();
	await expect(page.getByRole('link', { name: `1990s, ${finishName(plate)}`, exact: true })).toBeVisible();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	expect(await finishState(page)).toEqual(applied);
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
			await expect(page.locator(`[data-finish-id="${expected[count]}"]`)).toBeAttached({ timeout: 30_000 });
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
