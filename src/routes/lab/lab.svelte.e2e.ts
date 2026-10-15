import { expect, test } from '@playwright/test';

test('fine lab dial adjustments retain precision through a saved shortlink', async ({ page }) => {
	await page.goto('/lab');
	await page.locator('#lab-film').selectOption('penrose');
	const value = page.locator('#lab-film-density');
	const dial = page.getByRole('slider', { name: 'density dial', exact: true });
	await value.fill('0.18012345');
	await value.press('Tab');
	await expect(dial).toHaveValue('0.18012345');
	await dial.press('Shift+ArrowRight');
	await expect(value).toHaveValue('0.18062345');
	await dial.press('ArrowLeft');
	await expect(value).toHaveValue('0.17562345');
	const width = page.getByRole('slider', { name: 'Width', exact: true });
	await width.fill('240');

	const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/lab' && response.request().method() === 'POST');
	await page.getByRole('button', { name: 'Copy link', exact: true }).click();
	const response = await saved;
	expect(response.status()).toBe(201);
	const { url } = await response.json();
	await page.goto(url);
	await expect(page.locator('#lab-film')).toHaveValue('penrose');
	await expect(value).toHaveValue('0.17562345');
	await expect(dial).toHaveValue('0.17562345');
	await expect(width).toHaveValue('240');
	await expect(page.locator('.lab-card canvas.light')).toHaveAttribute('data-presented', '', { timeout: 15000 });
});

test('count dials stay integral and respect their bounds', async ({ page }) => {
	await page.goto('/lab');
	await page.locator('#lab-film').selectOption('poincare-disk');
	const dial = page.getByRole('slider', { name: 'sides dial', exact: true });
	const value = page.locator('#lab-film-sides');
	await dial.press('Shift+ArrowRight');
	await expect(value).toHaveValue('8');
	await dial.press('End');
	await dial.press('ArrowRight');
	await expect(value).toHaveValue('12');
	await dial.press('Home');
	await dial.press('Shift+ArrowLeft');
	await expect(value).toHaveValue('7');
});

test('preview width resizes every print mode without changing material dials', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/lab');
	await page.locator('#lab-film').selectOption('hgh-sequence');
	const width = page.getByRole('slider', { name: 'Width', exact: true });
	await expect(page.locator('#lab-film-scale')).toHaveValue('1.44');
	await expect(page.locator('#lab-film-density')).toHaveValue('2.2');
	await width.fill('240');
	await expect.poll(() => page.locator('.lab-card').evaluate(element => element.getBoundingClientRect().width)).toBe(240);
	await width.fill('320');
	await expect.poll(() => page.locator('.lab-card').evaluate(element => element.getBoundingClientRect().width)).toBe(320);
	await expect(page.locator('output[for="lab-width"]')).toHaveText('320 px');
	await expect(page.locator('#lab-film-scale')).toHaveValue('1.44');
	await expect(page.locator('#lab-film-density')).toHaveValue('2.2');

	for (const print of ['Foil frame', 'Era front', 'Foil sheet']) {
		await page.getByRole('radio', { name: print, exact: true }).click();
		await expect(page.locator('.lab-card canvas[data-presented]')).toBeVisible({ timeout: 15000 });
		await expect.poll(() => page.locator('.lab-card').evaluate(element => element.getBoundingClientRect().width)).toBe(320);
	}
	await page.getByRole('button', { name: 'Stagger film', exact: true }).click();
	await expect(page.locator('.lab-card')).toHaveCount(5);
	await expect(page.getByRole('region', { name: 'Staggered previews' })).toBeVisible();
	await width.fill('200');
	await expect.poll(() => page.locator('.lab-card').first().evaluate(element => element.getBoundingClientRect().width)).toBe(200);
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(page.locator('.lab-card')).toHaveCount(1);
	await expect(width).toHaveValue('200');
});

for (const viewport of [{ width: 1440, height: 800 }, { width: 1024, height: 768 }, { width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
	test(`era preview fits at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
		await page.setViewportSize(viewport);
		await page.goto('/lab');
		await page.locator('#lab-era').selectOption('2000s');
		await page.getByRole('button', { name: 'Use the 2000s look', exact: true }).click();
		await expect(page.getByRole('checkbox', { name: 'Drift', exact: true })).toBeChecked();
		await expect(page.locator('.lab-card canvas[data-presented]')).toBeVisible({ timeout: 15000 });
		await expect.poll(() => page.locator('.stage').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
		await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		const card = await page.locator('.lab-card').boundingBox();
		const stage = await page.locator('.stage').boundingBox();
		expect(card).not.toBeNull();
		expect(stage).not.toBeNull();
		expect(card!.x).toBeGreaterThanOrEqual(stage!.x);
		expect(card!.x + card!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
		expect(card!.y + card!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
		await page.getByRole('slider', { name: 'Width', exact: true }).press('Home');
		await expect(page.getByRole('slider', { name: 'Width', exact: true })).toHaveValue('160');
		await page.getByRole('slider', { name: 'Width', exact: true }).press('End');
		await expect.poll(() => page.locator('.stage').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
		await page.evaluate(() => scrollTo(0, 0));
		await testInfo.attach('sequence-preview', { body: await page.screenshot(), contentType: 'image/png' });
	});
}
