import { expect, test, type Page } from '@playwright/test';
import type { LibraryEntry } from '../lib/game/library.ts';
import { LEGACY_KEYS } from '../lib/storage/legacy.ts';
import { currentManifest } from './draft-test-fixtures.ts';

async function holdCollectionData(page: Page) {
	let release!: () => void;
	const released = new Promise<void>(resolve => { release = resolve; });
	await page.route('**/data/current.json', async route => {
		const response = await route.fetch();
		await released;
		await route.fulfill({ response });
	});
	return release;
}

async function expectLoadingCards(page: Page) {
	const loader = page.locator('[data-card-loader]');
	await expect(loader).toBeVisible();
	await expect(loader).toHaveAttribute('role', 'status');
	const images = loader.locator('img');
	await expect(images).toHaveCount(8);
	const sources = await images.evaluateAll(nodes => nodes.map(node => node.getAttribute('src')!));
	expect(sources.every(source => /^\/loading-cards\/\d{2}\.webp$/.test(source))).toBe(true);
	expect(new Set(sources).size).toBe(8);
	await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
	await expect(loader.locator('canvas')).toHaveCount(0);
	return loader;
}

test('slow screen navigation shows eight static cards and clears when the destination is ready', async ({ page }) => {
	await page.goto('/about');
	const release = await holdCollectionData(page);
	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Collection' }).click();
	const loader = await expectLoadingCards(page);
	release();
	await expect(page.getByRole('heading', { name: 'No cards yet' })).toBeVisible();
	await expect(loader).toHaveCount(0, { timeout: 1000 });
});

test('failed destination data removes the loader and exposes the error', async ({ page }) => {
	let reject!: () => void;
	const rejected = new Promise<void>(resolve => { reject = resolve; });
	await page.route('**/data/current.json', async route => { await rejected; await route.abort('failed'); });
	await page.goto('/collection', { waitUntil: 'domcontentloaded' });
	const loader = await expectLoadingCards(page);
	reject();
	await expect(page.getByRole('alert')).toBeVisible();
	await expect(loader).toHaveCount(0, { timeout: 1000 });
});

for (const preference of ['system', 'setting'] as const) {
	test(`${preference} motion preference holds all loading cards still`, async ({ page }) => {
		if (preference === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
		else await page.addInitScript(() => localStorage.setItem('162-zero:settings:v1', JSON.stringify({
			motionEnabled: false, cardAnimation: true, cardSpeed: 1, rosterFirstClick: 'move'
		})));
		const release = await holdCollectionData(page);
		await page.goto('/collection', { waitUntil: 'domcontentloaded' });
		const loader = await expectLoadingCards(page);
		const animated = await loader.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);
		expect(animated).toBe(0);
		release();
		await expect(loader).toHaveCount(0);
	});
}

test('leaving a pending screen removes its loading signal', async ({ page }) => {
	const release = await holdCollectionData(page);
	await page.goto('/collection', { waitUntil: 'domcontentloaded' });
	const loader = await expectLoadingCards(page);
	await page.getByRole('button', { name: 'Menu', exact: true }).click();
	await page.getByRole('link', { name: 'Rules & model' }).click();
	await expect(page).toHaveURL(/\/about(?:#simulation)?$/);
	await expect(loader).toHaveCount(0);
	release();
});

for (const outcome of ['loaded', 'failed'] as const) {
	test(`populated Collection keeps the loader until card profiles have ${outcome}`, async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const candidate = manifest.candidates.find(item => item.eligibleSlots.includes('LF'))!;
		const entry: LibraryEntry = {
			key: 'loading-example', savedAt: new Date(0).toISOString(), token: 'not-a-replay',
			schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: manifest.dataVersion,
			record: { wins: 120, losses: 42 }, runs: { scored: 900, allowed: 500 },
			batting: [], pitching: [], stadium: null,
			roster: [{ seasonId: candidate.seasonId, label: 'Example player', slot: 'LF' }]
		};
		await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
			key: LEGACY_KEYS.library, value: JSON.stringify([entry])
		});
		let release!: () => void;
		const released = new Promise<void>(resolve => { release = resolve; });
		const chunk = manifest.chunks[`${candidate.franchiseId}-${candidate.decade}`];
		await page.route(`**${chunk}`, async route => {
			await released;
			if (outcome === 'failed') await route.abort('failed');
			else await route.continue();
		});
		await page.goto('/collection', { waitUntil: 'domcontentloaded' });
		const loader = await expectLoadingCards(page);
		// Saved records are available, but the real card front still needs its profile.
		await expect(page.getByRole('list', { name: 'Collected players' })).toHaveCount(0);
		release();
		const players = page.getByRole('list', { name: 'Collected players' });
		await expect(players.getByRole('button')).toHaveCount(1);
		await expect(loader).toHaveCount(0);
		if (outcome === 'loaded') await expect(players.locator('[data-card]').first()).toBeVisible();
		else await expect(players).toContainText('Example player');
	});
}
