import { expect, test, type APIRequestContext } from '@playwright/test';
import { smartBattingOrder, smartReliefRoles, smartRotation } from '../lib/game/smart-lineup.ts';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../lib/game/draft.ts';
import { publishShare, storeReplay } from '../lib/game/share.ts';
import { SLOTS, type Draft, type Manifest, type Profile } from '../lib/game/types.ts';
import { solidPng } from './image-test-helpers.ts';
import { currentManifest, deviceDraft, expectPool, STORAGE_KEY, writeDeviceDraft } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(300000);

const CHALLENGE_KEY = '162-zero:challenge:v1';

/** A complete draft from the live manifest, taking the first legal candidate each roll. */
function completeDraft(manifest: Manifest, seed: number, stadium: number): Draft {
 for (let attempt = seed; attempt < seed + 50; attempt++) {
  try {
   let draft = selectHomeStadium(createDraft(manifest, attempt), manifest, manifest.stadiums[stadium].ref.id);
   while (draft.picks.length < SLOTS.length) {
    draft = rollDraft(draft, manifest);
    const candidate = availableCandidates(draft, manifest).find(item => legalSlots(draft, item, manifest).length);
    if (!candidate) throw new Error('dead end');
    draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
   }
   return draft;
  } catch { /* try the next seed */ }
 }
 throw new Error('No complete draft within 50 seeds');
}

test('lineup help stays available without changing the batting order or relief roles', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const draft = completeDraft(manifest, 301, 3);
	await page.goto('/');
	await writeDeviceDraft(page, JSON.stringify({ ...draft, phase: 'lineup' }));
	await page.goto('/classic');
	await expect(page.getByRole('heading', { name: 'Set your lineup' })).toBeVisible();
	const before = await deviceDraft<Draft>(page);
	await expect(page.getByRole('tooltip')).toHaveCount(0);

	const battingHelp = page.getByRole('button', { name: 'About Smart lineup', exact: true });
	await battingHelp.focus();
	await expect(page.getByRole('tooltip')).toContainText('three best hitters');
	await expect.poll(() => page.getByRole('tooltip').evaluate(node => {
		const rect = node.getBoundingClientRect();
		return rect.left >= 0 && rect.right <= innerWidth;
	})).toBe(true);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('tooltip')).toHaveCount(0);
	await expect(battingHelp).toBeFocused();
	await battingHelp.press('Enter');
	await expect(page.getByRole('tooltip')).toBeVisible();
	await page.getByRole('heading', { name: 'Relief', exact: true }).click();
	await expect(page.getByRole('tooltip')).toHaveCount(0);

	await page.setViewportSize({ width: 1512, height: 828 });
	await battingHelp.hover();
	await expect(page.getByRole('tooltip')).toBeVisible();
	await page.getByRole('tooltip').hover();
	await expect(page.getByRole('tooltip')).toBeVisible();
	await page.evaluate(() => {
		document.body.tabIndex = -1;
		document.body.focus();
	});
	await page.keyboard.press('Escape');
	await expect(page.getByRole('tooltip')).toHaveCount(0);
	await page.getByRole('heading', { name: 'Batting order', exact: true }).hover();
	const after = await deviceDraft<Draft>(page);
	expect(after.battingOrder).toEqual(before.battingOrder);
	expect(after.reliefRoles).toEqual(before.reliefRoles);
});
async function pickedProfiles(request: APIRequestContext, manifest: Manifest, draft: Draft) {
 const urls = [...new Set(draft.picks.map(pick => {
  const candidate = manifest.candidates.find(item => item.seasonId === pick.seasonId);
  return candidate ? manifest.chunks[`${candidate.franchiseId}-${candidate.decade}`] : undefined;
 }).filter((url): url is string => !!url))];
 const chunks = await Promise.all(urls.map(async url => {
  const response = await request.get(url);
  expect(response.ok()).toBe(true);
  return await response.json() as Profile[];
 }));
 return chunks.flat();
}

