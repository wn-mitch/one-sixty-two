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

test('a finished daily pays two tokens, carries its stamp, and leaves the home screen to Classic play', async ({ page, request }) => {
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

 await page.goto('/');
 const panel = page.getByRole('region', { name: `Daily ${dailyLabel(date)}` });
 await expect(panel).toContainText(`${record[0]}–${record[1]}`);
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
