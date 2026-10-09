import { expect, type Page } from '@playwright/test';

export async function verifyResultsInspection(page: Page): Promise<void> {
	const originalViewport = page.viewportSize();
	await page.setViewportSize({ width: 320, height: 568 });
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	const shortcuts = page.locator('.share-shortcuts');
	for (const button of await shortcuts.getByRole('button').all()) {
		const bounds = await button.boundingBox();
		expect(bounds).not.toBeNull();
		expect(bounds!.x).toBeGreaterThanOrEqual(0);
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
		expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
		expect(bounds!.height).toBeGreaterThanOrEqual(44);
	}

	const trigger = page.locator('.award-card').first();
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');
	await expect(trigger).toHaveAttribute('aria-controls', 'results-card-review');
	await trigger.click();
	const review = page.locator('#results-card-review');
	await expect(review).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	await expect(review.getByRole('heading').first()).toBeFocused();
	await expect(review.getByRole('button', { name: '162-0 season', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(review.getByRole('button', { name: 'Show front', exact: true })).toBeVisible();
	const simulatedBack = review.getByRole('region', { name: /^162-0 season statistics for / });
	await expect(simulatedBack).toBeVisible();
	await expect(simulatedBack.getByRole('table')).toContainText('Team rank');
	await expect(simulatedBack.getByRole('list', { name: 'Season awards', exact: true })).toBeVisible();
	const simulatedRows = await simulatedBack.locator('tbody tr').allTextContents();
	expect(simulatedRows.length).toBeGreaterThan(0);

	const contrasts = await simulatedBack.evaluate(back => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d', { willReadFrequently: true })!;
		const luminance = (color: string): number => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			const rgb = context.getImageData(0, 0, 1, 1).data;
			const linear = (channel: number) => {
				const value = channel / 255;
				return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
			};
			return .2126 * linear(rgb[0]) + .7152 * linear(rgb[1]) + .0722 * linear(rgb[2]);
		};
		const background = luminance(getComputedStyle(back).backgroundColor);
		return [back.querySelector('thead th')!, back.querySelector('tbody th')!].map(label => {
			const foreground = luminance(getComputedStyle(label).color);
			return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
		});
	});
	for (const ratio of contrasts) expect(ratio).toBeGreaterThanOrEqual(4.5);

	await review.getByRole('button', { name: 'Actual season', exact: true }).click();
	await expect(review.getByRole('button', { name: 'Actual season', exact: true })).toHaveAttribute('aria-pressed', 'true');
	const actualBack = review.getByRole('region', { name: /^Actual season statistics for / });
	await expect(actualBack).toBeVisible();
	await expect(actualBack.getByRole('list', { name: 'Season awards', exact: true })).toHaveCount(0);
	await expect(actualBack.locator('tbody tr')).toHaveCount(simulatedRows.length);
	await expect(actualBack.locator('.rank [aria-label]')).toHaveCount(simulatedRows.length);
	await review.getByRole('button', { name: '162-0 season', exact: true }).click();
	await expect(review.getByRole('region', { name: /^162-0 season statistics for / }).locator('tbody tr')).toHaveText(simulatedRows);

	await review.getByRole('button', { name: /^Show text version for / }).click();
	await expect(simulatedBack.locator('tbody tr')).toHaveText(simulatedRows);
	await expect(page.getByRole('region', { name: 'All 162 games', exact: true }).locator('details')).toHaveCount(162);

	await review.getByRole('button', { name: 'Actual season', exact: true }).click();
	await expect(review.getByRole('button', { name: 'Text version', exact: true })).toHaveAttribute('aria-pressed', 'true');
	const firstSeasonId = await review.getAttribute('data-season-id');
	await review.getByRole('button', { name: 'Show front', exact: true }).click();
	const nextTrigger = page.locator('.hand-card').last();
	await nextTrigger.click();
	await expect(review).not.toHaveAttribute('data-season-id', firstSeasonId!);
	await expect(review.getByRole('button', { name: '162-0 season', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(review.getByRole('button', { name: 'Text version', exact: true })).toHaveCount(0);
	await expect(review.locator('.results-back.simplified')).toHaveCount(0);

	await review.getByRole('button', { name: 'Actual season', exact: true }).click();
	await review.getByRole('button', { name: /^Show text version for / }).click();
	await page.keyboard.press('Escape');
	await expect(review).toBeVisible();
	await review.getByRole('button', { name: 'Hide card', exact: true }).click();
	await expect(review).toHaveCount(0);
	await expect(nextTrigger).toBeFocused();

	await nextTrigger.click();
	await expect(review.getByRole('button', { name: '162-0 season', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(review.getByRole('button', { name: 'Text version', exact: true })).toHaveCount(0);
	await expect(review.getByRole('button', { name: 'Show front', exact: true })).toBeVisible();
	await review.getByRole('button', { name: 'Hide card', exact: true }).click();
	await expect(nextTrigger).toBeFocused();
	if (originalViewport) await page.setViewportSize(originalViewport);
}
