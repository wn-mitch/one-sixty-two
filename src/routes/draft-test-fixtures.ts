import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { availableCandidates, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../lib/game/draft.ts';
import { SLOTS, isJackpot, type Candidate, type Draft, type Manifest, type Profile, type Roll, type Slot } from '../lib/game/types.ts';
import type { MediaManifest, MediaPointer } from '../lib/media/types.ts';
import type { WarRankings, WarRankingsPointer } from '../lib/rankings/types.ts';

/** The legacy localStorage key; a fresh browser context imports it into the device database on first load. */
export const STORAGE_KEY = '162-zero:v1';

type DeviceDb = { all(sql: string, bind?: unknown[]): Promise<Record<string, unknown>[]>; run(statements: { sql: string; bind?: unknown[] }[]): Promise<void> };

/**
 * Finds a player's group in the append-only draft pool, revealing batches and opening full roles as needed.
 */
export async function revealCandidate(page: Page, playerId: string): Promise<Locator> {
 const group = page.locator(`.candidate-card[data-candidate-group="${playerId}"]`);
 await expect(page.locator('.candidate-card').first()).toBeVisible();
 for (;;) {
  if (await group.count()) break;
  const more = page.getByRole('button', { name: 'Load more players', exact: true });
  if (!(await more.count())) break;
  // Keyboard activation does not scroll the sentinel into view and race its observer.
  await more.evaluate(button => button.focus({ preventScroll: true }));
  await more.press('Enter');
 }
 const folded = page.locator('details.collapsed-role:not([open]) > summary');
 if (!(await group.count()) && await folded.count()) await folded.click();
 await expect(group).toHaveCount(1);
 await group.scrollIntoViewIfNeeded();
 return group;
}

/** Reveals the whole pool, folded roles included, and fails if the player appears anywhere. */
export async function expectAbsentFromPool(page: Page, playerId: string): Promise<void> {
 const group = page.locator(`.candidate-card[data-candidate-group="${playerId}"]`);
 await expect(page.locator('.candidate-card').first()).toBeVisible();
 for (;;) {
  await expect(group).toHaveCount(0);
  const more = page.getByRole('button', { name: 'Load more players', exact: true });
  if (!(await more.count())) break;
  await more.evaluate(button => button.focus({ preventScroll: true }));
  await more.press('Enter');
 }
 const folded = page.locator('details.collapsed-role:not([open]) > summary');
 if (await folded.count()) await folded.click();
 await expect(group).toHaveCount(0);
}

/** Waits for the draft pool's cards, the board's ready state now that the pool has no search box. */
export async function expectPool(page: Page): Promise<void> {
 await expect(page.getByRole('region', { name: 'Players', exact: true }).locator('.candidate-card[data-candidate-group]').first()).toBeVisible();
}

/** The page's application code installs the database hook once it has loaded. */
function deviceHook(page: Page): Promise<unknown> {
 return page.waitForFunction(() => '__deviceDb' in window);
}

/** The draft row of the page's device database, parsed; null when nothing is saved. */
export async function deviceDraft<T = Draft & { phase: string }>(page: Page): Promise<T> {
 const json = await deviceDraftText(page);
 return (json === null ? null : JSON.parse(json)) as T;
}

/** The raw draft row text, for asserting a save was left untouched. */
export async function deviceDraftText(page: Page): Promise<string | null> {
 await deviceHook(page);
 return page.evaluate(async () => {
  const rows = await (window as unknown as { __deviceDb: DeviceDb }).__deviceDb.all('SELECT json FROM draft WHERE id = 1');
  return (rows[0]?.json as string | undefined) ?? null;
 });
}

/** Rows from the page's device database. */
export async function deviceRows(page: Page, sql: string, bind: unknown[] = []): Promise<Record<string, unknown>[]> {
 await deviceHook(page);
 return page.evaluate(([query, values]) => (window as unknown as { __deviceDb: DeviceDb }).__deviceDb.all(query, values), [sql, bind] as const);
}

/** Runs statements in one transaction against the page's device database. */
export async function runDeviceSql(page: Page, statements: { sql: string; bind?: unknown[] }[]): Promise<void> {
 await deviceHook(page);
 await page.evaluate(values => (window as unknown as { __deviceDb: DeviceDb }).__deviceDb.run(values), statements);
}

/** Replaces the saved draft in the page's device database. */
export async function writeDeviceDraft(page: Page, value: string): Promise<void> {
 await deviceHook(page);
 await page.evaluate(async json => {
  await (window as unknown as { __deviceDb: DeviceDb }).__deviceDb.run([{ sql: 'INSERT OR REPLACE INTO draft (id, json, updated_at) VALUES (1, ?, ?)', bind: [json, new Date().toISOString()] }]);
 }, value);
}

export interface CardScenario {
 draft: Draft;
 candidate: Candidate;
 profile: Profile;
 profiles: Profile[];
 slot: Slot;
}

export async function currentManifest(request: APIRequestContext): Promise<Manifest> {
 const pointerResponse = await request.get('/data/current.json');
 expect(pointerResponse.ok()).toBe(true);
 const pointer = await pointerResponse.json() as { manifestUrl: string };
 const manifestResponse = await request.get(pointer.manifestUrl);
 expect(manifestResponse.ok()).toBe(true);
 return manifestResponse.json() as Promise<Manifest>;
}

export async function currentMedia(request: APIRequestContext): Promise<MediaManifest> {
 const pointerResponse = await request.get('/media/current.json');
 expect(pointerResponse.ok()).toBe(true);
 const pointer = await pointerResponse.json() as MediaPointer;
 const manifestResponse = await request.get(pointer.manifestUrl);
 expect(manifestResponse.ok()).toBe(true);
 return manifestResponse.json() as Promise<MediaManifest>;
}

export async function currentRankings(request: APIRequestContext): Promise<WarRankings> {
 const pointerResponse = await request.get('/rankings/current.json');
 expect(pointerResponse.ok()).toBe(true);
 const pointer = await pointerResponse.json() as WarRankingsPointer;
 const manifestResponse = await request.get(pointer.manifestUrl);
 expect(manifestResponse.ok()).toBe(true);
 return manifestResponse.json() as Promise<WarRankings>;
}

/** Every profile a pack can deal: its franchise-decade chunk, or each chunk a jackpot draws from. Caches by chunk URL. */
export async function rollProfiles(request: APIRequestContext, manifest: Manifest, roll: Roll, cache = new Map<string, Profile[]>()): Promise<Profile[]> {
 const keys = isJackpot(roll)
  ? [...new Set(roll.jackpot.map(seasonId => {
   const candidate = manifest.candidates.find(item => item.seasonId === seasonId)!;
   return `${candidate.franchiseId}-${candidate.decade}`;
  }))]
  : [`${roll.franchiseId}-${roll.decade}`];
 const profiles: Profile[] = [];
 for (const key of keys) {
  const url = manifest.chunks[key];
  let chunk = cache.get(url);
  if (!chunk) {
   const response = await request.get(url);
   expect(response.ok()).toBe(true);
   chunk = await response.json() as Profile[];
   cache.set(url, chunk);
  }
  profiles.push(...chunk);
 }
 return profiles;
}

export async function cardScenario(
 request: APIRequestContext,
 manifest: Manifest,
 accept: (candidate: Candidate, profile: Profile) => boolean
): Promise<CardScenario> {
 const profilesByChunk = new Map<string, Profile[]>();
 for (let seed = 1; seed <= 3000; seed++) {
  const draft = rollDraft(selectHomeStadium(createDraft(manifest, seed), manifest, manifest.stadiums[0].ref.id), manifest);
  // Card scenarios stand on a franchise pool.
  if (!draft.currentRoll || isJackpot(draft.currentRoll)) continue;
  const profiles = await rollProfiles(request, manifest, draft.currentRoll, profilesByChunk);
  for (const candidate of availableCandidates(draft, manifest)) {
   const profile = profiles.find(item => item.seasonId === candidate.seasonId);
   const slot = legalSlots(draft, candidate, manifest)[0];
   if (profile && slot && accept(candidate, profile)) return { draft, candidate, profile, profiles, slot };
  }
 }
 throw new Error('Current data did not produce the requested card scenario in 3000 deterministic rolls');
}

export async function openSavedDraft(page: Page, draft: Draft): Promise<void> {
 const saved = JSON.stringify({ ...draft, phase: 'draft' });
 await page.addInitScript(({ key, value }) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, value);
 }, { key: STORAGE_KEY, value: saved });
 await page.goto('/');
 await page.getByRole('button', { name: 'Resume my team', exact: true }).click();
 await expectPool(page);
}

