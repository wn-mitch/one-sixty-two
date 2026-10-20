import { expect, test } from '@playwright/test';
import { dailyDate, dailyLabel, dailyStadium } from '../lib/game/daily.ts';
import { availableCandidates, commitPick, createDailyDraft, legalSlots, rollDraft } from '../lib/game/draft.ts';
import { encodeReplay, storeReplay } from '../lib/game/share.ts';
import { SLOTS, type Draft, type Manifest } from '../lib/game/types.ts';
import { currentManifest, deviceRows, openPack, runDeviceSql } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180_000);

/** Today's daily drafted to a full roster, taking the n-th legal card each pick until a strategy finishes. */
function completeDaily(manifest: Manifest, date: string): Draft {
 for (let strategy = 0; strategy < 40; strategy++) {
  try {
   let draft = createDailyDraft(manifest, date);
   while (draft.picks.length < SLOTS.length) {
    draft = rollDraft(draft, manifest);
    const legal = availableCandidates(draft, manifest).filter(item => legalSlots(draft, item, manifest).length);
    if (!legal.length) throw new Error('No legal candidate');
    const candidate = legal[(strategy * 7 + draft.picks.length) % legal.length];
    draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
   }
   return draft;
  } catch { /* Try the next deterministic strategy. */ }
 }
 throw new Error('No strategy completed today’s daily');
}

test('the daily leads the home screen, skips the stadium choice, keeps its own slot and resumes at /daily', async ({ page, request }) => {
 const manifest = await currentManifest(request);
 const date = dailyDate();
 await page.goto('/');
 const panel = page.getByRole('region', { name: `Daily ${dailyLabel(date)}` });
 await expect(panel).toContainText(dailyStadium(date, manifest).name);
 await expect(page.getByRole('button', { name: 'Build my team', exact: true })).toHaveClass(/secondary/);
 await panel.getByRole('button', { name: 'Play today’s daily', exact: true }).click();
 await expect(page).toHaveURL(/\/daily$/);
 await expect(page.getByRole('button', { name: 'Roll next franchise', exact: true })).toBeFocused();
 await openPack(page);

 const [run] = await deviceRows(page, 'SELECT json, season_key FROM daily_runs WHERE date = ?', [date]);
 expect(JSON.parse(run.json as string)).toMatchObject({ daily: date, homeStadium: dailyStadium(date, manifest).ref });
 expect(await deviceRows(page, 'SELECT json FROM draft')).toEqual([]);

 await page.goBack();
 await expect(page).toHaveURL(/\/$/);
 await expect(panel.getByRole('button', { name: 'Resume today’s daily', exact: true })).toBeVisible();
 await page.reload();
 await expect(panel.getByRole('button', { name: 'Resume today’s daily', exact: true })).toBeVisible();
 // A Classic team started beside the daily does not ask to replace it.
 await page.getByRole('button', { name: 'Build my team', exact: true }).click();
 await expect(page).toHaveURL(/\/classic$/);
 await expect(page.getByRole('region', { name: 'Choose your home stadium' })).toBeVisible();
 await page.goto('/daily');
 await expect(page.getByRole('button', { name: /^Take / }).or(page.locator('.candidates')).first()).toBeVisible();
 expect(await deviceRows(page, 'SELECT date FROM daily_runs')).toEqual([{ date }]);
});

