import { expect, test, type Page } from '@playwright/test';
import { ERA_HOLO } from '../lib/cards/surface/holo-films.ts';
import { ERA_FOIL } from '../lib/cards/surface/foil-plates.ts';
import { COLORWAYS } from '../lib/cosmetics/catalogue.ts';

test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
test.setTimeout(120_000);

type MaterialWork = { links: number; uploads: number; lastWork: number };
type ProbedWindow = Window & { __factoryMaterialWork: MaterialWork };

async function settledWork(page: Page): Promise<MaterialWork> {
	const started = await page.evaluate(() => performance.now());
	await page.waitForFunction(started => performance.now() - Math.max(started, (window as unknown as ProbedWindow).__factoryMaterialWork.lastWork) > 750, started);
	return page.evaluate(() => ({ ...(window as unknown as ProbedWindow).__factoryMaterialWork }));
}

test('factory pattern changes reuse every tile material and keep the exact live preview', async ({ page }) => {
	// Count real driver calls, without replacing the shader renderer or relying on frame timing thresholds.
	await page.addInitScript(() => {
		const work: MaterialWork = { links: 0, uploads: 0, lastWork: performance.now() };
		Object.assign(window, { __factoryMaterialWork: work });
		const gl = WebGL2RenderingContext.prototype;
		gl.linkProgram = new Proxy(gl.linkProgram, {
			apply(target, context, args) {
				work.links++;
				work.lastWork = performance.now();
				return Reflect.apply(target, context, args);
			}
		});
		gl.texSubImage2D = new Proxy(gl.texSubImage2D, {
			apply(target, context, args) {
				work.uploads++;
				work.lastWork = performance.now();
				return Reflect.apply(target, context, args);
			}
		});
	});
	await page.goto('/factory?era=2010s');
	const sample = page.locator('.preview');
	await expect(sample.locator('canvas[data-presented]').first()).toBeVisible({ timeout: 30_000 });
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
	await expect(sample).toHaveAttribute('data-film', ERA_HOLO['2010s']);
	await expect(sample).toHaveAttribute('data-plate', ERA_FOIL['2010s']);
	const tiles = page.locator('.tray [data-finish-id] [data-finish-sample]');
	const eras = () => tiles.evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('data-card')))]);
	expect(await eras()).toEqual(['2010s']);
	let before = await settledWork(page);

	const patterns = page.getByRole('group', { name: 'Holo pattern', exact: true });
	await patterns.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	await expect(sample).toHaveAttribute('data-film', 'refractor');
	let after = await settledWork(page);
	// Choosing a pattern changes one card's film: the era's stock maps already exist and no tile is rebuilt.
	expect(after.uploads).toBe(before.uploads);
	expect(after.links - before.links).toBeLessThanOrEqual(1);

	await page.getByRole('tab', { name: /^Colorway/ }).click();
	const colors = page.getByRole('group', { name: 'Colorway', exact: true });
	await expect(colors).toBeVisible();
	before = await settledWork(page);
	await colors.getByRole('button', { name: 'Ice, 1 token', exact: true }).click();
	await expect(sample).toHaveAttribute('data-film', 'refractor');
	await expect(sample).toHaveAttribute('data-palette', String(COLORWAYS.find(option => option.id === 'ice')!.palette));
	await expect(sample).toHaveAttribute('data-card', '2010s');
	after = await settledWork(page);
	// A colorway is a palette on an existing film program and stock.
	expect(after.uploads).toBe(before.uploads);
	expect(after.links).toBe(before.links);
	expect(await eras()).toEqual(['2010s']);
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
});
