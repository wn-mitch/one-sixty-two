import type { Page } from '@playwright/test';
import type { Db } from '../lib/storage/sql.ts';

/** Stage earned tokens through the app's device database hook, then reload so the page reads them. */
export async function earnToken(page: Page, count = 1): Promise<void> {
	// Stage one earned receipt; completion and migration semantics run against real SQLite in unit tests.
	await page.waitForFunction(() => '__deviceDb' in window);
	await page.evaluate(async count => {
		// The app exposes this device database hook for browser scenarios.
		const device = window as unknown as { __deviceDb: Db };
		await device.__deviceDb.run(Array.from({ length: count }, (_, index) => ({ sql: 'INSERT INTO shop_completions (key, completed_at, credit) VALUES (?, ?, 1)', bind: [`test-completed-run-${index}`, 'example'] })));
	}, count);
	await page.reload();
}

export async function finishState(page: Page) {
	await page.waitForFunction(() => '__deviceDb' in window);
	return page.evaluate(async () => {
		const device = window as unknown as { __deviceDb: Db };
		const [owned, equipped, eras] = await Promise.all([
			device.__deviceDb.all('SELECT item_id FROM shop_owned ORDER BY item_id'),
			device.__deviceDb.all('SELECT tier, item_id, colorway FROM shop_equipped ORDER BY tier'),
			device.__deviceDb.all('SELECT tier, era, item_id, colorway FROM shop_era_equipped ORDER BY tier, era')
		]);
		return { owned, equipped, eras };
	});
}
