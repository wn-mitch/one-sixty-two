import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page, TestInfo } from '@playwright/test';
import { TEST_SHARE_CAPTURE_TOKEN } from '../../scripts/test-capture-contract.ts';
import { availableCandidates, legalSlots, replayInput } from '../lib/game/draft.ts';
import type { Draft, Slot } from '../lib/game/types.ts';
import { SHARE_DIMENSIONS, SHARE_FORMATS } from '../lib/share/types.ts';
import type { ShareFormat, SharePublication } from '../lib/share/types.ts';
import { currentManifest, currentMedia, STORAGE_KEY } from './draft-test-fixtures.ts';
import { verifyResultsInspection } from './results-test-assertions.ts';
import { imagePixelDigest } from './image-test-helpers.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(300000);

function pngDimensions(bytes: Buffer): { width: number; height: number } {
	expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function captureTrustedArtwork(
	context: BrowserContext,
	origin: string,
	modelDigest: string,
	format: ShareFormat
): Promise<Buffer> {
	const dimensions = SHARE_DIMENSIONS[format];
	const capture = await context.newPage();
	try {
		await capture.setViewportSize(dimensions);
		await capture.setExtraHTTPHeaders({ 'x-share-capture-token': TEST_SHARE_CAPTURE_TOKEN });
		const response = await capture.goto(`${origin}/__share/${modelDigest}/${format}`, { waitUntil: 'networkidle' });
		expect(response?.status()).toBe(200);
		const artwork = capture.locator(`[data-share-artwork][data-share-format="${format}"]`);
		await expect(artwork).toHaveAttribute('data-share-ready', 'true');
		const readiness = await artwork.evaluate((root, expectedCards) => {
			const images = [...root.querySelectorAll<HTMLImageElement>('img')];
			const cards = [...root.querySelectorAll<HTMLElement>('[data-card]')];
			const bounds = root.getBoundingClientRect();
			return {
				width: bounds.width,
				height: bounds.height,
				hydrated: root.dataset.shareHydrated,
				state: root.dataset.shareState,
				imageCount: images.length,
				imagesReady: images.every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
				cardsReady: cards.length >= expectedCards && cards.every(card => card.dataset.fitState === 'settled'),
				overflow: Boolean(root.querySelector('[data-overflow="1"], [data-fit-state="failed"]')) ||
					root.scrollWidth > Math.ceil(bounds.width) || root.scrollHeight > Math.ceil(bounds.height),
				fontsLoaded: document.fonts.status === 'loaded' &&
					[...document.fonts].every(face => face.status !== 'error'),
				fontResources: performance.getEntriesByType('resource')
					.filter(entry => entry.name.includes('/fonts/')).length
			};
		}, format === 'wide' ? 9 : 14);
		expect(readiness).toEqual({
			width: dimensions.width,
			height: dimensions.height,
			hydrated: 'true',
			state: 'ready',
			imageCount: expect.any(Number),
			imagesReady: true,
			cardsReady: true,
			overflow: false,
			fontsLoaded: true,
			fontResources: expect.any(Number)
		});
		expect(readiness.imageCount).toBeGreaterThan(0);
		expect(readiness.fontResources).toBeGreaterThan(0);
		const png = await artwork.screenshot({ type: 'png' });
		expect(pngDimensions(png)).toEqual(dimensions);
		return png;
	} finally {
		await capture.close();
	}
}

async function verifyPublication(
	request: APIRequestContext,
	context: BrowserContext,
	origin: string,
	publication: SharePublication,
	testInfo: TestInfo
): Promise<void> {
	const captureMismatches: string[] = [];
	for (const format of SHARE_FORMATS) {
		const expected = SHARE_DIMENSIONS[format];
		const image = publication.images[format];
		expect(image).toMatchObject(expected);
		const response = await request.get(image.url);
		expect(response.status()).toBe(200);
		expect(response.headers()).toMatchObject({
			'cache-control': 'public, max-age=31536000, immutable',
			'content-type': 'image/png',
			'etag': `\"${image.sha256}\"`,
			'x-content-type-options': 'nosniff',
			'x-image-width': String(expected.width),
			'x-image-height': String(expected.height)
		});
		const bytes = await response.body();
		expect(Number(response.headers()['content-length'])).toBe(bytes.byteLength);
		expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
		expect(pngDimensions(bytes)).toEqual(expected);
		const notModified = await request.get(image.url, { headers: { 'if-none-match': `\"${image.sha256}\"` } });
		expect(notModified.status()).toBe(304);

		const first = await captureTrustedArtwork(context, origin, publication.modelDigest, format);
		const second = await captureTrustedArtwork(context, origin, publication.modelDigest, format);
		if (!second.equals(first)) {
			const firstPath = testInfo.outputPath(`share-${format}-first.png`);
			const secondPath = testInfo.outputPath(`share-${format}-second.png`);
			await Promise.all([writeFile(firstPath, first), writeFile(secondPath, second)]);
			await testInfo.attach(`share-${format}-first.png`, { path: firstPath, contentType: 'image/png' });
			await testInfo.attach(`share-${format}-second.png`, { path: secondPath, contentType: 'image/png' });
			const firstHash = createHash('sha256').update(first).digest('hex');
			const secondHash = createHash('sha256').update(second).digest('hex');
			captureMismatches.push(`${format}: ${firstHash} !== ${secondHash}`);
		}
	}
	const missingFonts = await context.newPage();
	try {
		await missingFonts.setViewportSize(SHARE_DIMENSIONS.scorecard);
		await missingFonts.setExtraHTTPHeaders({ 'x-share-capture-token': TEST_SHARE_CAPTURE_TOKEN });
		await missingFonts.route('**/fonts/**', route => route.fulfill({ status: 503, body: 'Font unavailable' }));
		await missingFonts.goto(`${origin}/__share/${publication.modelDigest}/scorecard`, { waitUntil: 'networkidle' });
		const artwork = missingFonts.locator('[data-share-artwork]');
		await expect(artwork).toHaveAttribute('data-share-state', 'failed');
		await expect(artwork).toHaveAttribute('data-share-failure', 'A required share font failed to load');
		await expect(artwork).toBeHidden();
	} finally {
		await missingFonts.close();
	}

	const crawler = await request.get(publication.replayUrl, { headers: { 'user-agent': 'browser-suite-crawler' } });
	expect(crawler.status()).toBe(200);
	const html = await crawler.text();
	const { wins, losses, firstLoss, longestWinningStreak } = publication.record;
	expect(html).toContain(`<title>${wins}-${losses} season | 162-0</title>`);
	expect(html).toContain(`property=\"og:url\" content=\"${publication.replayUrl}\"`);
	expect(html).toContain(`property=\"og:image\" content=\"${publication.images.wide.url}\"`);
	expect(html).toContain('property=\"og:image:width\" content=\"1200\"');
	expect(html).toContain('property=\"og:image:height\" content=\"630\"');
	expect(html).toContain('name=\"twitter:card\" content=\"summary_large_image\"');
	expect(html).toContain(firstLoss === null ? 'No losses.' : `First loss: Game ${firstLoss}.`);
	expect(html).toContain(`Longest winning streak: ${longestWinningStreak} ${longestWinningStreak === 1 ? 'game' : 'games'}.`);
	expect(
		captureMismatches,
		`Share artwork was not byte-deterministic:\n${captureMismatches.join('\n')}`
	).toEqual([]);
}

async function settlePool(page: Page) {
	await expect(page.locator('.player-card').first()).toBeVisible();
	// The grid re-sorts once composite WAR/162 arrives, so wait before targeting
	// a card the browser might move.
	await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
}

async function firstLegalSeason(page: Page, request: APIRequestContext): Promise<{ seasonId: string; playerId: string; displayName: string; slot: Slot }> {
	const manifest = await currentManifest(request);
	const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
	const candidate = availableCandidates(saved, manifest).find(item => legalSlots(saved, item, manifest).length > 0);
	if (!candidate) throw new Error('The roll had no legal candidate in the current live manifest');
	const response = await request.get(manifest.chunks[`${candidate.franchiseId}-${candidate.decade}`]);
	expect(response.ok()).toBe(true);
	const profiles = await response.json() as Array<{ seasonId: string; playerId: string; displayName: string }>;
	const profile = profiles.find(item => item.seasonId === candidate.seasonId);
	if (!profile) throw new Error('The legal live candidate is absent from its current-roll chunk');
	return { ...profile, slot: legalSlots(saved, candidate, manifest)[0] };
}

async function selectExactSeason(page: Page, request: APIRequestContext) {
	await settlePool(page);
	const target = await firstLegalSeason(page, request);
	const search = page.getByRole('searchbox', { name: 'Find your pick' });
	await search.fill(target.displayName);
	const group = page.locator(`.candidate-card[data-candidate-group="${target.playerId}"]`);
	await expect(group).toHaveCount(1);
	await group.getByRole('button', { name: /^Select / }).first().click();
	const sheet = page.locator('dialog.draft-sheet[open]');
	await expect(sheet).toBeVisible();
	await sheet.getByRole('combobox', { name: `Exact season for ${target.displayName}`, exact: true }).selectOption(target.seasonId);
	return { target, sheet };
}

async function pickFirstSeason(page: Page, request: APIRequestContext) {
	const { target, sheet } = await selectExactSeason(page, request);
	const destination = sheet.locator(`[data-slot="${target.slot}"]`);
	await expect(destination).toBeEnabled();
	await destination.click();
	const confirmation = sheet.locator('.pick-confirmation');
	await expect(confirmation).toHaveAttribute('data-selected-season', target.seasonId);
	await expect(confirmation).toHaveAttribute('data-pending-slot', target.slot);
	await sheet.getByRole('button', { name: `Draft at ${target.slot}`, exact: true }).click();
}


async function finishRoster(page: Page, request: APIRequestContext) {
	await page.goto('/');
	await page.getByRole('button', { name: /Start draft/ }).click();
	await expect(page.locator('.player-card').first()).toBeVisible();
	for (let index = 0; index < 14; index++) {
		await pickFirstSeason(page, request);
		if (index < 13) await page.getByRole('button', { name: /Roll next franchise/ }).click();
	}
}

test('renders complete decodable franchise marks without substituting a wordmark', async ({ page, request }) => {
	const media = await currentMedia(request);
	expect(Object.values(media.teams).filter(team => team.logo === null)).toEqual([]);
	expect(media.teams.TOR.logo!.height / media.teams.TOR.logo!.width).toBeGreaterThan(.5);
	await page.goto('/');
	const marks = page.getByRole('region', { name: 'All 30 franchises', exact: true })
		.locator('.logo-copy[data-marquee-copy] .team-mark img');
	await expect(marks).toHaveCount(30);
	for (const mark of await marks.all()) {
		await mark.scrollIntoViewIfNeeded();
		await expect.poll(() => mark.evaluate(async node => {
			const image = node as HTMLImageElement;
			await image.decode();
			const tile = image.parentElement!;
			const box = image.getBoundingClientRect();
			const bounds = tile.getBoundingClientRect();
			return image.naturalWidth > 0 && image.naturalHeight > 0 &&
				box.left >= bounds.left && box.right <= bounds.right &&
				box.top >= bounds.top && box.bottom <= bounds.bottom;
		})).toBe(true);
	}
});

test('keeps the slot choice and draft action reachable after choosing a season', async ({ page, request }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Start draft/ }).click();
	const { target, sheet } = await selectExactSeason(page, request);
	await sheet.locator(`[data-slot="${target.slot}"]`).click();
	const confirmation = sheet.locator('.pick-confirmation');
	const draftButton = confirmation.getByRole('button', { name: `Draft at ${target.slot}`, exact: true });
	await expect(confirmation).toBeVisible();
	await expect(draftButton).toBeVisible();
	const reachability = await draftButton.evaluate(button => {
		const box = button.getBoundingClientRect();
		return { bottom: box.bottom, viewport: innerHeight, visible: box.top >= 0 && box.bottom <= innerHeight };
	});
	expect(reachability.visible).toBe(true);
	expect(reachability.bottom).toBeLessThanOrEqual(reachability.viewport);
	await draftButton.click();
	await expect(page.getByRole('button', { name: /Roll next franchise/ })).toBeVisible();
});


