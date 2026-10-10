import { expect, test, type Page } from '@playwright/test';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../lib/game/draft.ts';
import { LIBRARY_KEY, libraryKey, type LibraryEntry } from '../lib/game/library.ts';
import { encodeReplay } from '../lib/game/share.ts';
import { SLOTS, type Draft, type Manifest } from '../lib/game/types.ts';
import { currentManifest, STORAGE_KEY } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(300000);

const ACTIVE_SAVE = '{"sentinel":"active run"}';

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

function entry(manifest: Manifest, draft: Draft, key: string, wins: number, nickname?: string): LibraryEntry {
 const stadium = manifest.stadiums.find(item => item.ref.id === draft.homeStadium!.id)!;
 return {
  key, savedAt: new Date(2026, 0, wins).toISOString(), token: encodeReplay(draft),
  schemaVersion: draft.schemaVersion, modelVersion: draft.modelVersion, dataVersion: draft.dataVersion,
  record: { wins, losses: 162 - wins }, runs: { scored: 700 + wins, allowed: 700 }, batting: [], pitching: [], stadium: { id: stadium.ref.id, name: stadium.name },
  roster: draft.picks.map(pick => ({ seasonId: pick.seasonId, slot: pick.slot, label: pick.seasonId })),
  ...(nickname ? { nickname } : {})
 };
}

async function gameSummaries(page: Page): Promise<string[]> {
 await expect(page.getByRole('heading', { level: 1, name: /win 3–[012]$/ })).toBeVisible({ timeout: 240000 });
 return page.locator('.games .game-head').allInnerTexts();
}

test('plays a best-of-five from two saved seasons, shares it, and never touches the active save', async ({ page, browser, request, baseURL }) => {
 const manifest = await currentManifest(request);
 const aces = completeDraft(manifest, 1, 0);
 const bombers = completeDraft(manifest, 101, 5);
 const library = [
  // Real library keys, so the recorded series finds both clubs.
  entry(manifest, aces, await libraryKey(aces), 91, 'Aces'),
  entry(manifest, bombers, await libraryKey(bombers), 99, 'Bombers'),
  { ...entry(manifest, aces, 'k-old', 120, 'Old timers'), schemaVersion: 4, modelVersion: 'pa-v3' }
 ];
 await page.addInitScript(({ key, active, libraryKey, value }) => {
  if (!localStorage.getItem(libraryKey)) {
   localStorage.setItem(key, active);
   localStorage.setItem(libraryKey, value);
  }
 }, { key: STORAGE_KEY, active: ACTIVE_SAVE, libraryKey: LIBRARY_KEY, value: JSON.stringify(library) });

 await page.goto('/seasons');
 const tiles = page.getByRole('list', { name: 'Saved clubs' }).getByRole('button');
 await expect(tiles).toHaveCount(3);
 await expect(tiles.locator('.title')).toHaveText(['Old timers', 'Bombers', 'Aces']);
 await expect(tiles.nth(0)).toContainText('Retired');

 await page.goto('/h2h');
 const pickerA = page.getByRole('combobox', { name: 'Choose from my seasons' }).first();
 await expect(pickerA.locator('option')).toHaveCount(3);
 const label = (item: LibraryEntry) => `${item.nickname} · ${item.record.wins}–${item.record.losses} · ${item.stadium!.name}`;
 await pickerA.selectOption({ label: label(library[0]) });
 await page.getByRole('combobox', { name: 'Choose from my seasons' }).nth(1).selectOption({ label: label(library[1]) });
 await expect(page.getByLabel('Team A replay link')).toHaveValue(/#replay=/);
 await page.getByRole('button', { name: 'Play best-of-five' }).click();
 await expect(page.getByRole('status').filter({ hasText: /Replaying|Playing|Game/ })).toBeVisible();
 const played = await gameSummaries(page);
 expect(played.length).toBeGreaterThanOrEqual(3);
 expect(played.length).toBeLessThanOrEqual(5);
 await expect(page.getByText('Series MVP')).toBeVisible();
 expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(ACTIVE_SAVE);

 const seriesUrl = page.url();
 expect(seriesUrl).toMatch(/\/h2h#a=.+&an=Aces&b=.+&bn=Bombers$/);
 const fresh = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
 const other = await fresh.newPage();
 // Opening the link from the setup page is a same-document hash change.
 await other.goto('/h2h');
 await expect(other.getByRole('button', { name: 'Play best-of-five' })).toBeEnabled();
 await other.goto(seriesUrl);
 expect(await gameSummaries(other)).toEqual(played);
 await fresh.close();

 // The finished series joins this device's head-to-head history.
 const champion = (await page.getByRole('heading', { level: 1 }).innerText()).startsWith('Aces') ? 'Aces' : 'Bombers';
 await page.goto('/seasons');
 const tile = (name: string) => page.getByRole('list', { name: 'Saved clubs' }).getByRole('button').filter({ hasText: name });
 await expect(tile(champion)).toContainText('H2H 1–0');
 await expect(tile(champion === 'Aces' ? 'Bombers' : 'Aces')).toContainText('H2H 0–1');
 await tile('Aces').click();
 await tile('Bombers').click({ modifiers: ['ControlOrMeta'] });
 const tape = page.getByRole('region', { name: /Aces vs Bombers/ });
 await expect(tape.getByRole('row', { name: /Series won head-to-head/ })).toContainText(champion === 'Aces' ? /1\s*Series won head-to-head\s*0/ : /0\s*Series won head-to-head\s*1/);
 await expect(tape.getByRole('link', { name: 'Play best-of-five' })).toHaveAttribute('href', /^\/h2h#a=.+&an=Aces&b=.+&bn=Bombers$/);
});

test('names the broken link instead of starting a series', async ({ page }) => {
 await page.goto('/h2h');
 await page.getByLabel('Team A replay link').fill('https://example.com/r/aaaaaaaaaaaaaaaaaaaaaa');
 await page.getByLabel('Team B replay link').fill('/r/aaaaaaaaaaaaaaaaaaaaaa');
 await page.getByRole('button', { name: 'Play best-of-five' }).click();
 await expect(page.getByText('Replay links must come from this site.')).toBeVisible();
 await expect(page.getByText('No replay exists at that link.')).toBeVisible();
 await expect(page.getByLabel('Team A replay link')).toBeFocused();
});
