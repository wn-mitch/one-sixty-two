import type { Page } from '@playwright/test';
import { test, expect, openStory } from './workshop-test';

type Box = [number, number, number, number];

/** Each skeleton's landmarks and the loaded regions they stand in for; all start above the fold. */
const SCREENS: Record<string, [string, string][]> = {
	stadiums: [['.stadium-skeleton .tools', '.deck-tools'], ['.stadium-skeleton .grid > :nth-child(2)', '.choice-wrap:nth-child(2)'], ['.stadium-skeleton .commit', '.stadium-deck .commit']],
	'draft-pack': [['.draft-skeleton .board-columns', '.board-columns'], ['.draft-skeleton .stage', '.foil-pack .stage'], ['.draft-skeleton .field-panel', '.field-panel'], ['.draft-skeleton .slot:nth-of-type(5)', '.field-panel [data-slot="1B"]']],
	'draft-pool': [['.draft-skeleton .section-heading', '.candidates .section-heading'], ['.draft-skeleton .card-grid > :nth-child(2)', '.candidate-card:nth-child(2)'], ['.draft-skeleton .card-grid > :nth-child(4)', '.candidate-card:nth-child(4)']],
	lineup: [['.lineup-skeleton .batting .row:nth-child(2)', '.order.batting > li:nth-child(2)'], ['.lineup-skeleton .simulate', '.lineup .simulate']],
	season: [['.progress-skeleton .track', '.progress-track'], ['.progress-skeleton .button', '.progress-shell > button']],
	results: [['.results-skeleton .scoreboard', '.scoreboard'], ['.results-skeleton .entry:nth-child(2)', '.award-entry:nth-child(2)']],
	'draft-mode': [['.entry-skeleton .franchises > :nth-child(1)', '.entry .franchise:nth-child(1)'], ['.entry-skeleton .difficulties', '.entry .difficulties']]
};

async function boxes(page: Page, story: string, args: string, selectors: string[]): Promise<Box[]> {
	await openStory(page, `application-skeleton--${story}&args=${args}`);
	return Promise.all(selectors.map(async selector => {
		const target = page.locator(selector).first();
		await expect(target).toBeAttached({ timeout: 30000 });
		// Loaded screens rise in on arrival; measure once the region has come to rest.
		let previous = '';
		let box: Box = [0, 0, 0, 0];
		await expect.poll(async () => {
			const measured = await target.boundingBox();
			box = measured ? [measured.x, measured.y, measured.width, measured.height] : [0, 0, 0, 0];
			const settled = JSON.stringify(box) === previous;
			previous = JSON.stringify(box);
			return settled;
		}, { intervals: [250], timeout: 15000 }).toBe(true);
		return box;
	}));
}

test.describe('Screen skeletons', () => {
	for (const width of [1512, 390]) {
		for (const [story, pairs] of Object.entries(SCREENS)) {
			test(`${story} keeps the loaded layout at ${width}px`, async ({ page }) => {
				await page.setViewportSize({ width, height: 982 });
				// Wide-only regions (the field panel) are absent from both on phones.
				const shared = width < 1100 ? pairs.filter(([skeleton]) => !skeleton.includes('field-panel') && !skeleton.includes('.slot')) : pairs;
				const skeleton = await boxes(page, story, 'loaded:!false', shared.map(([selector]) => selector));
				const loaded = await boxes(page, story, 'skeleton:!false', shared.map(([, selector]) => selector));
				shared.forEach(([selector], index) => {
					const shift = Math.max(...skeleton[index].map((value, axis) => Math.abs(value - loaded[index][axis])));
					expect(shift, `${selector} moves when the screen loads`).toBeLessThanOrEqual(3);
				});
			});
		}
	}

	test('appears after a short delay with its status, and its sheen stops when motion is off', async ({ page }) => {
		await openStory(page, 'application-skeleton--draft-pool&args=loaded:!false');
		await expect(page.getByRole('status').filter({ hasText: 'Loading the draft…' })).toBeAttached();
		const bone = page.locator('.draft-skeleton .sk-card').first();
		await expect(bone).toBeVisible();
		expect(await bone.evaluate(node => getComputedStyle(node).animationName)).toBe('sk-sweep');
		await page.evaluate(() => { document.documentElement.dataset.motion = 'off'; });
		expect(await bone.evaluate(node => [getComputedStyle(node).animationName, getComputedStyle(node).backgroundImage])).toEqual(['none', 'none']);
	});

	test('stops the sheen under reduced motion', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openStory(page, 'application-skeleton--stadiums&args=loaded:!false');
		const bone = page.locator('.stadium-skeleton .sk-card').first();
		await expect(bone).toBeVisible();
		expect(await bone.evaluate(node => [getComputedStyle(node).animationName, getComputedStyle(node).backgroundImage])).toEqual(['none', 'none']);
	});

	test('fills the draft board with pool placeholders while eligible seasons load', async ({ page }) => {
		await page.setViewportSize({ width: 1512, height: 982 });
		await openStory(page, 'draft-board--loading');
		await expect(page.getByRole('status').filter({ hasText: 'Finding eligible seasons…' })).toBeAttached();
		await expect(page.locator('.draft-browser .pool-skeleton.wide .card-grid > .card')).not.toHaveCount(0);
	});
});
