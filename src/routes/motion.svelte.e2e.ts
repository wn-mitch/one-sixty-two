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

test('keeps the motion toggle persistent and subordinate to reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	let releaseScripts!: () => void;
	const scripts = new Promise<void>(resolve => { releaseScripts = resolve; });
	await page.route('**/_app/immutable/**/*.js', async route => {
		await scripts;
		await route.continue();
	});
	await page.goto('/', { waitUntil: 'commit' });
	const toggle = page.getByRole('switch', { name: 'Motion', exact: true });
	try {
		await expect(toggle).toBeDisabled();
	} finally {
		releaseScripts();
	}
	await expect(toggle).toBeEnabled();
	await page.unroute('**/_app/immutable/**/*.js');
	await toggle.focus();
	await page.keyboard.press('Space');
	await expect(toggle).toHaveAttribute('aria-checked', 'false');

	await page.reload();
	await expect(toggle).toBeEnabled();
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	const track = page.locator('.wall-track').first();
	await expect(track).toBeAttached();
	const restingPosition = await expectStationaryPosition(track);

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => track.evaluate(node => node.getBoundingClientRect().x)).not.toBe(restingPosition);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(toggle).toBeDisabled();
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await expect(toggle).toHaveAccessibleDescription('Your system preference reduces motion.');
	const reducedPosition = await expectStationaryPosition(track);
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await expect(toggle).toBeEnabled();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => track.evaluate(node => node.getBoundingClientRect().x)).not.toBe(reducedPosition);
});
