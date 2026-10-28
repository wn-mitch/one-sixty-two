import { expect, test, type Page } from '@playwright/test';
import { deviceDraft, finishRoster, openPack, pickFirstSeason, selectStadium, settlePool } from './draft-test-fixtures.ts';

// Mirrors `GUIDE_STORAGE_KEY`; the guide module needs the Svelte compiler, which Playwright does not run.
const GUIDE_STORAGE_KEY = '162-zero:guide:v2';
const callout = (page: Page) => page.getByRole('complementary', { name: 'First-season tip' });

async function gotIt(page: Page, step: string) {
	await expect(callout(page)).toHaveAttribute('data-guide-step', step);
	await callout(page).getByRole('button', { name: 'Got it', exact: true }).click();
}

test('a first draft walks through one callout at a time and carries one bonus extra pack', async ({ page, request }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Play now: draft your team', exact: true }).click();
	await expect(callout(page)).toHaveCount(1);
	await expect(callout(page)).toHaveAttribute('data-guide-step', 'stadium');
	await selectStadium(page);
	await expect(callout(page)).toHaveAttribute('data-guide-step', 'pack');
	await openPack(page);
	await settlePool(page);
	expect((await deviceDraft(page)).bonusPack).toBe(true);
	await gotIt(page, 'card');
	await expect(callout(page)).toHaveAttribute('data-guide-step', 'slots');
	// The text lets taps through to the card beneath; an open sheet hides the callout.
	await page.locator('.candidate-card').first().getByRole('button', { name: /^Select / }).first().click();
	await expect(page.locator('dialog.draft-sheet[open]')).toBeVisible();
	await expect(callout(page)).toBeHidden();
	await page.locator('dialog.draft-sheet[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
	await pickFirstSeason(page, request);
	await openPack(page);
	// Tapping the thing a callout points at counts as seen.
	await expect(callout(page)).toHaveAttribute('data-guide-step', 'field');
	await page.getByRole('button', { name: /^Open your field/ }).click();
	await page.keyboard.press('Escape');
	await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
	await expect(callout(page)).toHaveAttribute('data-guide-step', 'extra');
	await expect(callout(page)).toContainText('free bonus pack');
	await expect(page.getByRole('button', { name: /^Extra pack: .* 3 of 3 left/ })).toBeVisible();
	await gotIt(page, 'extra');
	await expect(callout(page)).toContainText('Extra packs can\'t be bought');
	await expect(callout(page).getByRole('link', { name: /Buy me a pack/ })).toHaveAttribute('href', /ko-fi\.com/);
	await callout(page).getByRole('button', { name: 'Skip guidance', exact: true }).click();
	await expect(callout(page)).toHaveCount(0);
	expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? 'null', GUIDE_STORAGE_KEY))).toMatchObject({ skipped: true, bonusPack: true });

	// The bonus belongs to the first draft only.
	await page.goto('/classic?new=1');
	await selectStadium(page);
	await openPack(page);
	await settlePool(page);
	expect((await deviceDraft(page)).bonusPack).toBeUndefined();
	await expect(callout(page)).toHaveCount(0);
});

test('a guided draft ends with roster and first-results callouts', async ({ page, request }) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(([key]) => localStorage.setItem(key, JSON.stringify({ skipped: false, done: ['stadium', 'pack', 'card', 'slots', 'field', 'extra', 'free'], bonusPack: true })), [GUIDE_STORAGE_KEY]);
	await finishRoster(page, request);
	await expect(callout(page)).toHaveAttribute('data-guide-step', 'roster');
	await page.locator('.lineup .simulate button.primary').click();
	await expect(page.locator('.scoreboard .record-block')).toBeVisible({ timeout: 120_000 });
	await expect(callout(page)).toHaveAttribute('data-guide-step', 'results');
	await expect(callout(page)).toContainText('162-0 is a perfect season');
});
