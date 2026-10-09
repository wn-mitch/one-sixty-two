import { expect, test, type Page } from '@playwright/test';

async function openSettings(page: Page) {
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Settings' });
	await expect(dialog).toBeVisible();
	return dialog;
}

test('opens the native Settings dialog and persists all preferences', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto('/');

	const dialog = await openSettings(page);
	const motion = dialog.getByRole('switch', { name: 'Motion', exact: true });
	const cards = dialog.getByRole('switch', { name: 'Card review animation', exact: true });
	const speed = dialog.getByRole('slider', { name: 'Card speed', exact: true });
	await expect(motion).toHaveAttribute('aria-checked', 'true');
	await expect(cards).toHaveAttribute('aria-checked', 'true');
	await expect(speed).toHaveValue('1');
	await speed.fill('1.6');
	await expect(speed).toHaveValue('1.6');
	await expect(dialog.locator('output')).toHaveText('1.6×');
	await dialog.getByRole('button', { name: 'Review first', exact: true }).click();
	await motion.click();
	await cards.click();
	await dialog.getByRole('button', { name: 'Close settings', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();

	await page.reload();
	const restored = await openSettings(page);
	await expect(restored.getByRole('switch', { name: 'Motion', exact: true })).toHaveAttribute('aria-checked', 'false');
	await expect(restored.getByRole('switch', { name: 'Card review animation', exact: true })).toHaveAttribute('aria-checked', 'false');
	await expect(restored.getByRole('button', { name: 'Review first', exact: true })).toHaveAttribute('aria-pressed', 'true');
	const restoredSpeed = restored.getByRole('slider', { name: 'Card speed', exact: true });
	await expect(restoredSpeed).toHaveValue('1.6');
	await expect(restoredSpeed).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(restored).toBeHidden();
	await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
	await openSettings(page);
	await page.mouse.click(12, 12);
	await expect(restored).toBeHidden();
	await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
});

test('keeps the saved preference under a live reduced-motion override', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto('/');
	let dialog = await openSettings(page);
	const motion = dialog.getByRole('switch', { name: 'Motion', exact: true });
	await expect(motion).toHaveAttribute('aria-checked', 'true');
	const speed = dialog.getByRole('slider', { name: 'Card speed', exact: true });
	await speed.fill('1.5');
	await expect(speed).toHaveValue('1.5');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	await page.emulateMedia({ reducedMotion: 'reduce' });
	dialog = await openSettings(page);
	await expect(dialog.getByRole('switch', { name: 'Motion', exact: true })).toBeDisabled();
	await expect(dialog.getByRole('switch', { name: 'Motion', exact: true })).toHaveAccessibleDescription('Your system preference reduces motion. Motion stays off until that preference changes.');
	await expect(dialog.getByRole('switch', { name: 'Card review animation', exact: true })).toBeDisabled();
	const reducedSpeed = dialog.getByRole('slider', { name: 'Card speed', exact: true });
	await expect(reducedSpeed).toBeDisabled();
	await expect(reducedSpeed).toHaveValue('1.5');
	await dialog.getByRole('button', { name: 'Close settings', exact: true }).click();

	await page.emulateMedia({ reducedMotion: 'no-preference' });
	dialog = await openSettings(page);
	await expect(dialog.getByRole('switch', { name: 'Motion', exact: true })).toHaveAttribute('aria-checked', 'true');
	const restoredSpeed = dialog.getByRole('slider', { name: 'Card speed', exact: true });
	await expect(restoredSpeed).toBeEnabled();
	await expect(restoredSpeed).toHaveValue('1.5');
});