test('resumes its exact roll, finishes a roster, and recomputes every shared score', async ({ page, context, request }, testInfo) => {
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
		await pickFirstSeason(page, request);
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
	const startersBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).starterOrder);
	await page.getByRole('button', { name: /down in starting rotation/ }).first().click();
	const startersAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).starterOrder);
	expect(startersAfter).toEqual([startersBefore[1], startersBefore[0], startersBefore[2]]);
	await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
	const games = page.getByRole('region', { name: 'All 162 games', exact: true });
	await expect(games.locator('details')).toHaveCount(162);
	await verifyResultsInspection(page);
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
	const uploadResponse = page.waitForResponse(response =>
		new URL(response.url()).pathname === '/api/replays' && response.request().method() === 'POST'
	);
	const publicationResponse = page.waitForResponse(response =>
		/^\/api\/replays\/[A-Za-z0-9_-]{22}\/share$/.test(new URL(response.url()).pathname) &&
		response.request().method() === 'POST'
	);
	await page.getByRole('button', { name: 'Copy link', exact: true }).first().click();
	const [uploaded, published] = await Promise.all([uploadResponse, publicationResponse]);
	expect(uploaded.status()).toBe(201);
	expect(published.status()).toBe(200);
	const publication = await published.json() as SharePublication;
	const field = page.getByRole('textbox', { name: 'Replay link', exact: true });
	await expect(field).toHaveValue(/\/r\/[A-Za-z0-9_-]{22}$/);
	const url = await field.inputValue();
	const origin = new URL(page.url()).origin;
	expect(new URL(url).origin).toBe(origin);
	expect(url.length).toBeLessThan(100);
	expect(publication.replayUrl).toBe(url);
	await expect(page.getByText(`Published PNG · ${SHARE_DIMENSIONS.scorecard.width}×${SHARE_DIMENSIONS.scorecard.height}`, { exact: true })).toBeVisible();
	await verifyPublication(request, context, origin, publication, testInfo);
	const cachedPublication = await request.get(`/api/replays/${publication.replayId}/share`);
	expect(cachedPublication.status()).toBe(200);
	expect(await cachedPublication.json()).toEqual(publication);
	const sharePanel = page.locator('.share-panel');
	for (const [label, format] of [['Diamond', 'diamond'], ['Wide', 'wide']] as const) {
		await sharePanel.getByRole('button', { name: label, exact: true }).click();
		await expect(sharePanel.locator('.preview img')).toHaveAttribute('src', publication.images[format].url);
		await expect(sharePanel.getByText(
			`Published PNG · ${SHARE_DIMENSIONS[format].width}×${SHARE_DIMENSIONS[format].height}`,
			{ exact: true }
		)).toBeVisible();
	}
	const repeatPreparations: string[] = [];
	page.on('request', browserRequest => {
		if (browserRequest.method() === 'POST' && /\/api\/replays\/[^/]+\/share$/.test(new URL(browserRequest.url()).pathname)) {
			repeatPreparations.push(browserRequest.url());
		}
	});
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
	await sharePanel.getByRole('button', { name: 'Copy image', exact: true }).click();
	await expect(sharePanel.locator('.share-status')).toHaveText('PNG copied.');
	// Clipboard implementations may re-encode PNGs; the displayed image must remain exact.
	const storedPixels = await imagePixelDigest(page, { url: publication.images.wide.url });
	const clipboardPixels = await imagePixelDigest(page, { clipboard: true });
	expect(clipboardPixels).toEqual({ ...SHARE_DIMENSIONS.wide, sha256: storedPixels.sha256 });
	const downloadEvent = page.waitForEvent('download');
	await sharePanel.getByRole('button', { name: 'Download PNG', exact: true }).click();
	const download = await downloadEvent;
	expect(download.suggestedFilename()).toBe(`162-0-${publication.record.wins}-${publication.record.losses}-wide.png`);
	const downloadPath = await download.path();
	if (!downloadPath) throw new Error('The PNG download has no saved file');
	expect(createHash('sha256').update(await readFile(downloadPath)).digest('hex')).toBe(publication.images.wide.sha256);
	await expect(sharePanel.locator('.share-status')).toHaveText('Wide PNG downloaded.');
	expect(repeatPreparations).toEqual([]);
	// The stored replay must survive a fresh HTTP read, not just the upload response.
	const stored = await page.request.get(`/api/replays/${publication.replayId}`);
	expect(stored.status()).toBe(200);
	const replay = await context.newPage();
	await replay.goto(url);
	await expect(replay.locator('#results-heading')).toBeVisible({ timeout: 30_000 });
	const replayGames = replay.getByRole('region', { name: 'All 162 games', exact: true });
	await expect(replayGames.locator('details')).toHaveCount(162);
	const replayMoments = replay.getByRole('region', { name: 'Season turning points', exact: true });
	await expect(replayMoments.locator('.moment-card .story')).toHaveCount(2);
	expect(await replayMoments.locator('.moment-card').allTextContents()).toEqual(momentCopy);
	expect(await replayGames.locator('details > summary .score').allTextContents()).toEqual(scores);
	const replayUrl = replay.url();
	for (const [name, id] of [['Batting totals', 'batting-heading'], ['Pitching totals', 'pitching-heading'], ['All 162 games', 'game-log-heading']]) {
		await replay.getByRole('button', { name, exact: true }).click();
		expect(replay.url()).toBe(replayUrl);
		await expect(replay.locator(`#${id}`)).toBeFocused();
	}
	await replay.reload();
	await expect(replay.locator('#results-heading')).toBeVisible({ timeout: 30_000 });
	await expect(replayGames.locator('details')).toHaveCount(162);
	expect(await replayGames.locator('details > summary .score').allTextContents()).toEqual(scores);
	expect(errors).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await replay.close();
});

