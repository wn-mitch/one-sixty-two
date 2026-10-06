import { expect, test, type Page } from '@playwright/test';
import { SLOTS, type Slot } from '../lib/game/types.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180000);

async function settlePool(page: Page) {
	await expect(page.locator('.player-card').first()).toBeVisible();
	// The grid re-sorts once composite WAR/162 arrives, so wait before targeting
	// a card the browser might move.
	await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
}

async function pickFirstSeason(page: Page) {
	await settlePool(page);
	const occupied = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).picks.map((pick: { slot: Slot }) => pick.slot)) as Slot[];
	for (const slot of SLOTS.filter(slot => !occupied.includes(slot))) {
		const filter = page.locator('.filters').getByRole('button', { name: slot, exact: true });
		if (!await filter.count()) continue;
		await filter.click();
		while (true) {
			const card = page.locator('.candidate-card').filter({ hasNot: page.getByRole('group', { name: 'Available now', exact: true }).getByText('None', { exact: true }) }).first();
			if (await card.count()) {
				await card.getByRole('button', { name: /^Choose \d{4}$/ }).click();
				await page.locator('.slot-choice input[type="radio"]').first().check();
				await page.getByRole('button', { name: /^Draft player at / }).click();
				return;
			}
			const next = page.getByRole('navigation', { name: 'Player card pages' }).getByRole('button', { name: 'Next', exact: true });
			if (!await next.count() || !await next.isEnabled()) break;
			await next.click();
		}
	}
	throw new Error('The roll had no visible legal exact season under an open-position filter');
}

async function finishRoster(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: /Start draft/ }).click();
	await expect(page.locator('.player-card').first()).toBeVisible();
	for (let index = 0; index < 14; index++) {
		await pickFirstSeason(page);
		if (index < 13) await page.getByRole('button', { name: /Roll next franchise/ }).click();
	}
}

test('keeps the slot choice and draft action reachable after choosing a season', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Start draft/ }).click();
	await settlePool(page);
	const card = page.locator('.candidate-card').filter({ hasNot: page.getByRole('group', { name: 'Available now', exact: true }).getByText('None', { exact: true }) }).first();
	await card.getByRole('button', { name: /^Choose \d{4}$/ }).click();
	// The selected season must not push its own slot radios and Draft button below the fold.
	const visibleWithoutScroll = await page.evaluate(() => {
		const choice = document.querySelector('.assignment-dock .slot-choice') ?? document.querySelector('.slot-choice');
		const draft = document.querySelector('.assignment-dock button[class*="primary"]') ?? Array.from(document.querySelectorAll('button')).find(button => /^Draft player at /.test(button.textContent ?? ''));
		if (!choice || !draft) return { found: false };
		const choiceBox = choice.getBoundingClientRect();
		const draftBox = draft.getBoundingClientRect();
		return {
			found: true,
			choiceVisible: choiceBox.top >= 0 && choiceBox.bottom <= innerHeight,
			draftVisible: draftBox.top >= 0 && draftBox.bottom <= innerHeight
		};
	});
	expect(visibleWithoutScroll).toEqual({ found: true, choiceVisible: true, draftVisible: true });
	await page.locator('.slot-choice input[type="radio"]').first().check();
	await page.getByRole('button', { name: /^Draft player at / }).click();
	await expect(page.getByRole('button', { name: /Roll next franchise/ })).toBeVisible();
});

