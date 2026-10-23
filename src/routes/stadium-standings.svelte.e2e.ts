import { expect, test } from '@playwright/test';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../lib/game/draft.ts';
import { storeReplay } from '../lib/game/share.ts';
import { SLOTS, type Draft, type Manifest } from '../lib/game/types.ts';
import { currentManifest, deviceRows, writeDeviceDraft } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180_000);

function completeDraft(manifest: Manifest, stadium: string): Draft {
	for (let seed = 401; seed < 451; seed++) {
		try {
			let draft = selectHomeStadium(createDraft(manifest, seed), manifest, stadium);
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

test('a finished Classic season places among every run at its park, which the stadium deck and My teams then show', async ({ page, request, baseURL }) => {
	const manifest = await currentManifest(request);
	// A park no other browser test drafts at, so this test's runs are the park's only ones.
	const park = manifest.stadiums[11];
	const draft = completeDraft(manifest, park.ref.id);
	const origin = baseURL!;
	const { id } = await storeReplay(draft, origin, (input, init) => fetch(input, { ...init, headers: { ...init?.headers, origin } }));
	// Eleven other devices played the same park, from 60 to 160 wins.
	for (let n = 0; n < 11; n++) {
		const response = await request.post('/api/stadiums', {
			headers: { origin, 'cf-connecting-ip': `203.0.113.${40 + n}` },
			data: { replayId: id, token: `parkrun${String(n).padStart(15, '0')}`, wins: 60 + 10 * n }
		});
		expect(response.ok()).toBe(true);
	}

	await page.goto('/');
	await writeDeviceDraft(page, JSON.stringify({ ...draft, phase: 'lineup' }));
	await page.goto('/classic');
	await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
	await expect(page.locator('#results-heading')).toBeVisible({ timeout: 60_000 });
	const wins = Number((await page.locator('#results-heading').getAttribute('aria-label'))!.match(/(\d+) wins/)![1]);
	const better = Array.from({ length: 11 }, (_, n) => 60 + 10 * n).filter(other => other > wins).length;
	const topPercent = Math.ceil(100 * (better + 1) / 12);
	const standings = page.getByRole('region', { name: `Standings at ${park.name}` });
	await expect(standings.locator('.summary')).toHaveText(`${topPercent <= 50 ? `Top ${topPercent}%` : `#${better + 1}`} of 12 runs at ${park.name}`);
	await expect(standings.getByRole('img')).toHaveAccessibleName(new RegExp(`^Runs at ${park.name}: 12 runs from \\d+ to \\d+ wins; your ${wins} wins are marked$`));
	// Pointing at a bin reads it out.
	await standings.locator('.column').first().hover();
	await expect(standings.locator('.readout')).toHaveText(/^\d+–\d+ wins: 1 run$/);
	// The device's own season counted once alongside the others.
	const summary = await (await request.get(`/api/stadiums/${park.ref.id}`)).json() as { total: number };
	expect(summary.total).toBe(12);

	await page.goto('/?build=1');
	const card = page.locator('.choice-wrap').filter({ hasText: park.name });
	await expect(card.locator('.park-record')).toHaveText(/^Typical \d+ WTop 10% \d+\+ W$/);

	await page.goto('/seasons');
	const records = page.getByRole('region', { name: 'Your records' });
	await expect(records.locator('dd').first()).toHaveText('1');
	await expect(records.locator('dd').nth(1)).toHaveText(`${wins}–${162 - wins}`);
	expect(await deviceRows(page, 'SELECT COUNT(*) AS n FROM seasons')).toEqual([{ n: 1 }]);
});
