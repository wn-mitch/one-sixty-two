import type { Page } from '@playwright/test';
import { test, expect, openStory } from './workshop-test';

async function candidateGroups(page: Page): Promise<string[]> {
	return page.locator('.candidate-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-candidate-group') ?? ''));
}

function candidate(page: Page, number: string) {
	return page.locator(`.candidate-card[data-candidate-group="candidate-${number}"]`);
}

async function openChoosing(page: Page, args = ''): Promise<void> {
	await openStory(page, `draft-board--choosing${args}`);
	await expect(page.locator('.candidates')).toBeVisible();
}

test.describe('Draft board browsing', () => {
	test('keeps loading cards readable and honors live reduced motion', async ({ page }) => {
		await openStory(page, 'draft-board--loading');
		await expect(page.getByRole('status', { name: 'Loading available player seasons' })).toBeVisible();
		await expect(page.locator('.loading-card.flying')).toBeVisible({ timeout: 6000 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expect(page.locator('.loading-card.flying')).toHaveCount(0);
		for (const width of [320, 1100, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			await page.evaluate(() => document.fonts.ready);
			await expect.poll(() => page.locator('.loading-cards').evaluate(root => root.getAnimations({ subtree: true }).length)).toBe(0);
			const layout = await page.locator('.loading-cards').evaluate(root => ({
				overflow: document.documentElement.scrollWidth > innerWidth,
				labelsFit: [...root.querySelectorAll('.team-word')].every(label => {
					const range = document.createRange();
					range.selectNodeContents(label);
					const text = range.getBoundingClientRect();
					const card = label.closest('.loading-card')!.getBoundingClientRect();
					return text.left >= card.left && text.right <= card.right;
				})
			}));
			expect(layout).toEqual({ overflow: false, labelsFit: true });
		}
		await expect(page.locator('.picked-count')).toContainText('0 / 14');
	});

	test('keeps desktop actions on one row and retains exact seasons across ranking pages', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		for (const width of [1100, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			await expect(page.locator('.wide-controls').first()).toBeVisible();
			const rows = await page.locator('.wide-controls').evaluateAll(nodes => nodes.map(row => {
				const controls = [...row.querySelectorAll('select, button')].map(node => node.getBoundingClientRect());
				return { aligned: controls.every(rect => Math.abs(rect.top - controls[0].top) < 1),
					touchSafe: controls.every(rect => rect.height >= 44),
					labels: [...row.querySelectorAll('option')].map(option => option.textContent?.trim()) };
			}));
			expect(rows.every(row => row.aligned && row.touchSafe && row.labels.every(label => /^\d{4}$/.test(label ?? '')))).toBe(true);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		}
		const group = page.locator('.candidate-card:has(select option:nth-child(2))').first();
		const playerId = await group.getAttribute('data-candidate-group');
		const selectedGroup = page.locator(`.candidate-card[data-candidate-group="${playerId}"]`);
		const select = group.locator('.wide-season-picker select');
		const seasonId = await select.evaluate(node => {
			const input = node as HTMLSelectElement;
			return [...input.options].find(option => option.value !== input.value)!.value;
		});
		await select.selectOption(seasonId);
		await expect(selectedGroup).toHaveCount(0);
		await page.getByRole('navigation', { name: 'Player card pages' }).getByRole('button', { name: 'Next', exact: true }).click();
		await expect(selectedGroup.locator('.player-card')).toHaveAttribute('data-season-id', seasonId);
		await selectedGroup.getByRole('button', { name: 'Turn over', exact: true }).click();
		await expect(selectedGroup.getByRole('button', { name: 'Turn over', exact: true })).toHaveAttribute('aria-pressed', 'true');
	});

	test('filters qualified candidates, reorders through real sort and ranking states, and pages results', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		const warOrder = await candidateGroups(page);
		await page.getByRole('combobox', { name: 'Rank players & seasons', exact: true }).selectOption('metrics');
		await expect.poll(() => candidateGroups(page)).not.toEqual(warOrder);

		await page.getByRole('button', { name: 'CF', exact: true }).click();
		await expect(candidate(page, '01')).toHaveCount(0);
		await expect(candidate(page, '02')).toBeVisible();
		await expect(page.getByRole('status').filter({ hasText: 'players' }).first()).toContainText('12 players');

		await page.getByRole('button', { name: 'All', exact: true }).click();
		const firstPage = await candidateGroups(page);
		await expect(page.getByRole('navigation', { name: 'Player card pages' })).toBeVisible();
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await expect.poll(() => candidateGroups(page)).not.toEqual(firstPage);
		await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled();

		await openStory(page, 'draft-board--rankings-loading');
		await expect(page.getByRole('status').filter({ hasText: /Example rankings are loading/ })).toBeVisible();
		const loadingOrder = await candidateGroups(page);
		await page.getByRole('button', { name: 'Load rankings', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Load rankings', exact: true })).toHaveCount(0);
		await expect.poll(() => candidateGroups(page)).not.toEqual(loadingOrder);

		await openStory(page, 'draft-board--rankings-unavailable');
		await expect(page.getByRole('alert').filter({ hasText: /Example rankings are unavailable/ })).toBeVisible();
		await page.getByRole('combobox', { name: 'Rank players & seasons', exact: true }).selectOption('war');
		const unavailableOrder = await candidateGroups(page);
		await page.getByRole('button', { name: 'Retry rankings', exact: true }).click();
		await expect.poll(() => candidateGroups(page)).not.toEqual(unavailableOrder);
	});

	test('resets search, pagination, and the initial selectable pool without leaving an overlay', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		const search = page.getByRole('searchbox', { name: 'Find your pick', exact: true });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await search.fill('Example Candidate 06');
		await expect(candidate(page, '06')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Player card pages' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(search).toHaveValue('');
		await expect(page.getByRole('navigation', { name: 'Player card pages' })).toContainText('1 / 2');
		await expect(candidate(page, '01')).toBeVisible();
		await page.setViewportSize({ width: 402, height: 874 });
		await candidate(page, '06').getByRole('button', { name: /^Select / }).click();
		await expect(page.locator('dialog.draft-sheet[open]')).toBeVisible();
		await openStory(page, 'draft-board--revealing');
		await expect(page.locator('dialog[open]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(page.locator('.candidates')).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(0);
	});
});

test.describe('Draft board field sheet', () => {
	test('cancels and confirms a mobile selection, restoring focus and scroll state', async ({ page }) => {
		await page.setViewportSize({ width: 402, height: 874 });
		await openChoosing(page);
		const before = await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow }));
		const card = candidate(page, '06');
		const select = card.getByRole('button', { name: /^Select / });
		await select.click();
		const sheet = page.locator('dialog.draft-sheet[open]');
		await expect(sheet).toBeVisible();
		await expect(page.locator('.picked-count')).toHaveText('0 / 14');
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
		await expect(select).toBeFocused();
		expect(await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow }))).toEqual(before);

		await select.click();
		await expect(sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', '2B');
		await sheet.getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(page.getByRole('button', { name: /Open your field 1 \/ 14/ })).toBeVisible();
		await expect(page.locator('.pick-confirmation')).toHaveCount(0);
	});

	test('keeps a failed confirmation intact and transfers a mobile preview to the desktop field panel', async ({ page }) => {
		await page.setViewportSize({ width: 402, height: 874 });
		await openChoosing(page, '&args=commitError:true');
		const card = candidate(page, '06');
		await card.getByRole('button', { name: /^Select / }).click();
		const sheet = page.locator('dialog.draft-sheet[open]');
		const confirmation = sheet.locator('.pick-confirmation');
		const selectedSeason = await confirmation.getAttribute('data-selected-season');
		await expect(confirmation).toHaveAttribute('data-pending-slot', '2B');
		await sheet.getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(sheet.getByRole('alert')).toContainText('Example draft confirmation failed');
		await expect(confirmation).toHaveAttribute('data-selected-season', selectedSeason ?? '');
		await expect(confirmation).toHaveAttribute('data-pending-slot', '2B');
		await expect(page.locator('.picked-count')).toHaveText('0 / 14');

		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
		const panelConfirmation = page.locator('.field-panel .pick-confirmation');
		await expect(panelConfirmation).toHaveAttribute('data-selected-season', selectedSeason ?? '');
		await expect(panelConfirmation).toHaveAttribute('data-pending-slot', '2B');
		await expect(page.locator('.field-panel').getByRole('heading', { name: /^Your field/ })).toBeFocused();
	});
});