test('resumes its exact roll, finishes a roster, and recomputes every shared score', async ({ page, context }) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto('/');
	await page.getByRole('button', { name: /Start draft/ }).click();
	await expect(page.locator('.player-card').first()).toBeVisible();
	await expect(page.getByRole('searchbox', { name: 'Find your pick' })).toBeFocused();
	const savedRoll = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).currentRoll);
	await page.reload();
	await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
	await expect(page.locator('.player-card').first()).toBeVisible();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).currentRoll)).toEqual(savedRoll);
	for (let index = 0; index < 14; index++) {
		await pickFirstSeason(page);
		if (index < 13) await page.getByRole('button', { name: /Roll next franchise/ }).click();
	}
	// One franchise can be drafted only once per roster.
	const franchises: string[] = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).picks.map((pick: { franchiseId: string }) => pick.franchiseId));
	expect(new Set(franchises).size).toBe(14);
	await expect(page.getByRole('button', { name: 'Simulate 162 games', exact: true })).toBeEnabled();
	const before = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).battingOrder);
	await page.getByRole('button', { name: /down in batting order/ }).first().click();
	const after = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).battingOrder);
	expect(after[0]).toBe(before[1]);
	expect(after[1]).toBe(before[0]);
	await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
	const games = page.getByRole('region', { name: 'All 162 games', exact: true });
	await expect(games.locator('details')).toHaveCount(162);
	const moments = page.getByRole('region', { name: 'Season turning points', exact: true });
	await expect(moments.getByRole('heading', { name: 'Season turning points', exact: true })).toBeVisible();
	await expect(moments.getByText('Season highlight', { exact: true })).toBeVisible();
	await expect(moments.getByText('Season lowlight', { exact: true })).toBeVisible();
	await expect(moments.locator('.moment-card .empty')).toHaveCount(0);
	await expect(moments.locator('.moment-card .story')).toHaveCount(2);
	await expect(moments.getByText('Estimated neutral league-rate win expectancy', { exact: true })).toHaveCount(2);
	const momentCopy = await moments.locator('.moment-card').allTextContents();
	for (const copy of momentCopy) {
		expect(copy).toMatch(/Game \d+/);
		expect(copy).toMatch(/\d+\.\d% → \d+\.\d%/);
		expect(copy).toMatch(/[+−]\d+\.\d pp/);
	}
	const scores = await games.locator('details > summary .score').allTextContents();
	await games.locator('details > summary').first().click();
	await expect(games.locator('details').first().getByRole('table').first()).toBeVisible();
	const uploadResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/replays' && response.request().method() === 'POST');
	await page.getByRole('button', { name: 'Share result', exact: true }).click();
	const uploaded = await uploadResponse;
	expect(uploaded.status()).toBe(201);
	const field = page.getByRole('textbox', { name: 'Replay link', exact: true });
	await expect(field).toHaveValue(/\/r\/[A-Za-z0-9_-]{22}$/);
	const url = await field.inputValue();
	expect(new URL(url).origin).toBe(new URL(page.url()).origin);
	expect(url.length).toBeLessThan(100);
	// The stored replay must survive a fresh HTTP read, not just the upload response.
	const stored = await page.request.get(`/api/replays/${url.split('/').pop()}`);
	expect(stored.status()).toBe(200);
	const replay = await context.newPage();
	await replay.goto(url);
	const replayGames = replay.getByRole('region', { name: 'All 162 games', exact: true });
	await expect(replayGames.locator('details')).toHaveCount(162);
	const replayMoments = replay.getByRole('region', { name: 'Season turning points', exact: true });
	await expect(replayMoments.locator('.moment-card .story')).toHaveCount(2);
	expect(await replayMoments.locator('.moment-card').allTextContents()).toEqual(momentCopy);
	expect(await replayGames.locator('details > summary .score').allTextContents()).toEqual(scores);
	const replayUrl = replay.url();
	for (const [name, id] of [['Batting', 'batting-heading'], ['Pitching', 'pitching-heading'], ['All 162 games', 'game-log-heading']]) {
		await replay.getByRole('button', { name, exact: true }).click();
		expect(replay.url()).toBe(replayUrl);
		await expect(replay.locator(`#${id}`)).toBeFocused();
	}
	await replay.reload();
	await expect(replayGames.locator('details')).toHaveCount(162);
	expect(await replayGames.locator('details > summary .score').allTextContents()).toEqual(scores);
	expect(errors).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await replay.close();
});

test('starts a clean draft from a replay link without touching the local save', async ({ page }) => {
	await finishRoster(page);
	await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
	await expect(page.getByRole('region', { name: 'All 162 games', exact: true }).locator('details')).toHaveCount(162);
	const local = await page.evaluate(() => localStorage.getItem('162-zero:v1'));
	await page.getByRole('button', { name: 'Share result', exact: true }).click();
	const field = page.getByRole('textbox', { name: 'Replay link', exact: true });
	await expect(field).toHaveValue(/\/r\/[A-Za-z0-9_-]{22}$/);
	const shared = await field.inputValue();
	await page.goto(shared);
	await page.getByRole('button', { name: 'New draft', exact: true }).click();
	await expect(page).toHaveURL(/\/\?new=1$/);
	await expect(page.locator('.player-card').first()).toBeVisible();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).picks.length)).toBe(0);
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).schemaVersion)).toBe(3);
	expect(local).not.toBeNull();
});

test('rejects invalid replay uploads and unknown replay ids', async ({ request }) => {
	const notJson = await request.post('/api/replays', { headers: { 'content-type': 'application/json' }, data: 'not json' });
	expect(notJson.status()).toBe(400);
	const current = await (await request.get('/data/current.json')).json() as { dataVersion: string };
	const envelope = { schemaVersion: 3, modelVersion: 'pa-v2', seed: 1, actions: [], picks: [], battingOrder: [], starterOrder: [] };
	const wrongDataset = await request.post('/api/replays', { data: { ...envelope, dataVersion: 'f'.repeat(64) } });
	expect(wrongDataset.status()).toBe(409);
	// A structurally incomplete but version-compatible snapshot is invalid, not incompatible.
	const incomplete = await request.post('/api/replays', { data: { ...envelope, dataVersion: current.dataVersion } });
	expect(incomplete.status()).toBe(400);
	const missing = await request.get('/api/replays/aaaaaaaaaaaaaaaaaaaaaa');
	expect(missing.status()).toBe(404);
	const badId = await request.get('/api/replays/short');
	expect(badId.status()).toBe(404);
	const wrongMethod = await request.get('/api/replays');
	expect(wrongMethod.status()).toBe(405);
});

