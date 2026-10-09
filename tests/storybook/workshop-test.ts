import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend<{ browserErrors: void }, { workshopReady: void }>({
	workshopReady: [async ({ browser }, use, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL;
		if (!baseURL) throw new Error('Storybook browser verification requires a base URL');
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', error => { errors.push(error.message); });
		try {
			// TCP readiness precedes Vite's cold preview and screen compilation.
			for (const id of ['application-welcome--start', 'simulation-season--computing']) {
				await page.goto(new URL(`/iframe.html?id=${id}&viewMode=story`, baseURL).href, {
					waitUntil: 'domcontentloaded',
					timeout: 120000
				});
				await expect(page.getByRole('button', { name: 'Reset story', exact: true }))
					.toBeVisible({ timeout: 120000 });
			}
			expect(errors, 'Unexpected browser JavaScript errors during workshop startup').toEqual([]);
		} finally {
			await page.close();
		}
		await use();
	}, { scope: 'worker', auto: true, timeout: 120000 }],
	browserErrors: [async ({ page }, use) => {
		const errors: string[] = [];
		const recordError = (error: Error): void => { errors.push(error.message); };
		page.on('pageerror', recordError);
		await use();
		page.off('pageerror', recordError);
		expect(errors, 'Unexpected browser JavaScript errors').toEqual([]);
	}, { auto: true }]
});

export { expect };

export async function openStory(page: Page, id: string): Promise<void> {
	await page.goto(`/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('button', { name: 'Reset story', exact: true })).toBeVisible({ timeout: 15000 });
}
