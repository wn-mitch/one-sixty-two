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

test('factory scope changes reuse catalogue materials and keep the exact live preview', async ({ page }) => {
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
	await page.goto('/factory');
	const sample = page.locator('.preview [data-finish-sample]');
	await expect(sample.locator('canvas[data-presented]')).toBeVisible({ timeout: 30_000 });
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
	const catalogue = page.locator('.controls [data-finish-id] [data-finish-sample]');
	const catalogueState = () => catalogue.evaluateAll(nodes => nodes.map(node => ({
		era: node.getAttribute('data-card'), film: node.getAttribute('data-film'),
		plate: node.getAttribute('data-plate'), palette: node.getAttribute('data-palette'),
		identity: node.getAttribute('data-identity')
	})));
	const initialCatalogue = await catalogueState();
	let before = await settledWork(page);

	await page.getByRole('button', { name: /^1990s,/ }).click();
	await expect(sample).toHaveAttribute('data-card', '1990s');
	await expect(sample).toHaveAttribute('data-film', ERA_HOLO['1990s']);
	await expect(sample).toHaveAttribute('data-plate', ERA_FOIL['1990s']);
	let after = await settledWork(page);
	// Only the main preview, Deck default, Era original and Film original need the new stock's two maps.
	expect(after.uploads - before.uploads).toBeLessThanOrEqual(8);
	expect(after.links - before.links).toBeLessThanOrEqual(1);
	expect(await catalogueState()).toEqual(initialCatalogue);

	await page.getByRole('button', { name: /^2000s,/ }).click();
	await expect(sample).toHaveAttribute('data-card', '2000s');
	before = await settledWork(page);
	await page.getByRole('button', { name: /^2010s,/ }).click();
	await expect(sample).toHaveAttribute('data-card', '2010s');
	await expect(sample).toHaveAttribute('data-film', ERA_HOLO['2010s']);
	await expect(sample).toHaveAttribute('data-plate', ERA_FOIL['2010s']);
	after = await settledWork(page);
	// Both eras use chrome stock: changing the film and era tuning must reuse every existing map.
	expect(after.uploads).toBe(before.uploads);
	expect(await catalogueState()).toEqual(initialCatalogue);

	const patterns = page.getByRole('group', { name: 'Holo pattern', exact: true });
	const colors = page.getByRole('group', { name: 'Colorway', exact: true });
	before = after;
	await patterns.getByRole('button', { name: 'Refractor, 1 token', exact: true }).click();
	await colors.getByRole('button', { name: 'Ice, 1 token', exact: true }).click();
	await expect(sample).toHaveAttribute('data-film', 'refractor');
	await expect(sample).toHaveAttribute('data-palette', String(COLORWAYS.find(option => option.id === 'ice')!.palette));
	await expect(sample).toHaveAttribute('data-card', '2010s');
	after = await settledWork(page);
	expect(after.uploads).toBe(before.uploads);
	expect(await catalogueState()).toEqual(initialCatalogue);
	await expect(page.getByRole('button', { name: '2010s, Deck default', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.balance')).toHaveText('0 unlock tokens');
});