test('retries a failed chunk without rerolling the committed draft', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Start draft/ })).toBeEnabled();
	let aborted = false;
	await page.route('**/data/**/*.json', route => {
		const url = new URL(route.request().url());
		const isChunk = /\/[^/]+-\d{4}\.json$/.test(url.pathname);
		if (isChunk && !aborted) { aborted = true; return route.abort(); }
		return route.continue();
	});
	await page.getByRole('button', { name: /Start draft/ }).click();
	await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
	const committed = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).currentRoll);
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.locator('.player-card').first()).toBeVisible();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).currentRoll)).toEqual(committed);
	expect(aborted).toBe(true);
});

test('preserves incompatible saved bytes until an explicit new draft', async ({ page }) => {
	await page.addInitScript(() => {
		if (!localStorage.getItem('162-zero:v1')) localStorage.setItem('162-zero:v1', '{"schemaVersion":0}');
	});
	await page.goto('/');
	await expect(page.getByRole('alert')).toContainText('Saved draft is incompatible');
	expect(await page.evaluate(() => localStorage.getItem('162-zero:v1'))).toBe('{"schemaVersion":0}');
	await page.getByRole('button', { name: 'Start new draft', exact: true }).click();
	await expect(page.locator('.player-card').first()).toBeVisible();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).schemaVersion)).toBe(3);
});

test('permits in-memory play when storage is blocked', async ({ page }) => {
	await page.goto('/');
	await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
	await page.goto('/');
	await expect(page.getByText('Resume unavailable: browser storage is blocked. You can still play.')).toBeVisible();
	await page.getByRole('button', { name: /Start draft/ }).click();
	await expect(page.locator('.player-card').first()).toBeVisible();
});

test('reports a missing replay link instead of an unhandled failure', async ({ page }) => {
	await page.goto('/r/aaaaaaaaaaaaaaaaaaaaaa');
	await expect(page.getByRole('alert')).toContainText('Replay not found');
});

test('still rejects a malformed historical fragment replay', async ({ page }) => {
	await page.goto('/#replay=invalid!');
	await expect(page.getByRole('alert')).toContainText('Invalid replay link');
});

for (const invalid of ['empty', 'wrong-roll']) {
	test(`recovers a ${invalid} chunk through Retry without changing the roll`, async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('button', { name: /Start draft/ })).toBeEnabled();
		let intercepted = 0;
		await page.route('**/data/**/*.json', route => {
			if (/\/[^/]+-\d{4}\.json$/.test(new URL(route.request().url()).pathname)) {
				intercepted++;
				if (intercepted === 1) return route.fulfill({ contentType: 'application/json', body: invalid === 'empty' ? '[]' : '[{"franchiseId":"invalid","year":2025}]' });
			}
			return route.continue();
		});
		await page.getByRole('button', { name: /Start draft/ }).click();
		await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({ timeout: 5000 });
		const committed = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).currentRoll);
		await page.getByRole('button', { name: 'Retry', exact: true }).click();
		await expect(page.locator('.player-card').first()).toBeVisible({ timeout: 5000 });
		expect(intercepted).toBe(2);
		expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).currentRoll)).toEqual(committed);
	});
}

test('route teardown cancels resumed hydration without overwriting a completed save', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Start draft/ }).click();
	for (let index = 0; index < 14; index++) {
		await pickFirstSeason(page);
		if (index < 13) await page.getByRole('button', { name: /Roll next franchise/ }).click();
	}
	await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
	await expect(page.getByRole('region', { name: 'All 162 games', exact: true }).locator('details')).toHaveCount(162);
	const completed = await page.evaluate(() => localStorage.getItem('162-zero:v1'));
	await page.reload();
	const gate = Promise.withResolvers<void>();
	const paused = Promise.withResolvers<void>();
	let chunkUrl = '';
	await page.route('**/data/**/*.json', async route => {
		if (!chunkUrl && /\/[^/]+-\d{4}\.json$/.test(new URL(route.request().url()).pathname)) {
			chunkUrl = route.request().url();
			paused.resolve();
			await gate.promise;
		}
		await route.continue();
	});
	await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
	await paused.promise;
	await page.getByRole('link', { name: 'Rules & model', exact: true }).click();
	await expect(page).toHaveURL(/\/about$/);
	gate.resolve();
	await page.waitForLoadState('networkidle');
	expect(await page.evaluate(() => localStorage.getItem('162-zero:v1')) === completed).toBe(true);
});
