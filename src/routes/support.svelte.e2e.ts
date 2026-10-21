import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

type FakeTransaction = { id: string; productId: string; purchasedAt: string; revokedAt: string | null };
type FakeStore = { transactions: FakeTransaction[]; finished: string[]; requests: string[]; next: 'purchased' | 'pending' | 'cancelled' };

/**
 * Stands in for `ios/Sources/StoreBridge.swift`: the iOS host mark, App Store prices, and StoreKit's
 * unfinished-transaction list, which keeps reporting a transaction until the page has saved it.
 */
async function iosHost(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const markHost = () => {
			if (!document.documentElement) return;
			document.documentElement.dataset.host = 'ios-app';
			observer.disconnect();
		};
		const observer = new MutationObserver(markHost);
		observer.observe(document, { childList: true });
		markHost();
		const saved = sessionStorage.getItem('fake-store');
		const store: FakeStore = saved ? JSON.parse(saved) : { transactions: [], finished: [], requests: [], next: 'purchased' };
		const persist = () => sessionStorage.setItem('fake-store', JSON.stringify(store));
		const prices: Record<string, string> = { 'coins.4': '$1.00', 'coins.20': '$5.00', 'coins.40': '$10.00' };
		(window as unknown as { fakeStore: FakeStore }).fakeStore = store;
		(window as unknown as { webkit: unknown }).webkit = { messageHandlers: { store: { postMessage: async (message: { action: string; ids?: string[]; id?: string }) => {
			store.requests.push(message.action);
			persist();
			switch (message.action) {
				case 'products': return message.ids!.filter(id => id in prices).map(id => ({ id, displayPrice: prices[id] }));
				case 'purchase': {
					if (store.next === 'purchased') store.transactions.push({ id: String(1000 + store.transactions.length), productId: message.id!, purchasedAt: '2026-10-21T12:00:00Z', revokedAt: null });
					persist();
					return store.next;
				}
				case 'transactions': return store.transactions;
				case 'finish': store.finished.push(...message.ids!); persist(); return true;
			}
			throw new Error('Unknown store request.');
		} } } };
	});
}

const fakeStore = (page: Page) => page.evaluate(() => (window as unknown as { fakeStore: FakeStore }).fakeStore);

test('the website never offers support purchases', async ({ page }) => {
	await page.goto('/shop');
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await expect(page.getByRole('heading', { name: 'Support 162-0' })).toHaveCount(0);
});

test('the iOS app sells token packs at App Store prices and credits each purchase once', async ({ page }) => {
	await iosHost(page);
	await page.goto('/shop');
	const support = page.getByRole('region', { name: 'Support 162-0' });
	await expect(support.getByText('Earn a token with every season you finish, or buy extras to support the game.')).toBeVisible();
	await expect(support.getByRole('link', { name: 'Card factory' })).toHaveAttribute('href', '/factory');
	const packs = support.getByRole('button');
	await expect(packs).toHaveText(['4 tokens $1.00', '20 tokens $5.00', '40 tokens $10.00']);
	// Nothing bills until a pack is tapped.
	expect((await fakeStore(page)).requests).not.toContain('purchase');

	await packs.nth(1).click();
	await expect(page.locator('.balance')).toHaveText('20 unlock tokens');
	await expect.poll(async () => (await fakeStore(page)).finished).toEqual(['1000']);

	// StoreKit keeps reporting history (a reinstall, another launch); the ledger credits it once.
	await page.reload();
	await expect(page.locator('.balance')).toHaveText('20 unlock tokens');
	await page.evaluate(() => window.dispatchEvent(new Event('162-store-transactions')));
	await expect(page.locator('.balance')).toHaveText('20 unlock tokens');
});

test('a pending purchase credits nothing until the App Store delivers it', async ({ page }) => {
	await iosHost(page);
	await page.goto('/shop');
	await page.evaluate(() => { (window as unknown as { fakeStore: FakeStore }).fakeStore.next = 'pending'; });
	await page.getByRole('region', { name: 'Support 162-0' }).getByRole('button').first().click();
	await expect(page.getByText('Waiting for approval.')).toBeVisible();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	// Ask to Buy approves later; the host announces the delivered transaction.
	await page.evaluate(() => {
		const store = (window as unknown as { fakeStore: FakeStore }).fakeStore;
		store.transactions.push({ id: '2000', productId: 'coins.4', purchasedAt: '2026-10-21T13:00:00Z', revokedAt: null });
		window.dispatchEvent(new Event('162-store-transactions'));
	});
	await expect(page.locator('.balance')).toHaveText('4 unlock tokens');
	// A refund takes the unspent tokens back.
	await page.evaluate(() => {
		const store = (window as unknown as { fakeStore: FakeStore }).fakeStore;
		store.transactions[0].revokedAt = '2026-10-22T00:00:00Z';
		window.dispatchEvent(new Event('162-store-transactions'));
	});
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
});
