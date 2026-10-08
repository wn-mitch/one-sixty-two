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
	await trigger.click();
	const dialog = page.locator('dialog.card-inspection[open]');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('button', { name: '162-0 season', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(dialog.getByRole('button', { name: 'Show front', exact: true })).toBeVisible();
	await expect.poll(async () => dialog.locator('.scaled-viewport').evaluate(card => {
		const bounds = card.getBoundingClientRect();
		return bounds.width > 0 && bounds.height > 0 && bounds.left >= 0 && bounds.top >= 0 &&
			bounds.right <= innerWidth && bounds.bottom <= innerHeight;
	})).toBe(true);

	const contrasts = await dialog.locator('.results-back').evaluate(back => {
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

	await dialog.getByRole('button', { name: 'Actual season', exact: true }).click();
	await expect(dialog.getByRole('button', { name: 'Actual season', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(dialog.getByRole('list', { name: 'Season awards', exact: true })).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Show front', exact: true }).click();
	await expect(dialog.getByRole('button', { name: 'Turn over', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();
	if (originalViewport) await page.setViewportSize(originalViewport);
}