test('starts a clean draft from a replay link without touching the local save', async ({ page, request }) => {
	await finishRoster(page, request);
	const local = await page.evaluate(() => localStorage.getItem('162-zero:v1'));
	expect(local).not.toBeNull();
	const draft = JSON.parse(local!) as Draft;
	const stored = await request.post('/api/replays', { data: replayInput(draft) });
	expect(stored.status()).toBe(201);
	const payload = await stored.json() as { id: string; url: string };
	expect(payload.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
	await page.goto(payload.url);
	expect(await page.evaluate(() => localStorage.getItem('162-zero:v1'))).toBe(local);
	await page.getByRole('button', { name: 'New draft', exact: true }).click();
	await expect(page).toHaveURL(/\/\?new=1$/);
	await expect(page.locator('.player-card').first()).toBeVisible();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).picks.length)).toBe(0);
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).schemaVersion)).toBe(4);
});

test('rejects invalid replay uploads and unknown replay ids', async ({ request }) => {
	const notJson = await request.post('/api/replays', { headers: { 'content-type': 'application/json' }, data: 'not json' });
	expect(notJson.status()).toBe(400);
	const current = await (await request.get('/data/current.json')).json() as { dataVersion: string };
	const envelope = { schemaVersion: 4, modelVersion: 'pa-v3', seed: 1, actions: [], picks: [], battingOrder: [], starterOrder: [] };
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
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('162-zero:v1')!).schemaVersion)).toBe(4);
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

test('route teardown cancels resumed hydration without overwriting a completed save', async ({ page, request }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Start draft/ }).click();
	for (let index = 0; index < 14; index++) {
		await pickFirstSeason(page, request);
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

test('keeps the Home copy width when centering on ultrawide screens', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto('/');
	const intro = page.locator('.welcome-copy .intro');
	await expect(intro).toBeVisible();
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
	const readableWidth = await intro.evaluate(node => node.getBoundingClientRect().width);
	await page.setViewportSize({ width: 2560, height: 1440 });
	await expect.poll(() => intro.evaluate(node => node.getBoundingClientRect().width)).toBe(readableWidth);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(2560);
});
