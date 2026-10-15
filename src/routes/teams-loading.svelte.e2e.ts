import { expect, test } from '@playwright/test';
import type { LibraryEntry } from '../lib/game/library.ts';
import { LEGACY_KEYS } from '../lib/storage/legacy.ts';
import { currentManifest } from './draft-test-fixtures.ts';

for (const reducedMotion of [false, true]) {
	test(`My teams waits for saved profile data before fading in (${reducedMotion ? 'reduced' : 'animated'} motion)`, async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const candidate = manifest.candidates.find(item => item.eligibleSlots.includes('LF'))!;
		const entry: LibraryEntry = {
			key: 'teams-loading-example', savedAt: new Date(0).toISOString(), token: 'not-a-replay',
			schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: manifest.dataVersion,
			record: { wins: 120, losses: 42 }, runs: { scored: 900, allowed: 500 }, batting: [], pitching: [], stadium: null,
			roster: [{ seasonId: candidate.seasonId, label: 'Example player', slot: 'LF' }]
		};
		await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: LEGACY_KEYS.library, value: JSON.stringify([entry]) });
		if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
		let release!: () => void;
		const held = new Promise<void>(resolve => { release = resolve; });
		const chunk = manifest.chunks[`${candidate.franchiseId}-${candidate.decade}`];
		await page.route(`**${chunk}`, async route => { await held; await route.continue(); });
		await page.goto('/seasons', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('status')).toContainText('Loading your seasons');
		await expect(page.getByRole('list', { name: 'Saved clubs' })).toHaveCount(0);
		release();
		const clubs = page.getByRole('list', { name: 'Saved clubs' });
		await expect(clubs.locator('button[data-entry]')).toHaveCount(1);
		await expect(page.getByRole('status')).toHaveCount(0);
		await expect(clubs).toBeVisible();
		if (!reducedMotion) await expect(page.locator('main.page')).toHaveClass(/ready/);
	});
}
