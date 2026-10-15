import { expect, test, type Locator } from '@playwright/test';
import { dialsOf, filmNames, parseSetup } from '../../lib/lab/controls.ts';
import { encodeLink } from '../../lib/lab/link.ts';

function value(reference: Locator, section: string, label: string): Locator {
	return reference.locator('.reference-section').filter({ has: reference.page().getByRole('heading', { name: section, exact: true }) })
		.locator('.reference-row').filter({ has: reference.page().locator('dt').filter({ hasText: new RegExp(`^${label}$`) }) }).locator('dd');
}

test('Options follows live dials, removes inactive settings, and restores the reference from a saved link', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/lab');
	await page.getByRole('radio', { name: 'Options', exact: true }).click();
	await page.locator('#lab-film').selectOption('poincare-disk');
	const reference = page.locator('.reference');
	const canvas = page.locator('.lab-card canvas.light');
	await expect(reference).toBeVisible();
	await expect(value(reference, 'Film', 'film')).toHaveText('poincare-disk');
	await expect(canvas).toHaveAttribute('data-presented', '', { timeout: 15000 });
	const original = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
	await page.getByRole('slider', { name: 'zoom dial', exact: true }).fill('8');
	await expect(value(reference, 'Film', 'zoom')).toHaveText('8');
	await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).not.toBe(original);
	await page.getByRole('button', { name: 'Reset film dials', exact: true }).click();
	await expect(value(reference, 'Film', 'zoom')).toHaveText(String(dialsOf('film', 'poincare-disk').zoom!.value));
	await page.getByRole('slider', { name: 'zoom dial', exact: true }).fill('8');
	await page.locator('#lab-film').selectOption('double-helix');
	await expect(value(reference, 'Film', 'film')).toHaveText('double-helix');
	await expect(value(reference, 'Film', 'zoom')).toHaveCount(0);
	await expect(value(reference, 'Film', 'rungs')).toBeVisible();
	await page.locator('#lab-film').selectOption('poincare-disk');
	await expect(value(reference, 'Film', 'zoom')).toHaveText('8');
	const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/lab' && response.request().method() === 'POST');
	await page.getByRole('button', { name: 'Copy link', exact: true }).click();
	const response = await saved;
	expect(response.status()).toBe(201);
	const { url } = await response.json();
	await page.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(reference).toHaveCount(0);
	await page.goto(url);
	await expect(page.getByRole('radio', { name: 'Options', exact: true })).toHaveAttribute('aria-checked', 'true');
	await expect(value(reference, 'Film', 'film')).toHaveText('poincare-disk');
	await expect(value(reference, 'Film', 'zoom')).toHaveText('8');
	await page.getByRole('radio', { name: 'Base', exact: true }).click();
	await expect(reference.locator('.reference-section').filter({ has: page.getByRole('heading', { name: 'Film', exact: true }) })).toHaveCount(0);
	await expect(reference.locator('.reference-section').filter({ has: page.getByRole('heading', { name: 'Light', exact: true }) })).toHaveCount(0);
});

for (const width of [420, 240, 160]) {
	test(`dense Options reference fits without clipping or internal scrolling at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 1100 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const setup = parseSetup({
			print: 'options', film: 'spiral-moire', finish: 'brushed', plate: 'damascus',
			under: filmNames.reduce((longest, name) => name.length > longest.length ? name : longest),
			light: { plateUnderFilm: 0.6 }, drift: false
		});
		await page.goto(`/lab#${encodeLink({ setup, stagger: null, width })}`);
		const reference = page.locator('.reference');
		await expect(reference).toBeVisible();
		await expect(page.locator('.lab-card canvas.light')).toHaveAttribute('data-presented', '', { timeout: 15000 });
		expect(await reference.locator('.reference-row').count()).toBeGreaterThanOrEqual(30);
		await expect.poll(() => reference.evaluate(element => {
			const bounds = element.getBoundingClientRect();
			const inside = [...element.querySelectorAll('h2, h3, dt, dd, .specimen')].every(child => {
				const rect = child.getBoundingClientRect();
				return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
			});
			return inside && element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1;
		})).toBe(true);
		await expect.poll(() => page.locator('.lab-card').evaluate(element => element.getBoundingClientRect().width)).toBe(width);
		await testInfo.attach(`options-${width}`, { body: await page.locator('.lab-card').screenshot(), contentType: 'image/png' });
	});
}

test('staggered Options cards print their own dial values and picking one updates the selected setup', async ({ page }) => {
	await page.goto('/lab');
	await page.getByRole('radio', { name: 'Options', exact: true }).click();
	await page.locator('#lab-film').selectOption('poincare-disk');
	await page.getByRole('button', { name: 'Stagger zoom', exact: true }).click();
	const cards = page.locator('.lab-card');
	await expect(cards).toHaveCount(5);
	for (const card of await cards.all()) {
		const choice = card.locator('figcaption button');
		await expect(value(card.locator('.reference'), 'Film', 'zoom')).toHaveText((await choice.innerText()).trim());
	}
	const choice = cards.last().locator('figcaption button');
	const chosen = (await choice.innerText()).trim();
	await choice.click();
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(cards).toHaveCount(1);
	await expect(value(page.locator('.reference'), 'Film', 'zoom')).toHaveText(chosen);
	await expect(page.locator('#lab-film-zoom')).toHaveValue(chosen);
});
