import { test, expect, openStoryByName } from './workshop-test.ts';
import { routeHistoricalFixture } from './historical-eras-fixtures.ts';

const ERAS = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
const decade = (era: string): number => Number(era.slice(0, 4));

for (const era of ERAS) {
	test(`renders every franchise entry for ${era}`, async ({ page }) => {
		await routeHistoricalFixture(page, decade(era));
		await openStoryByName(page, 'Cards/Eras', era);
		const gallery = page.locator('.historical-gallery');
		await expect(gallery).toBeVisible();
		await expect(gallery.locator('[data-franchise-id][data-season-id]')).toHaveCount(29);
		await expect(gallery.getByText('Historical runtime gallery', { exact: true })).toBeVisible();
		await expect(gallery.locator('[data-franchise-id="F00"]').getByText(`No eligible historical season in ${era}`, { exact: true })).toBeVisible();
		await expect(gallery.locator('[data-franchise-id="F00"]').getByRole('button')).toHaveCount(0);
		await expect(gallery.getByText('No card rendered', { exact: true })).toHaveCount(0);
		const present = gallery.locator('[data-franchise-id="F01"]');
		await expect(present.locator('[data-face-label="Front"] .card')).toBeVisible();
		await expect(present.locator('.card[data-face="back"]')).toBeVisible();
		const compact = present.locator('[data-face-label="Compact"] .card');
		await expect(compact).toHaveJSProperty('clientWidth', 72);
		await expect(compact).toHaveAttribute('data-compact', 'true');
		await expect(gallery.locator('[data-face-label="Compact"] .card')).toHaveCount(29);
		await expect(present.getByText('Historical F01 Player', { exact: true }).first()).toBeVisible();
		await expect(present).toHaveAttribute('data-season-id', `F01:historical:${decade(era)}`);
	});
}

test('renders exact front and reverse facts and switches only the reverse to text', async ({ page }) => {
	await routeHistoricalFixture(page, 2020);
	await openStoryByName(page, 'Cards/Eras', '2020s');
	const entry = page.locator('[data-franchise-id="F01"]');
	await expect(entry.locator('[data-face-label="Front"] .card')).toBeVisible();
	await expect(entry.locator('#historical-F01-back')).toBeVisible();
	await expect(entry.getByText('Historical F01 Player', { exact: true }).first()).toBeVisible();
	const reverse = entry.locator('[data-face-label="Back"]');
	await expect(reverse.getByRole('button', { name: 'Text version', exact: true })).toBeVisible();
	await expect(entry.locator(':scope > button')).toHaveCount(0);
	await expect(entry.locator('[data-face-label="Front"]').getByRole('button', { name: 'Text version', exact: true })).toHaveCount(0);
	await entry.getByRole('button', { name: /^Show text version for / }).click();
	await expect(entry.getByRole('button', { name: 'Text version', exact: true })).toBeFocused();
	await expect(entry.locator('.inspection-back')).toBeVisible();
	await expect(entry.locator('[data-face-label="Front"] .card')).toBeVisible();
	await expect(entry.locator('.card[data-face="back"]')).toHaveCount(0);
	await entry.getByRole('button', { name: 'Text version', exact: true }).click();
	await expect(entry.locator('.card[data-face="back"]')).toBeVisible();
	await expect(entry.locator('.inspection-back')).toHaveCount(0);
});

test('keeps successful cards visible through failed prepared gallery card and media/ranking retries', async ({ page }) => {
	const fixture = await routeHistoricalFixture(page, 2020, { failedChunk: 'F01', corruptChunk: 'F02', mediaFailure: true, rankingsFailure: true });
	await openStoryByName(page, 'Cards/Eras', '2020s');
	const gallery = page.locator('.historical-gallery');
	await expect(gallery.locator('[data-franchise-id]')).toHaveCount(30, { timeout: 120000 });
	await expect(gallery.locator('[data-franchise-id="F00"]').getByText('No eligible historical season in 2020s', { exact: true })).toBeVisible();
	await expect(gallery.locator('[data-franchise-id="F01"]').getByRole('button', { name: 'Retry historical season', exact: true })).toBeVisible();
	await expect(gallery.locator('[data-franchise-id="F02"]').getByRole('button', { name: 'Retry historical season', exact: true })).toBeVisible();
	await expect(gallery.locator('[data-franchise-id="F03"] [data-face-label="Front"] .card')).toBeVisible();
	await expect(gallery.getByText(/Historical media unavailable|Historical WAR rankings unavailable/)).toBeVisible();
	fixture.recoverChunks();
	await gallery.locator('[data-franchise-id="F01"]').getByRole('button', { name: 'Retry historical season', exact: true }).click();
	await expect(gallery.locator('[data-franchise-id="F01"] [data-face-label="Front"] .card')).toBeVisible();
	await expect(gallery.locator('[data-franchise-id="F02"] [data-face-label="Front"] .card')).toBeVisible();
	fixture.recover();
	await gallery.getByRole('button', { name: 'Retry media and rankings', exact: true }).click();
	await expect(gallery.getByText(/Historical media unavailable|Historical WAR rankings unavailable/)).toHaveCount(0);
});