test('Smart all persists each existing optimizer recommendation', async ({ page, request }) => {
 const manifest = await currentManifest(request);
 const draft = completeDraft(manifest, 301, 3);
 await page.goto('/');
 await writeDeviceDraft(page, JSON.stringify({ ...draft, phase: 'lineup' }));
 await page.goto('/classic');
 await expect(page.getByRole('heading', { name: 'Set your lineup' })).toBeVisible();
 const before = await deviceDraft<Draft>(page);
 const profiles = await pickedProfiles(request, manifest, before);
 const bySeason = new Map(profiles.map(profile => [profile.seasonId, profile]));
 const bullpen = new Map(before.picks.flatMap(pick => {
  const profile = bySeason.get(pick.seasonId);
  return profile && (pick.slot === 'CL' || pick.slot.startsWith('RP')) ? [[pick.slot, profile] as const] : [];
 }));
 const batting = smartBattingOrder(before.battingOrder, bySeason);
 const starters = smartRotation(before.starterOrder, bySeason);
 const roles = smartReliefRoles(before.reliefRoles, bullpen);
 await page.getByRole('button', { name: 'Smart all', exact: true }).click();
 await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Smart all' })).toBeVisible();
 await expect.poll(async () => (await deviceDraft<Draft>(page)).battingOrder).toEqual(batting);
 const after = await deviceDraft<Draft>(page);
 expect(after.battingOrder).toEqual(batting);
 expect(after.starterOrder).toEqual(starters);
 expect(after.reliefRoles).toEqual(roles);
});

test('lineup uses the site menu and canceling New draft preserves the roster and focus', async ({ page, request }) => {
 const draft = completeDraft(await currentManifest(request), 301, 3);
 await page.goto('/');
 await writeDeviceDraft(page, JSON.stringify({ ...draft, phase: 'lineup' }));
 await page.goto('/classic');
 await expect(page.getByRole('heading', { name: 'Set your lineup' })).toBeVisible();
 const menu = page.getByRole('button', { name: 'Menu', exact: true });
 await expect(menu).toHaveCount(1);
 await menu.click();
 await page.getByRole('button', { name: 'New draft', exact: true }).click();
 const confirmation = page.getByRole('dialog', { name: 'Leave this roster behind?' });
 await expect(confirmation).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(confirmation).toBeHidden();
 await expect(menu).toBeFocused();
 expect((await deviceDraft<Draft>(page)).picks).toEqual(draft.picks);
 await page.getByRole('link', { name: 'Collection', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Collection', exact: true })).toBeVisible();
 await menu.click();
 await expect(page.getByRole('button', { name: 'New draft', exact: true })).toHaveCount(0);
});

/** Stores and publishes a complete challenger season, as Challenge a friend would. */
async function publishChallenger(manifest: Manifest, origin: string) {
 // Browsers send Origin on these POSTs; Node's fetch does not, and the site rejects cross-site posts.
 const sameOrigin: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...init?.headers, origin } });
 const { id } = await storeReplay(completeDraft(manifest, 7, 0), origin, sameOrigin);
 // The record and artwork come from the challenger's browser; any 162-game record is publishable.
 const record = { wins: 101, losses: 61, firstLoss: 2, longestWinningStreak: 11, runsFor: 812, runsAgainst: 640 };
 const png = (width = 1080, height = 1920) => new Blob([new Uint8Array(solidPng(width, height))], { type: 'image/png' });
 return { id, publication: await publishShare(id, origin, record, { field: png(), fan: png(), og: png(1200, 630) }, sameOrigin) };
}

