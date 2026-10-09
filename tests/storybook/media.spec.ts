import { expect, openStory, test } from './workshop-test.ts';

test.describe('media workshop states', () => {
	test('resolves loading media into the real illustrative SVG consumers', async ({ page }) => {
		await openStory(page, 'media-states--loading');
		await expect(page.getByText(/loading photo/i)).toBeVisible();
		await page.getByRole('button', { name: /resolve media/i }).click();
		await expect(page.locator('img[alt*="Example Hitter 03"]')).toBeVisible();
		await expect(page.locator('img[alt*="Current franchise mark"]')).toBeVisible();
		await expect(page.locator('img[alt*="Illustrative fixture atmosphere"]')).toBeVisible();
	});

	test('uses production fallback treatments for absent, unavailable, and broken assets', async ({ page }) => {
		await openStory(page, 'media-states--missing');
		await expect(page.getByText('No verified photo')).toBeVisible();
		await expect(page.getByLabel(/no verified logo/i)).toBeVisible();
		await expect(page.locator('img[alt*="Illustrative fixture atmosphere"]')).toHaveCount(0);

		await openStory(page, 'media-states--unavailable');
		await expect(page.getByText('Images unavailable')).toBeVisible();
		await expect(page.getByLabel(/image sources unavailable/i)).toBeVisible();

		await openStory(page, 'media-states--broken-image');
		await expect(page.getByText('Photo unavailable')).toBeVisible();
		await expect(page.getByLabel(/logo unavailable/i)).toBeVisible();
		await expect(page.locator('img[alt*="Illustrative fixture atmosphere"]')).toHaveCount(0);
	});

	test('paginates and searches fixture credits through the production component', async ({ page }) => {
		await openStory(page, 'media-states--credits');
		await expect(page.locator('.image-credits').getByRole('status')).toContainText(/page 1 of 2/i);
		const firstPageFirstCredit = await page.locator('.credit-list li').first().innerText();
		await page.getByRole('button', { name: /next credits/i }).click();
		await expect(page.locator('.image-credits').getByRole('status')).toContainText(/page 2 of 2/i);
		await expect(page.locator('.credit-list li').first()).not.toHaveText(firstPageFirstCredit);
		await page.getByLabel(/find an image/i).fill('not-a-fixture-credit');
		await expect(page.getByText(/no image credits match this search/i)).toBeVisible();
		await expect(page.locator('.credit-list li')).toHaveCount(0);
	});

	test('recovers unavailable credits only after the production retry', async ({ page }) => {
		await openStory(page, 'media-states--credits-unavailable');
		await expect(page.getByRole('alert')).toBeVisible();
		await page.getByRole('button', { name: /recover media source/i }).click();
		await expect(page.getByRole('status')).toContainText(/use the image credits retry/i);
		await page.getByRole('button', { name: /retry image credits/i }).click();
		await expect(page.getByLabel(/find an image/i)).toBeVisible();
		await expect(page.locator('.image-credits').getByRole('status')).toContainText(/credited images/i);
	});
});
