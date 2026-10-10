import type { Page } from '@playwright/test';
import { expect, openStory, openStoryByName, test } from './workshop-test.ts';

const eras = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
const sizes = [56, 72] as const;

async function expectCompactGeometry(page: Page): Promise<void> {
	const samples = page.locator('[data-compact-sample]');
	await expect(samples).toHaveCount(eras.length * sizes.length);
	for (const era of eras) {
		const entry = page.locator(`article[data-compact-era="${era}"]`);
		await expect(entry).toBeVisible();
		for (const size of sizes) {
			const sample = entry.locator(`[data-compact-size="${size}"]`);
			await expect(sample.locator('.card')).toHaveJSProperty('clientWidth', size);
		}
	}

	await expect.poll(() => samples.evaluateAll(nodes => nodes.every(node => {
		const card = node.querySelector<HTMLElement>('.card');
		const plate = node.querySelector<HTMLElement>('.compact-plate');
		const identity = node.querySelector<HTMLElement>('[data-compact-identity]');
		if (!card || !plate || !identity) return false;
		const cardRect = card.getBoundingClientRect();
		const plateContent = plate.querySelectorAll<HTMLElement>('.name, .meta');
		const name = plate.querySelector<HTMLElement>('.name')!;
		const nameText = document.createRange();
		nameText.selectNodeContents(name);
		const row = plate.querySelector<HTMLElement>('.meta')!;
		const stat = row.lastElementChild as HTMLElement;
		const statText = document.createRange();
		statText.selectNodeContents(stat);
		const rightEdge = row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight) -
			parseFloat(getComputedStyle(stat).paddingRight);
		const year = card.querySelector<HTMLElement>('[data-layer="season.year"]')!;
		const yearText = document.createRange();
		yearText.selectNodeContents(year);
		const yearRect = yearText.getBoundingClientRect();
		return card.dataset.compact === 'true'
			&& card.dataset.thumbnail === 'true'
			&& card.dataset.interactive === 'false'
			&& card.style.transform === ''
			&& identity.scrollWidth <= identity.clientWidth + 1
			&& nameText.getClientRects().length <= 2 && !name.hasAttribute('data-overflow')
			&& Math.abs(statText.getBoundingClientRect().right - rightEdge) < 1
			&& parseFloat(getComputedStyle(year).fontSize) >= 8
			&& yearRect.left >= cardRect.left - 1 && yearRect.right <= cardRect.right + 1
			&& yearRect.top >= cardRect.top - 1 && yearRect.bottom <= cardRect.bottom + 1
			&& [...plateContent].every(element => {
				const rect = element.getBoundingClientRect();
				return rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1
					&& rect.top >= cardRect.top - 1 && rect.bottom <= cardRect.bottom + 1;
			});
	}))).toBe(true);
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function setPreviewDials(page: Page, role: 'Two-Way' | 'Bullpen', finish: 'Gem' | 'Emboss'): Promise<void> {
	const root = page.locator('.dialkit-root');
	await root.getByRole('button', { name: 'Card preview', exact: true }).press('Enter');
	await root.getByRole('button', { name: /^Role / }).click();
	await page.getByRole('listbox', { name: 'Role', exact: true }).getByRole('option', { name: role, exact: true }).click();
	await root.getByRole('button', { name: /^Finish / }).click();
	await page.getByRole('listbox', { name: 'Finish', exact: true }).getByRole('option', { name: finish, exact: true }).click();
	await root.getByRole('button', { name: 'Card preview', exact: true }).press('Enter');
}

test('reviews every canonical compact era at exact field and collection sizes', async ({ page }) => {
	for (const width of [1212, 360]) {
		await page.setViewportSize({ width, height: 1000 });
		await openStoryByName(page, 'Cards/States', 'Compact review');
		await expectCompactGeometry(page);
	}

	await page.setViewportSize({ width: 1212, height: 1000 });
	await openStory(page, 'cards-states--compact-review&args=longIdentity:true');
	await setPreviewDials(page, 'Two-Way', 'Gem');
	await expect(page.locator('[data-card-workshop]')).toHaveAttribute('data-compact-role', 'two-way');
	await expect(page.locator('[data-compact-review] .card[data-finish="gem"]')).toHaveCount(16);
	await expect.poll(() => page.locator('[data-compact-identity] strong').allTextContents())
		.toEqual(Array(16).fill('Fictional Aurelius Maximilian Longname the Third'));
	await expectCompactGeometry(page);

	await openStory(page, 'cards-states--compact-review&args=missingPhoto:true');
	await setPreviewDials(page, 'Bullpen', 'Emboss');
	await expect(page.locator('[data-card-workshop]')).toHaveAttribute('data-compact-role', 'bullpen');
	await expect(page.locator('[data-compact-review] .card[data-finish="base"]')).toHaveCount(16);
	await expect(page.locator('[data-compact-review] .compact-plate').filter({ hasText: 'BP' })).toHaveCount(16);
	await expect(page.locator('[data-compact-review] [data-layer="photo.image"]')).toHaveCount(0);
});
