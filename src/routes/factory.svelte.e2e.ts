import { expect, test, type Page } from '@playwright/test';
import { CARD_ERAS } from '../lib/cards/era.ts';
import { earnToken } from './shop-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

const rack = (page: Page) => page.getByRole('list', { name: /cards by era$/ });
const allEras = (page: Page) => page.getByRole('link', { name: '← All eras', exact: true }).click();
const colorwayTab = (page: Page) => page.getByRole('tab', { name: /^Colorway/ }).click();

for (const width of [390, 1440]) {
	test(`the factory opens on a real card per era and edits one era at a time at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/factory');
		const slots = rack(page).getByRole('link');
		await expect(slots).toHaveCount(CARD_ERAS.length);
		// Each era shows a dataset card of the selected tier, not a bare finish patch.
		await expect(rack(page).locator('.card[data-finish="gem"]')).toHaveCount(CARD_ERAS.length, { timeout: 60_000 });
		expect(await rack(page).locator('.card').evaluateAll(cards => cards.map(card => card.getAttribute('data-card')))).toEqual([...CARD_ERAS]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

		await page.getByRole('link', { name: '1980s, Deck default', exact: true }).click();
		await expect(page).toHaveURL(/\/factory\?era=1980s$/);
		await expect(page.getByRole('heading', { name: '1980s Gem holo', exact: true })).toBeVisible();
		await expect(rack(page)).toHaveCount(0);
		// Now and the draft are the same 1980s card; choosing a pattern changes only the draft.
		const faces = page.locator('.face .card');
		await expect(faces).toHaveCount(2);
		expect(await faces.evaluateAll(cards => cards.map(card => card.getAttribute('data-card')))).toEqual(['1980s', '1980s']);
		await page.getByRole('group', { name: 'Holo pattern', exact: true }).getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
		await expect(page.locator('.preview')).toHaveAttribute('data-film', 'refractor');
		await expect(page.locator('.face').first()).toContainText('Era original');
		// Pattern tiles draw on the era being edited, never a shared sample era.
		expect(new Set(await page.locator('[data-finish-id] [data-finish-sample]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-card'))))).toEqual(new Set(['1980s']));
		// The tray grows with the page instead of scrolling inside it.
		expect(await page.locator('.tray').evaluate(tray => [...tray.querySelectorAll('*')].some(node => node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)))).toBe(false);

		await page.goBack();
		await expect(rack(page)).toBeVisible();
		await page.goto('/factory?era=1990s');
		await expect(page.getByRole('heading', { name: '1990s Gem holo', exact: true })).toBeVisible();
		await allEras(page);
		await expect(page).toHaveURL(/\/factory$/);
		await expect(slots).toHaveCount(CARD_ERAS.length);
	});
}

test('colorway tiles show the chosen pattern on the edited era', async ({ page }) => {
	await page.goto('/factory?era=1970s');
	await page.getByRole('group', { name: 'Holo pattern', exact: true }).getByRole('button', { name: 'Mojo, 1 token', exact: true }).click();
	await colorwayTab(page);
	const tiles = page.getByRole('group', { name: 'Colorway', exact: true }).locator('[data-finish-id] [data-finish-sample]');
	await expect(tiles.first()).toBeAttached();
	const looks = await tiles.evaluateAll(nodes => nodes.map(node => `${node.getAttribute('data-card')}:${node.getAttribute('data-film')}`));
	expect(new Set(looks)).toEqual(new Set(['1970s:mojo']));
});

test('the card factory recolors one era’s own holo, reuses the colorway free, and keeps it after a reload', async ({ page }) => {
	await page.goto('/factory');
	await earnToken(page);
	await page.getByRole('link', { name: /^1980s,/ }).click();
	await page.getByRole('button', { name: 'Era original, Free', exact: true }).click();
	await colorwayTab(page);
	await page.getByRole('group', { name: 'Colorway', exact: true }).getByRole('button', { name: 'Synthwave, 1 token', exact: true }).click();
	await expect(page.locator('.balance')).toHaveText('1 unlock token');
	await page.getByRole('button', { name: /Unlock & apply/ }).click();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await allEras(page);
	await expect(page.getByRole('link', { name: '1980s, Era original · Synthwave' })).toBeVisible();
	await page.getByRole('link', { name: /^1990s,/ }).click();
	await page.getByRole('button', { name: 'Era original, Free', exact: true }).click();
	await colorwayTab(page);
	await page.getByRole('group', { name: 'Colorway', exact: true }).getByRole('button', { name: 'Synthwave, Owned', exact: true }).click();
	await page.getByRole('button', { name: 'Apply to 1990s cards' }).click();
	await allEras(page);
	await expect(page.getByRole('link', { name: '1990s, Era original · Synthwave' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('link', { name: '1980s, Era original · Synthwave' })).toBeVisible();
	await page.getByRole('link', { name: /^1980s,/ }).click();
	await page.getByRole('button', { name: 'Deck default, Free', exact: true }).click();
	await page.getByRole('button', { name: 'Use deck default' }).click();
	await allEras(page);
	await expect(page.getByRole('link', { name: '1980s, Deck default' })).toBeVisible();
});

test('factory material choices preview without spending and apply only to the selected era and tier', async ({ page }) => {
	await page.setViewportSize({ width: 1512, height: 828 });
	await page.goto('/factory');
	await earnToken(page, 2);
	const patterns = page.getByRole('group', { name: 'Holo pattern', exact: true });
	const colors = page.getByRole('group', { name: 'Colorway', exact: true });
	const sample = page.locator('.preview');
	await page.getByRole('link', { name: /^1980s,/ }).click();
	await patterns.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	await colorwayTab(page);
	await colors.getByRole('button', { name: 'Ice, 1 token', exact: true }).click();
	await expect(sample).toHaveAttribute('data-film', 'refractor');
	const palette = await sample.getAttribute('data-palette');
	await expect(page.locator('.balance')).toHaveText('2 unlock tokens');
	await allEras(page);
	await page.getByRole('link', { name: /^1990s,/ }).click();
	await expect(sample).toHaveAttribute('data-film', 'circuit');
	await allEras(page);
	await page.getByRole('link', { name: /^1980s,/ }).click();
	await expect(sample).toHaveAttribute('data-film', 'xfractor');
	await patterns.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	await colorwayTab(page);
	await colors.getByRole('button', { name: 'Ice, 1 token', exact: true }).click();
	await page.getByRole('button', { name: /Unlock & apply/ }).click();
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
	await page.reload();
	await expect(sample).toHaveAttribute('data-film', 'refractor', { timeout: 30_000 });
	await expect(sample).toHaveAttribute('data-palette', palette!);
	await page.getByRole('button', { name: 'Silver foil', exact: true }).click();
	await expect(sample).toHaveAttribute('data-finish', 'foil');
	await expect(sample).toHaveAttribute('data-plate', 'weld');
	await allEras(page);
	await expect(page.getByRole('link', { name: '1980s, Deck default', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Gem holo', exact: true }).click();
	await expect(page.getByRole('link', { name: '1980s, Refractor · Ice', exact: true })).toBeVisible();
});