test('a finished daily pays two tokens, carries its stamp, joins the standings, and leaves the home screen to Classic play', async ({ page, request, baseURL }) => {
 const manifest = await currentManifest(request);
 const date = dailyDate();
 const draft = completeDaily(manifest, date);
 await page.goto('/');
 const now = new Date().toISOString();
 await runDeviceSql(page, [
  // An earlier receipt rules out the first-season bonus.
  { sql: "INSERT INTO shop_completions (key, completed_at, credit) VALUES ('classic:earlier', 'earlier', 0)" },
  { sql: 'INSERT INTO daily_runs (date, started_at, updated_at, json) VALUES (?, ?, ?, ?)', bind: [date, now, now, JSON.stringify({ ...draft, phase: 'lineup' })] }
 ]);
 await page.goto('/daily');
 await page.getByRole('button', { name: 'Simulate 162 games', exact: true }).click();
 await expect(page.locator('#results-heading')).toBeVisible({ timeout: 60_000 });
 await expect(page.locator('.daily-stamp')).toHaveText(`Daily ${dailyLabel(date)}`);
 await expect(page.locator('.earned-receipt .reward-chip')).toHaveAccessibleName(/2 tokens earned: 1 season token \+ 1 daily bonus\./);
 const record = (await page.locator('#results-heading').getAttribute('aria-label'))!.match(/(\d+) wins and (\d+) losses/)!.slice(1);
 // The season joins the day's standings; other tests' dailies may share the board, so only the shape is fixed.
 const standing = /^((Top \d+%|#[\d,]+) of [\d,]+ daily runs so far|First daily run of the day so far)$/;
 await expect(page.getByRole('region', { name: 'Today’s daily standings' }).locator('.summary')).toHaveText(standing);
 expect(await deviceRows(page, 'SELECT submission FROM daily_runs WHERE date = ?', [date])).toEqual([{ submission: 'accepted' }]);
 expect(await deviceRows(page, 'SELECT length(token) AS length FROM device_identity')).toEqual([{ length: 22 }]);

 // A refused name leaves the run Anonymous and lets the player try another.
 const entry = page.getByRole('region', { name: 'Today’s daily board' });
 await entry.getByLabel(/Board name/).fill('Official Staff');
 await entry.getByRole('button', { name: 'Add name', exact: true }).click();
 await expect(entry.getByRole('alert')).toContainText('That name was not accepted');
 await entry.getByLabel(/Board name/).fill('Glass Arm');
 await entry.getByRole('button', { name: 'Add name', exact: true }).click();
 await expect(entry.getByLabel(/Board name/)).toHaveCount(0);
 expect(await deviceRows(page, 'SELECT board_name FROM daily_runs WHERE date = ?', [date])).toEqual([{ board_name: 'Glass Arm' }]);

 // A forged perfect season on the same replay ranks first by its claim, so it is checked first, and never shows.
 const origin = baseURL!;
 const { id } = await storeReplay(draft, origin, (input, init) => fetch(input, { ...init, headers: { ...init?.headers, origin } }));
 const forged = await request.post(`/api/daily/${date}`, {
  headers: { origin, 'cf-connecting-ip': '203.0.113.9' },
  data: { replayId: id, token: 'forger0000000000000000', record: { wins: 162, losses: 0, runsFor: 1200, runsAgainst: 100 }, name: 'Perfect' }
 });
 expect(forged.ok()).toBe(true);
 const forgedEntry = (await forged.json() as { entry: string }).entry;
 // Viewing the standings drives verification: each view recomputes a few runs in the Worker with the wasm engine.
 const board = async () => (await (await request.get(`/api/daily/${date}`)).json() as { board: { entry: string; name: string | null; wins: number }[] }).board;
 await expect.poll(async () => (await board()).map(row => row.name), { timeout: 90_000, intervals: [1_000] }).toContain('Glass Arm');
 expect((await board()).map(row => row.entry)).not.toContain(forgedEntry);
 expect((await board()).find(row => row.name === 'Glass Arm')?.wins).toBe(Number(record[0]));

 await page.goto(`/daily/${date}`);
 const list = page.getByRole('list', { name: `Daily ${dailyLabel(date)} board` });
 const own = list.getByRole('listitem').filter({ hasText: 'Glass Arm' });
 await expect(own).toContainText('You');
 await expect(own).toContainText(`${record[0]}–${record[1]}`);
 await expect(own.getByRole('button', { name: /^Report/ })).toHaveCount(0);
 await expect(list).not.toContainText('Perfect');

 await page.goto('/');
 const panel = page.getByRole('region', { name: `Daily ${dailyLabel(date)}` });
 await expect(panel).toContainText(`${record[0]}–${record[1]}`);
 await expect(panel.getByRole('region', { name: 'Today’s daily standings' }).locator('.summary')).toHaveText(standing);
 await expect(panel.getByRole('timer')).toContainText('Next daily in');
 await expect(panel.getByRole('button')).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Build my team', exact: true })).toHaveClass(/primary/);

 await panel.getByRole('link', { name: 'See it in My teams' }).click();
 const shelf = page.getByRole('region', { name: /^Daily runs/ });
 await expect(shelf.getByRole('list', { name: 'Daily runs' }).getByRole('listitem')).toHaveCount(1);
 await expect(shelf.locator('.daily').first()).toContainText(`Daily ${dailyLabel(date)}`);
});

test('opening someone else’s daily replay leaves this device’s teams, rewards and daily untouched', async ({ page, request, baseURL }) => {
 const origin = baseURL!;
 const manifest = await currentManifest(request);
 const date = dailyDate();
 const theirs = completeDaily(manifest, date);
 // Browsers send Origin on this POST; Node's fetch does not, and the site rejects cross-site posts.
 const { id } = await storeReplay(theirs, origin, (input, init) => fetch(input, { ...init, headers: { ...init?.headers, origin } }));
 const owned = async () => Object.fromEntries(await Promise.all(['seasons', 'season_cards', 'rostered', 'stickers', 'shop_completions', 'daily_runs', 'draft']
  .map(async table => [table, (await deviceRows(page, `SELECT COUNT(*) AS n FROM ${table}`))[0].n])));
 const nothing = { seasons: 0, season_cards: 0, rostered: 0, stickers: 0, shop_completions: 0, daily_runs: 0, draft: 0 };

 for (const link of [`/r/${id}`, `/#replay=${encodeReplay(theirs)}`]) {
  await page.goto(link);
  await expect(page.locator('#results-heading')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.daily-stamp')).toHaveText(`Daily ${dailyLabel(date)}`);
  await expect(page.locator('.reward-chip, [data-reward-flight], .reward-splash')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(await owned()).toEqual(nothing);
 }

 await page.goto('/');
 await expect(page.getByRole('region', { name: `Daily ${dailyLabel(date)}` }).getByRole('button', { name: 'Play today’s daily', exact: true })).toBeVisible();
 await page.goto('/seasons');
 await expect(page.getByRole('region', { name: /^Daily runs/ })).toHaveCount(0);
 expect(await owned()).toEqual(nothing);
});