/** Picks the first stadium in the deck; the session rolls the first franchise right after. */
/** Opens the foil pack and takes the dealt team card into the roll rail. */
export async function openPack(page: Page): Promise<void> {
 await page.getByRole('button', { name: 'Roll next franchise', exact: true }).click();
 const dealt = page.getByRole('button', { name: /^Take / });
 await expect(dealt).toBeFocused();
 await dealt.click();
}

/** Chooses the first stadium and waits for the sealed foil pack to take focus. */
export async function selectStadium(page: Page): Promise<void> {
 const deck = page.getByRole('region', { name: 'Choose your home stadium' });
 // The radio sits under its venue card; players choose by clicking the card's photo.
 await deck.locator('.choice').first().locator('.photo').click();
 await expect(deck.getByRole('radio').first()).toBeChecked();
 await deck.getByRole('button', { name: 'Draft at this stadium', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Roll next franchise', exact: true })).toBeFocused();
}

/** Chooses the first stadium, then opens the foil pack that deals the first franchise. */
export async function chooseStadium(page: Page): Promise<void> {
 await selectStadium(page);
 await openPack(page);
}

/**
 * Opens the pack when the pool load is expected to fail: the error dialog takes focus over the
 * dealt card, Retry loads the pool, and taking the card then reveals the candidates.
 */
export async function openPackThroughRetry(page: Page): Promise<unknown> {
 await page.getByRole('button', { name: 'Roll next franchise', exact: true }).click();
 const retry = page.locator('dialog.error-dialog[open]').getByRole('button', { name: 'Retry', exact: true });
 await expect(retry).toBeVisible();
 const committed = (await deviceDraft(page)).currentRoll;
 await retry.click();
 await expect(page.locator('dialog.error-dialog[open]')).toHaveCount(0);
 await page.getByRole('button', { name: /^Take / }).click();
 return committed;
}

export async function settlePool(page: Page) {
 await expect(page.locator('.player-card').first()).toBeVisible();
 // The grid re-sorts once composite WAR/162 arrives, so wait before targeting
 // a card the browser might move.
 await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
}

export async function firstLegalSeason(page: Page, request: APIRequestContext): Promise<{ seasonId: string; playerId: string; displayName: string; slot: Slot }> {
 const manifest = await currentManifest(request);
 const saved = await deviceDraft<Draft>(page);
 const candidate = availableCandidates(saved, manifest).find(item => legalSlots(saved, item, manifest).length > 0);
 if (!candidate) throw new Error('The roll had no legal candidate in the current live manifest');
 const response = await request.get(manifest.chunks[`${candidate.franchiseId}-${candidate.decade}`]);
 expect(response.ok()).toBe(true);
 const profiles = await response.json() as Array<{ seasonId: string; playerId: string; displayName: string }>;
 const profile = profiles.find(item => item.seasonId === candidate.seasonId);
 if (!profile) throw new Error('The legal live candidate is absent from its current-roll chunk');
 return { ...profile, slot: legalSlots(saved, candidate, manifest)[0] };
}

export async function selectExactSeason(page: Page, request: APIRequestContext) {
 await settlePool(page);
 const target = await firstLegalSeason(page, request);
 const group = await revealCandidate(page, target.playerId);
 await group.getByRole('button', { name: /^Select / }).first().click();
 const sheet = page.locator('dialog.draft-sheet[open]');
 await expect(sheet).toBeVisible();
 await sheet.getByRole('combobox', { name: `Exact season for ${target.displayName}`, exact: true }).selectOption(target.seasonId);
 return { target, sheet };
}

export async function pickFirstSeason(page: Page, request: APIRequestContext) {
 const { target, sheet } = await selectExactSeason(page, request);
 const destination = sheet.locator(`[data-slot="${target.slot}"]`);
 await expect(destination).toBeEnabled();
 await destination.click();
 const confirmation = sheet.locator('.pick-confirmation');
 await expect(confirmation).toHaveAttribute('data-selected-season', target.seasonId);
 await expect(confirmation).toHaveAttribute('data-pending-slot', target.slot);
 await sheet.getByRole('button', { name: new RegExp(`^Draft .+ at ${target.slot}$`) }).click();
}

/** Drafts a complete team from Home, taking the first legal season each pick. */
export async function finishRoster(page: Page, request: APIRequestContext) {
 await page.goto('/');
 await page.getByRole('button', { name: /Play now: draft your team/ }).click();
 await chooseStadium(page);
 await expect(page.locator('.player-card').first()).toBeVisible();
 for (let index = 0; index < SLOTS.length; index++) {
  await pickFirstSeason(page, request);
  if (index < SLOTS.length - 1) await openPack(page);
 }
}
