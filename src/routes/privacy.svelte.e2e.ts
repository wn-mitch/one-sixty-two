import { expect, test } from '@playwright/test';

test('the privacy policy is readable without JavaScript or a saved game', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		const response = await page.goto(`${baseURL}/privacy`);
		expect(response?.status()).toBe(200);
		await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByRole('main').getByRole('link', { name: 'contact Alpaca Software' })).toHaveAttribute('href', 'https://alpacasoft.dev/');
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://162-0.dev/privacy');
	} finally {
		await context.close();
	}
});

test('the iOS host keeps privacy navigation while hiding external support', async ({ page }) => {
	await page.addInitScript(() => {
		const markHost = () => {
			if (!document.documentElement) return;
			document.documentElement.dataset.host = 'ios-app';
			observer.disconnect();
		};
		const observer = new MutationObserver(markHost);
		observer.observe(document, { childList: true });
		markHost();
	});
	await page.goto('/about');
	const footer = page.getByRole('contentinfo');
	await expect(footer.getByRole('link', { name: 'Support the developer' })).toHaveCount(0);
	await footer.getByRole('link', { name: 'Privacy policy' }).click();
	await expect(page).toHaveURL(/\/privacy$/);
	await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
});
