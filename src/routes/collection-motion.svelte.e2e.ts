import { expect, test } from '@playwright/test';
import type { LibraryEntry } from '../lib/game/library.ts';
import { LEGACY_KEYS } from '../lib/storage/legacy.ts';
import { currentManifest } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 1024, height: 900 }, reducedMotion: 'no-preference' });

test('collection card follows mouse weight across its face', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const candidate = manifest.candidates.find(item => item.eligibleSlots.includes('LF') && !item.seasonId.startsWith('bullpen:'))!;
	const entry: LibraryEntry = {
		key: 'collection-motion-e2e', savedAt: '2026-03-01T00:00:00.000Z', token: 'not-a-replay',
		schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: manifest.dataVersion,
		record: { wins: 120, losses: 42 }, runs: { scored: 900, allowed: 500 },
		batting: [], pitching: [], stadium: null,
		roster: [{ seasonId: candidate.seasonId, label: 'Example player', slot: 'LF' }]
	};
	await page.addInitScript(({ key, value }) => {
		localStorage.setItem(key, value);
	}, { key: LEGACY_KEYS.library, value: JSON.stringify([entry]) });
	await page.goto('/collection');

	const tile = page.getByRole('list', { name: 'Collected players' }).getByRole('button').first();
	const surface = tile.locator('[data-card][data-face="front"]');
	await expect(surface).toBeVisible({ timeout: 30000 });
	await surface.scrollIntoViewIfNeeded();
	const art = tile.locator('.art');
	const bounds = await art.boundingBox();
	expect(bounds).not.toBeNull();
	await page.mouse.move(1, 1);
	await page.waitForTimeout(400);

	const signedHorizontalTilt = () => surface.evaluate(node => {
		const match = (node as HTMLElement).style.transform.match(/rotate3d\(\s*[-\d.]+,\s*([-\d.]+),\s*[-\d.]+,\s*([-\d.]+)deg\)/);
		return match ? Number(match[1]) * Number(match[2]) : 0;
	});
	await page.mouse.move(bounds!.x + bounds!.width * .1, bounds!.y + bounds!.height * .5);
	await expect.poll(signedHorizontalTilt).toBeLessThan(-4);
	await page.mouse.move(bounds!.x + bounds!.width * .9, bounds!.y + bounds!.height * .5);
	await expect.poll(signedHorizontalTilt).toBeGreaterThan(4);
	await tile.click();
	const detail = page.getByRole('region', { name: 'Example player', exact: true });
	await detail.getByRole('button', { name: 'Turn over', exact: true }).click();
	await expect(detail.locator('.reader:popover-open .back[aria-hidden="false"]')).toBeVisible();
	await detail.getByRole('button', { name: 'Show front', exact: true }).click();
	await expect(detail.locator('.reader:popover-open .front[aria-hidden="false"]')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(detail.locator('.reader:popover-open')).toHaveCount(0);
	await expect(detail.locator('.front .card[data-card]')).toBeVisible();
});
