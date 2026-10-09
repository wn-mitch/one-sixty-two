import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend<{ browserErrors: void }, { workshopReady: void }>({
	workshopReady: [async ({ browser }, use, workerInfo) => {
		const baseURL = workerInfo.project.use.baseURL;
		if (!baseURL) throw new Error('Storybook browser verification requires a base URL');
		const page = await browser.newPage({ baseURL });
		const errors: string[] = [];
		page.on('pageerror', error => { errors.push(error.message); });
		try {
			// TCP readiness precedes Vite's cold preview and screen compilation.
			for (const [title, name] of [['Application/Welcome', 'Start'], ['Simulation/Season', 'Computing']] as const) {
				await openStoryByName(page, title, name);
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
	await page.goto(`/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'domcontentloaded', timeout: 120000 });
	await expect(page.getByRole('button', { name: 'Reset story', exact: true })).toBeVisible({ timeout: 120000 });
}

export async function openStoryByName(page: Page, title: string, name: string): Promise<void> {
	const response = await page.request.get('/index.json');
	expect(response.ok(), 'Storybook index is available').toBe(true);
	const index = await response.json() as { entries: Record<string, { id: string; title: string; name: string; type: string }> };
	const matches = Object.values(index.entries).filter(entry => entry.type === 'story' && entry.title === title && entry.name === name);
	expect(matches, `Exactly one story matches ${title} / ${name}`).toHaveLength(1);
	await openStory(page, matches[0]!.id);
}