test('keeps the document within the viewport at responsive widths', async ({ page }) => {
	await routeHistoricalFixture(page, 2020);
	await openStoryByName(page, 'Cards/Eras', '2020s');
	const gallery = page.locator('.historical-gallery');
	await expect(gallery.locator('[data-franchise-id]')).toHaveCount(30, { timeout: 120000 });
	for (const width of [320, 402, 559, 560, 820, 1024, 1440, 1720]) {
		await page.setViewportSize({ width, height: 900 });
		await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
		const pair = gallery.locator('.gallery-entry[data-season-id]').first().locator('.card-pair');
		await expect(pair.locator('.card-face:not(.compact-face)')).toHaveCount(2);
		await expect(pair.locator('[data-face-label="Compact"] .card')).toHaveJSProperty('clientWidth', 72);
		const layout = await gallery.evaluate(root => {
			const entries = [...root.querySelectorAll('.gallery-entry')].slice(0, 2).map(node => node.getBoundingClientRect());
			const faces = [...root.querySelector('.card-pair')!.querySelectorAll('.card-face')].map(node => node.getBoundingClientRect());
			return { width: root.clientWidth, sameRow: Math.abs(entries[0]!.top - entries[1]!.top) < 1, pairedRow: Math.abs(faces[0]!.top - faces[1]!.top) < 1 };
		});
		expect(layout.sameRow).toBe(layout.width >= 1024);
		expect(layout.pairedRow).toBe(layout.width >= 560);
	}
	await expect(gallery.locator('.card-pair').first()).toBeVisible();
});

test('reserves equal face slots for present, absent, and failed seasons at each dial size', async ({ page }) => {
	await routeHistoricalFixture(page, 1950, { failedChunk: 'F02' });
	await page.setViewportSize({ width: 1212, height: 788 });
	await openStoryByName(page, 'Cards/Eras', '1950s');
	const gallery = page.locator('.historical-gallery');
	await expect(gallery.locator('[data-franchise-id="F02"]').getByRole('button', { name: 'Retry historical season', exact: true })).toBeVisible();
	for (const dial of [null, 'Home', 'End']) {
		if (dial) {
			await page.getByRole('button', { name: 'DialKit', exact: true }).click();
			await page.getByRole('slider', { name: 'Card Width', exact: true }).press(dial);
			await page.getByRole('button', { name: 'DialKit', exact: true }).click();
		}
		for (const width of [1212, 320]) {
			await page.setViewportSize({ width, height: 788 });
			const entries = await gallery.evaluate(root => ['F00', 'F01', 'F02', 'F03'].map(id => {
				const entry = root.querySelector(`[data-franchise-id="${id}"]`)!;
				const faces = [...entry.querySelectorAll('.card-face:not(.compact-face)')].map(face => {
					const box = face.querySelector('.card, .status-panel')!.getBoundingClientRect();
					return { top: box.top - entry.getBoundingClientRect().top, width: box.width, height: box.height };
				});
				return faces;
			}));
			for (const [index, faces] of entries.entries()) {
				for (const face of faces) {
					expect(face.width).toBeCloseTo(entries[1]![0]!.width, 0);
					expect(face.height).toBeCloseTo(entries[1]![0]!.height, 0);
					expect(face.height / face.width).toBeCloseTo(7 / 5, 2);
				}
				if (width === 1212) {
					expect(faces[0]!.top).toBeCloseTo(entries[index % 2 === 0 ? index + 1 : index - 1]![0]!.top, 0);
				}
			}
			const reverse = gallery.locator('[data-franchise-id="F01"] [data-face-label="Back"]');
			const card = await reverse.locator('.card').boundingBox();
			const toggle = await reverse.getByRole('button', { name: 'Text version', exact: true }).boundingBox();
			expect(toggle!.y).toBeGreaterThanOrEqual(card!.y + card!.height);
			await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
		}
	}
});
