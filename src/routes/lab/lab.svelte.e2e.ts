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

	const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/lab' && response.request().method() === 'POST');
	await page.getByRole('button', { name: 'Copy link', exact: true }).click();
	const response = await saved;
	expect(response.status()).toBe(201);
	const { url } = await response.json();
	await page.goto(url);
	await expect(page.locator('#lab-film')).toHaveValue('penrose');
	await expect(value).toHaveValue('0.17562345');
	await expect(dial).toHaveValue('0.17562345');
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
