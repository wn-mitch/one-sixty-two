import { expect, test, type Locator } from '@playwright/test';

async function expectStationaryPosition(track: Locator): Promise<number> {
	const positions = await track.evaluate(async node => {
		const values: number[] = [];
		for (let frame = 0; frame < 8; frame++) {
			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
			values.push(node.getBoundingClientRect().x);
		}
		return values;
	});
	expect(positions.every(position => position === positions[0])).toBe(true);
	return positions[0];
}

test('keeps motion controls named, persistent, and subordinate to reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	let releaseScripts!: () => void;
	const scripts = new Promise<void>(resolve => { releaseScripts = resolve; });
	await page.route('**/_app/immutable/**/*.js', async route => {
		await scripts;
		await route.continue();
	});
	await page.goto('/', { waitUntil: 'commit' });
	await page.locator('.motion-settings summary').click();
	const settings = page.locator('.motion-settings');
	const amount = settings.getByRole('slider', { name: /^Amount/ });
	const speed = settings.getByRole('slider', { name: /^Speed/ });
	const enabled = settings.getByRole('checkbox', { name: /^Enabled/ });
	try {
		await expect(amount).toBeDisabled();
		await expect(speed).toBeDisabled();
		await expect(enabled).toBeDisabled();
	} finally {
		releaseScripts();
	}
	await expect(amount).toBeEnabled();
	await page.unroute('**/_app/immutable/**/*.js');
	await amount.focus();
	await page.keyboard.press('End');
	await page.keyboard.press('ArrowLeft');
	await speed.focus();
	await page.keyboard.press('Home');
	await page.keyboard.press('ArrowRight');
	await enabled.uncheck();

	await page.reload();
	await page.locator('.motion-settings summary').click();
	await expect(amount).toHaveValue('2.75');
	await expect(speed).toHaveValue('0.5');
	await expect(enabled).not.toBeChecked();
	const track = page.locator('.wall-track').first();
	await expect(track).toBeAttached();
	const restingPosition = await expectStationaryPosition(track);

	await enabled.check();
	await expect.poll(() => track.evaluate(node => node.getBoundingClientRect().x)).not.toBe(restingPosition);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(settings.locator('.notice[role="status"]')).toBeVisible();
	await expect(enabled).toBeChecked();
	const reducedPosition = await expectStationaryPosition(track);
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await expect.poll(() => track.evaluate(node => node.getBoundingClientRect().x)).not.toBe(reducedPosition);
});
