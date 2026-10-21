import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../lib/game/draft.ts';
import { SLOTS, type Draft, type Manifest } from '../lib/game/types.ts';
import { currentManifest, writeDeviceDraft } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
test.setTimeout(120_000);

function completeDraft(manifest: Manifest): Draft {
	for (let seed = 301; seed < 351; seed++) {
		try {
			let draft = selectHomeStadium(createDraft(manifest, seed), manifest, manifest.stadiums[3].ref.id);
			while (draft.picks.length < SLOTS.length) {
				draft = rollDraft(draft, manifest);
				const candidate = availableCandidates(draft, manifest).find(item => legalSlots(draft, item, manifest).length);
				if (!candidate) throw new Error('No legal candidate');
				draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
			}
			return draft;
		} catch { /* Try the next deterministic draft. */ }
	}
	throw new Error('No complete draft within 50 seeds');
}

async function prepareSeason(page: Page, request: APIRequestContext): Promise<void> {
	const draft = completeDraft(await currentManifest(request));
	await page.goto('/');
	await writeDeviceDraft(page, JSON.stringify({ ...draft, phase: 'lineup' }));
	await page.goto('/classic');
	await expect(page.getByRole('button', { name: 'Simulate 162 games', exact: true })).toBeEnabled();
}

async function finishSeason(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
	await page.getByRole('button', { name: 'Skip animation', exact: true }).click();
	await expect(page.locator('#results-heading')).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('.earned-receipt .reward-chip')).toHaveAccessibleName(/2 tokens earned: 1 season token \+ 1 first-season bonus/);
}

test('one earned chip rises above the phone actions, flies into the wallet and splashes without changing its balance', async ({ page, request }) => {
	await prepareSeason(page, request);
	await finishSeason(page);
	const chip = page.locator('.earned-receipt .reward-chip');
	const flight = page.locator('[data-reward-flight]');
	await expect(flight).toBeAttached();
	await expect(chip).toHaveCSS('opacity', '0');
	await expect(flight).toHaveAttribute('aria-hidden', 'true');
	await expect.poll(() => flight.evaluate(node => {
		const rect = node.getBoundingClientRect();
		const toolbar = document.querySelector('.share-shortcuts')!.getBoundingClientRect();
		return Number(getComputedStyle(node).opacity) === 1 && rect.top > innerHeight / 2 && rect.bottom < toolbar.top;
	})).toBe(true);
	await expect(page.getByRole('link', { name: 'Shop, 2 tokens', exact: true })).toBeVisible();
	await expect(page.locator('.results-outcome [role="status"]')).toContainText('2 tokens earned: 1 season token + 1 first-season bonus');
	await expect(page.locator('.guide-tip')).toHaveCount(0);

	// Observe arrival itself, not merely that the temporary node eventually disappears.
	await page.waitForFunction(() => {
		const splash = document.querySelector('.reward-splash');
		const wallet = document.querySelector('[data-token-wallet]');
		if (!splash || !wallet) return false;
		const a = splash.getBoundingClientRect();
		const b = wallet.getBoundingClientRect();
		return Math.abs(a.left + a.width / 2 - b.left - b.width / 2) < 1 && Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < 1;
	});
	await expect(page.locator('[data-reward-flight], .reward-splash')).toHaveCount(0);
	await expect(chip).toHaveCSS('opacity', '1');
	await expect(chip).toHaveAccessibleName(/2 tokens earned: 1 season token \+ 1 first-season bonus/);
	await chip.click();
	await expect(page.locator('.balance')).toHaveText('2 unlock tokens');
});

test('reduced motion interrupts the token flight and enabling motion does not replay the receipt', async ({ page, request }) => {
	await prepareSeason(page, request);
	await finishSeason(page);
	await expect(page.locator('[data-reward-flight]')).toBeAttached();
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(page.locator('[data-reward-flight], .reward-splash')).toHaveCount(0);
	const chip = page.locator('.earned-receipt .reward-chip');
	await expect(chip).toHaveCSS('opacity', '1');
	await expect(page.getByRole('link', { name: 'Shop, 2 tokens', exact: true })).toBeVisible();
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.getByRole('button', { name: 'About season awards', exact: true }).focus();
	await expect(page.locator('[data-reward-flight], .reward-splash')).toHaveCount(0);
	await expect(chip).toHaveCSS('opacity', '1');
});

test('an unavailable wallet target leaves an accessible static Shop receipt', async ({ page, request }) => {
	await prepareSeason(page, request);
	await page.addStyleTag({ content: '[data-token-wallet] { display: none !important; }' });
	await finishSeason(page);
	const chip = page.locator('.earned-receipt .reward-chip');
	await expect(chip).toHaveCSS('opacity', '1');
	await expect(page.locator('[data-reward-flight], .reward-splash')).toHaveCount(0);
	await expect(page.locator('.results-outcome [role="status"]')).toContainText('Added to your Shop wallet');
	await chip.click();
	await expect(page.locator('.balance')).toHaveText('2 unlock tokens');
});

test('the results arrival never widens the phone page or lifts the share bar off the bottom edge', async ({ page, request }) => {
	await prepareSeason(page, request);
	await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
	await page.getByRole('button', { name: 'Skip animation', exact: true }).click();
	// Sample every frame from the hand-off until the arrival animations settle.
	const samples = await page.evaluate(() => new Promise<{ wide: number; barOffset: number; frames: number }>(resolve => {
		let wide = 0;
		let barOffset = 0;
		let frames = 0;
		let started = 0;
		const sample = (time: number) => {
			const bar = document.querySelector('.results .share-shortcuts');
			if (bar) {
				started ||= time;
				frames++;
				wide = Math.max(wide, document.documentElement.scrollWidth - innerWidth);
				barOffset = Math.max(barOffset, Math.abs(innerHeight - bar.getBoundingClientRect().bottom));
			}
			if (started && time - started > 2000) resolve({ wide, barOffset, frames });
			else requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	}));
	expect(samples.frames).toBeGreaterThan(0);
	expect(samples.wide).toBe(0);
	expect(samples.barOffset).toBeLessThan(1);
});
