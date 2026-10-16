import { expect, openStory, test } from './workshop-test.ts';
import { capturePhotoPixels } from '../../scripts/media/framing-pixels.ts';
import { test as browserTest } from '@playwright/test';

browserTest('photo audit ignores opaque label ink but retains exposed ink and artwork', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 140 });
	await page.setContent(`<style>
		body{margin:0}[data-audit-grid]{display:grid;grid-template-columns:repeat(8,100px);width:800px}
		.tile{position:relative;width:100px;height:140px;background:#456}
		[data-layer="photo.mask"]{position:absolute;inset:0;background:#abc}
		[data-layer="season.tab"]{position:absolute;left:10px;top:10px;width:80px;height:40px;background:rgb(255,255,255)}
		[data-layer="season.year"]{position:absolute;left:5px;top:5px;width:25px;height:20px;font:16px monospace}
		.clipped [data-layer="season.tab"]{clip-path:polygon(50% 0,100% 100%,0 100%)}
		.translucent [data-layer="season.tab"]{background:rgba(255,255,255,.5)}
		</style><div data-audit-grid>${['opaque','clipped','translucent'].map(type =>
		`<div class="tile ${type}"><div data-layer="photo.mask"></div><div data-layer="season.tab"><span data-layer="season.year">1950</span></div></div>`).join('')}</div>`);
	const first = await capturePhotoPixels(page, 100);
	expect(first.map(row => row.geometry.ignoredInk)).toEqual([['season.year'], [], []]);
	await page.locator('[data-layer="season.year"]').evaluateAll(elements => elements.forEach(element => { element.textContent = '2025'; }));
	const second = await capturePhotoPixels(page, 100);
	expect(second[0].pixels).toBe(first[0].pixels);
	expect(second[1].pixels).not.toBe(first[1].pixels);
	expect(second[2].pixels).not.toBe(first[2].pixels);
	await page.locator('.opaque [data-layer="season.tab"]').evaluate(element => { (element as HTMLElement).style.width = '75px'; });
	expect((await capturePhotoPixels(page, 100))[0].pixels).not.toBe(second[0].pixels);
	expect(await page.locator('[data-audit-ignore-ink]').count()).toBe(0);
});

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
