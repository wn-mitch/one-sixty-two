import { expect, test } from '@playwright/test';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../lib/game/draft.ts';
import { prepareSharePublication, storeReplay } from '../lib/game/share.ts';
import { SLOTS, type Draft, type Manifest } from '../lib/game/types.ts';
import { currentManifest, STORAGE_KEY } from './draft-test-fixtures.ts';

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

test('a challenge link opens a challenge card, binds the next draft, and offers the series after its season', async ({ page, request, baseURL }) => {
 const origin = baseURL!;
 const manifest = await currentManifest(request);
 const challenger = completeDraft(manifest, 7, 0);
 // Browsers send Origin on these POSTs; Node's fetch does not, and the site rejects cross-site posts.
 const sameOrigin: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...init?.headers, origin } });
 const { id } = await storeReplay(challenger, origin, sameOrigin);
 const publication = await prepareSharePublication(id, origin, sameOrigin);
 const { wins, losses } = publication.record;

 // Crawlers get challenge metadata with the published field image.
 const crawler = await request.get(`/c/${id}`);
 expect(crawler.status()).toBe(200);
 const html = await crawler.text();
 expect(html).toContain(`<title>Beat ${wins}-${losses} | 162-0</title>`);
 expect(html).toContain(`property="og:url" content="${origin}/c/${id}"`);
 expect(html).toContain(`property="og:image" content="${publication.images.field.url}"`);

 await page.goto(`/c/${id}`);
 await expect(page.getByRole('heading', { level: 1, name: `Beat ${wins}–${losses}` })).toBeVisible();
 await expect(page.getByRole('link', { name: 'See their season', exact: true })).toHaveAttribute('href', `/r/${id}`);
 await page.getByRole('button', { name: 'Draft your team', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Choose your home stadium', exact: true })).toBeVisible();
 const bound = await page.evaluate(([challengeKey, draftKey]) => ({
  challenge: JSON.parse(localStorage.getItem(challengeKey)!),
  seed: JSON.parse(localStorage.getItem(draftKey)!).seed
 }), [CHALLENGE_KEY, STORAGE_KEY]);
 expect(bound.challenge).toEqual({ replayId: id, wins, losses, seed: bound.seed });

 // Stand in a finished roster for the answering draft (rolls derive from the seed, so the challenge follows it), then play its season.
 const answer = completeDraft(manifest, 301, 3);
 await page.evaluate(([draftKey, draftValue, challengeKey, challengeValue]) => {
  localStorage.setItem(draftKey, draftValue);
  localStorage.setItem(challengeKey, challengeValue);
 }, [STORAGE_KEY, JSON.stringify({ ...answer, phase: 'lineup' }), CHALLENGE_KEY, JSON.stringify({ ...bound.challenge, seed: answer.seed })]);
 await page.goto('/');
 await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
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

test('a challenge link without a published season says so and still starts a draft', async ({ page }) => {
 await page.goto('/c/aaaaaaaaaaaaaaaaaaaaaa');
 await expect(page.getByRole('heading', { level: 1, name: 'Challenge not found' })).toBeVisible();
 await expect(page.getByRole('link', { name: 'Start a draft', exact: true })).toHaveAttribute('href', '/?new=1');
});