test('a challenge link opens a challenge card, binds the next draft, and offers the series after its season', async ({ page, request, baseURL }) => {
 const origin = baseURL!;
 const manifest = await currentManifest(request);
 const { id, publication } = await publishChallenger(manifest, origin);
 const { wins, losses } = publication.record;

 // Crawlers get challenge metadata with the published link preview.
 const crawler = await request.get(`/c/${id}`);
 expect(crawler.status()).toBe(200);
 const html = await crawler.text();
 expect(html).toContain(`<title>Beat ${wins}-${losses} | 162-0</title>`);
 expect(html).toContain(`property="og:url" content="${origin}/c/${id}"`);
 expect(html).toContain(`property="og:image" content="${publication.images.og.url}"`);

 await page.goto(`/c/${id}`);
 // The challenge card renders after its manifest and replay load, which can take seconds under a busy suite.
 await expect(page.getByRole('heading', { level: 1, name: `Beat ${wins}–${losses}` })).toBeVisible({ timeout: 30_000 });
 await expect(page.getByRole('link', { name: 'See their season', exact: true })).toHaveAttribute('href', `/r/${id}`);
 await page.getByRole('button', { name: 'Draft your team', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Choose your home stadium', exact: true })).toBeVisible();
 const bound = {
  challenge: await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), CHALLENGE_KEY),
  seed: (await deviceDraft(page)).seed
 };
 expect(bound.challenge).toEqual({ replayId: id, wins, losses, seed: bound.seed });

 // Stand in a finished roster for the answering draft (rolls derive from the seed, so the challenge follows it), then play its season.
 const answer = completeDraft(manifest, 301, 3);
 await writeDeviceDraft(page, JSON.stringify({ ...answer, phase: 'lineup' }));
 await page.evaluate(([key, value]) => localStorage.setItem(key, value), [CHALLENGE_KEY, JSON.stringify({ ...bound.challenge, seed: answer.seed })]);
 await page.goto('/');
 await page.getByRole('button', { name: 'Resume my team', exact: true }).click();
 await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
 const offer = page.getByRole('complementary', { name: /They went/ });
 await expect(offer).toBeVisible({ timeout: 60000 });
 await expect(offer).toContainText(`They went ${wins}–${losses}.`);
 const play = offer.getByRole('link', { name: 'Play the best-of-five', exact: true });
 const href = await play.getAttribute('href');
 const params = new URLSearchParams(new URL(href!, origin).hash.slice(1));
 expect(params.get('b')).toBe(`/r/${id}`);
 expect(params.get('a')).toMatch(/^\/#replay=/);

 await play.click();
 await expect(page.getByRole('heading', { level: 1, name: /win 3–[012]$/ })).toBeVisible({ timeout: 240000 });
});

test('a draft in progress can answer the challenge instead of being replaced', async ({ page, request, baseURL }) => {
 const manifest = await currentManifest(request);
 const { id, publication } = await publishChallenger(manifest, baseURL!);
 const current = rollDraft(selectHomeStadium(createDraft(manifest, 41), manifest, manifest.stadiums[2].ref.id), manifest);
 await page.addInitScript(({ key, value }) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, value);
 }, { key: STORAGE_KEY, value: JSON.stringify({ ...current, phase: 'draft' }) });
 await page.goto(`/c/${id}`);
 await expect(page.getByText(`You have a draft in progress · 0 of ${SLOTS.length} picked`)).toBeVisible();
 await expect(page.getByRole('button', { name: 'Draft your team', exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: 'Answer with my current draft', exact: true }).click();
 // It resumes straight into the same draft rather than replacing it.
 await expectPool(page);
 const stored = {
  challenge: await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), CHALLENGE_KEY),
  draft: await deviceDraft(page)
 };
 expect(stored.draft.seed).toBe(current.seed);
 expect(stored.draft.currentRoll).toEqual(current.currentRoll);
 expect(stored.challenge).toEqual({ replayId: id, wins: publication.record.wins, losses: publication.record.losses, seed: current.seed });
});

test('a challenge link without a published season says so and still starts a draft', async ({ page }) => {
 await page.goto('/c/aaaaaaaaaaaaaaaaaaaaaa');
 await expect(page.getByRole('heading', { level: 1, name: 'Challenge not found' })).toBeVisible();
 await expect(page.getByRole('link', { name: 'Start a draft', exact: true })).toHaveAttribute('href', '/classic?new=1');
});
