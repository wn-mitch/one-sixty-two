import { expect, test } from '@playwright/test';
import type { LibraryEntry } from '../lib/game/library.ts';
import { LEGACY_KEYS } from '../lib/storage/legacy.ts';
import { currentManifest } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

test('a saved season fills the collection and its sticker album, with stickers that can be hidden and moved, and they persist', async ({ page, request }) => {
 const manifest = await currentManifest(request);
 const hitter = manifest.candidates.find(candidate => candidate.eligibleSlots.includes('LF') && !candidate.seasonId.startsWith('bullpen:'))!;
 const pitcher = manifest.candidates.find(candidate => candidate.eligibleSlots.includes('SP1') && candidate.franchiseId !== hitter.franchiseId)!;
 const hitterLabel = `Slugger ${hitter.seasonId.split(':')[1]}`;
 const entry: LibraryEntry = {
  key: 'collection-e2e', savedAt: '2026-03-01T00:00:00.000Z', token: 'not-a-replay',
  schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: manifest.dataVersion,
  record: { wins: 121, losses: 41 }, runs: { scored: 950, allowed: 500 },
  batting: [{ seasonId: hitter.seasonId, label: hitterLabel, slot: 'LF', PA: 700, AB: 600, H: 190, doubles: 40, triples: 3, HR: 61, BB: 90, HBP: 5, SF: 5, RBI: 150, SB: 4, war: 9 }],
  pitching: [{ seasonId: pitcher.seasonId, label: 'Arm', slot: 'SP1', outs: 1000, H: 250, BB: 70, SO: 300, R: 200, starts: 54, war: 5 }],
  stadium: null,
  roster: [{ seasonId: hitter.seasonId, label: hitterLabel, slot: 'LF' }, { seasonId: pitcher.seasonId, label: 'Arm', slot: 'SP1' }],
  mvp: { seasonId: hitter.seasonId, label: hitterLabel }
 };
 await page.addInitScript(([key, value]) => {
  if (!sessionStorage.getItem('seeded')) {
   sessionStorage.setItem('seeded', '1');
   localStorage.setItem(key, value);
  }
 }, [LEGACY_KEYS.library, JSON.stringify([entry])]);

 await page.goto('/collection');
 await page.getByRole('button', { name: 'All seasons', exact: true }).click();
 const grid = page.getByRole('list', { name: 'Collected cards' });
 await expect(grid.getByRole('button')).toHaveCount(2);
 await expect(page.getByRole('meter', { name: 'Player-seasons' })).toHaveAttribute('value', '2');
 // Kinds reached across both cards (grade C, 20–120 wins, MVP, 20–60 HR, 150–175 hits, 100–145 RBI, .350–.400 OBP, 200–300 K) and one sticker per family per card.
 await expect(page.getByRole('meter', { name: 'Sticker kinds' })).toHaveAttribute('value', '23');
 await expect(page.getByRole('meter', { name: 'Sticker kinds' })).toHaveAttribute('max', '97');
 const tile = grid.getByRole('button', { name: new RegExp(hitterLabel) });
 // The face shows the grade and the three rarest families by simulated earn rate: MVP, 60 HR, .400 OBP (120 wins, 175 hits and 145 RBI are more common).
 const faceFamilies = () => tile.locator('.stickers [data-family]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('data-family')}:${node.textContent}`));
 await expect.poll(faceFamilies, { timeout: 30000 }).toEqual(['grade:Cgrade', 'mvp:TeamMVP', 'power:60HR', 'eye:.400OBP']);

 await tile.click();
 const detail = page.getByRole('region', { name: hitterLabel });
 await expect(detail.getByRole('heading', { level: 2 })).toBeFocused();
 await expect(detail.locator('.surface .front .stickers [data-family="mvp"]')).toBeVisible();
 await detail.getByRole('button', { name: 'Turn over', exact: true }).click();
 await expect(detail.locator('.back[aria-hidden="false"]')).toBeVisible();
 await detail.getByRole('button', { name: 'Show front', exact: true }).click();
 await expect(detail.locator('.front[aria-hidden="false"]')).toBeVisible();
 await page.keyboard.press('Escape');
 // The panel shows progress toward each counting sticker's next rung; Hide and Show wait behind Edit stickers.
 await expect(detail.getByText('61 of 70 HR', { exact: true })).toBeVisible();
 await expect(detail.getByRole('button', { name: /^Hide / })).toHaveCount(0);
 await detail.getByRole('button', { name: 'Edit stickers' }).click();
 await expect(detail.locator('.surface > .card')).toHaveAttribute('data-interactive', 'false');
 await detail.getByRole('button', { name: 'Hide 60 home runs' }).click();
 // Hiding 60 HR lets the next rarest family, 145 RBI, onto the face.
 await expect.poll(faceFamilies).toEqual(['grade:Cgrade', 'mvp:TeamMVP', 'eye:.400OBP', 'production:145RBI']);

 const handle = detail.getByRole('button', { name: /Move Team MVP sticker/ });
 const before = await handle.boundingBox();
 await handle.focus();
 await page.keyboard.press('Shift+ArrowDown');
 await expect.poll(async () => (await handle.boundingBox())!.y).toBeGreaterThan(before!.y + 5);

 await page.reload();
 await page.getByRole('button', { name: 'All seasons', exact: true }).click();
 await page.getByRole('list', { name: 'Collected cards' }).getByRole('button', { name: new RegExp(hitterLabel) }).click();
 const reopened = page.getByRole('region', { name: hitterLabel });
 await expect(reopened.getByText('1 hidden')).toBeVisible();
 await reopened.getByRole('button', { name: 'Edit stickers' }).click();
 await expect(reopened.getByRole('button', { name: 'Show 60 home runs' })).toBeVisible();
 const moved = await reopened.getByRole('button', { name: /Move Team MVP sticker/ }).boundingBox();
 expect(Math.abs(moved!.y - before!.y)).toBeGreaterThan(5);

 // The album lays out every family's ladder; an earned sticker leads back to the cards that hold it.
 await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Stickers' }).click();
 const power = page.getByRole('list', { name: 'Home runs stickers' });
 await expect(power.getByRole('img', { name: '70 home runs, not yet earned' })).toBeVisible();
 await expect(page.getByRole('list', { name: 'Perfect games stickers' }).getByRole('img', { name: 'Secret sticker, not yet earned' })).toHaveCount(2);
 await power.getByRole('button', { name: /^40 home runs: 1 card/ }).click();
 await expect(page.getByText(/Cards holding 40 home runs, or better/)).toBeVisible();
 await expect(page.getByRole('list', { name: 'Collected cards' }).getByRole('button')).toHaveCount(1);
 await page.getByRole('button', { name: 'Show all cards' }).click();
 await expect(page.getByRole('list', { name: 'Collected cards' }).getByRole('button')).toHaveCount(2);
});

test('player stacks hide backing cards for single seasons and preserve multi-season selection', async ({ page, request }) => {
 await page.setViewportSize({ width: 1512, height: 828 });
 const manifest = await currentManifest(request);
 const byPlayer = new Map<string, typeof manifest.candidates>();
 for (const candidate of manifest.candidates) {
  if (!candidate.eligibleSlots.includes('LF')) continue;
  const seasons = byPlayer.get(candidate.playerId) ?? [];
  if (!seasons.some(item => item.seasonId.split(':')[1] === candidate.seasonId.split(':')[1])) seasons.push(candidate);
  byPlayer.set(candidate.playerId, seasons);
 }
 const candidates = [...byPlayer.values()].find(seasons => seasons.length >= 3)!.slice(0, 3);
 const singleton = [...byPlayer.values()].find(seasons => seasons[0].playerId !== candidates[0].playerId)![0];
 const entries: LibraryEntry[] = [...candidates, singleton].map((candidate, index) => ({
  key: `stack-example-${index}`, savedAt: new Date(index * 1000).toISOString(), token: 'not-a-replay',
  schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: manifest.dataVersion,
  record: { wins: 120, losses: 42 }, runs: { scored: 900, allowed: 500 },
  batting: [], pitching: [], stadium: null,
  roster: [{ seasonId: candidate.seasonId, label: `Example player ${candidate.seasonId.split(':')[1]}`, slot: 'LF' }]
 }));
 await page.addInitScript(({ key, value }) => {
  if (!sessionStorage.getItem('stack-seeded')) {
   sessionStorage.setItem('stack-seeded', '1');
   localStorage.setItem(key, value);
  }
 }, { key: LEGACY_KEYS.library, value: JSON.stringify(entries) });
 await page.goto('/collection');
 const players = page.getByRole('list', { name: 'Collected players' });
 await expect(players.getByRole('button')).toHaveCount(2);
 await expect(players.locator('button.stack-tile')).toHaveCount(1);
 expect(await players.locator('button:not(.stack-tile) .art').evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
 expect(await players.locator('button.stack-tile .art').evaluate(element => getComputedStyle(element, '::before').content)).not.toBe('none');
 await players.locator('button:not(.stack-tile)').click();
 await expect(page.locator('.stack-panel')).toBeVisible();
 await expect(page.getByRole('region', { name: 'Owned seasons' })).toHaveCount(0);
 await players.locator('button.stack-tile').click();
 const rail = page.getByRole('region', { name: 'Owned seasons' });
 await expect(rail.locator('.season-card')).toHaveCount(3);
 const selectedYear = candidates[0].seasonId.split(':')[1];
 await rail.getByRole('button', { name: `Open Example player ${selectedYear}`, exact: true }).click();
 const detail = page.getByRole('region', { name: `Example player ${selectedYear}`, exact: true });
 await expect(detail.getByRole('heading', { level: 2 })).toBeFocused();
 await expect(detail.locator('.surface .card[data-face="front"]')).toHaveAttribute('data-identity', new RegExp(`\\|${selectedYear}\\|`));
 await detail.getByRole('button', { name: 'Turn over', exact: true }).click();
 await expect(detail.locator('.back[aria-hidden="false"]')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(rail.locator('.season-card[aria-pressed="true"]')).toHaveAccessibleName(`Open Example player ${selectedYear}`);
});

test('player stacks keep exact seasons and remember a filter-safe cover on mobile', async ({ page, request }) => {
 const manifest = await currentManifest(request);
 const byPlayer = new Map<string, typeof manifest.candidates>();
 for (const candidate of manifest.candidates) {
  if (!candidate.eligibleSlots.includes('LF')) continue;
  const seasons = byPlayer.get(candidate.playerId) ?? [];
  if (!seasons.some(item => item.seasonId.split(':')[1] === candidate.seasonId.split(':')[1])) seasons.push(candidate);
  byPlayer.set(candidate.playerId, seasons);
 }
 const candidates = [...byPlayer.values()].find(seasons => seasons.length >= 3)!.slice(0, 3);
 const entries: LibraryEntry[] = candidates.map((candidate, index) => ({
  key: `stack-example-${index}`, savedAt: new Date(index * 1000).toISOString(), token: 'not-a-replay',
  schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: manifest.dataVersion,
  record: { wins: 120, losses: 42 }, runs: { scored: 900, allowed: 500 },
  batting: [], pitching: [], stadium: null,
  roster: [{ seasonId: candidate.seasonId, label: `Example player ${candidate.seasonId.split(':')[1]}`, slot: 'LF' }]
 }));
 await page.addInitScript(({ key, value }) => {
  if (!sessionStorage.getItem('stack-seeded')) {
   sessionStorage.setItem('stack-seeded', '1');
   localStorage.setItem(key, value);
  }
 }, { key: LEGACY_KEYS.library, value: JSON.stringify(entries) });
 await page.goto('/collection');
 const players = page.getByRole('list', { name: 'Collected players' });
 await expect(players.getByRole('button')).toHaveCount(1);
 await players.getByRole('button').click();
 const rail = page.getByRole('region', { name: 'Owned seasons' });
 await expect(rail.locator('.season-card')).toHaveCount(3);
 const coverYear = candidates[0].seasonId.split(':')[1];
 await rail.locator('.season-item').filter({ has: page.getByRole('button', { name: `Open Example player ${coverYear}`, exact: true }) }).getByRole('button', { name: 'Set as cover', exact: true }).click();
 await page.reload();
 await expect(players.getByRole('button').locator('.card')).toHaveAttribute('data-identity', new RegExp(`\\|${coverYear}\\|`));
 const otherYear = candidates[1].seasonId.split(':')[1];
 await page.getByRole('searchbox', { name: 'Find a card' }).fill(otherYear);
 await expect(players.getByRole('button').locator('.card')).toHaveAttribute('data-identity', new RegExp(`\\|${otherYear}\\|`));
 await page.getByRole('searchbox', { name: 'Find a card' }).fill('');
 await expect(players.getByRole('button').locator('.card')).toHaveAttribute('data-identity', new RegExp(`\\|${coverYear}\\|`));
 await players.getByRole('button').click();
 await expect(rail.locator('.season-card')).toHaveCount(3);
 const geometry = await rail.evaluate(element => ({
  width: element.clientWidth, content: element.scrollWidth,
  page: document.documentElement.scrollWidth, viewport: innerWidth
 }));
 expect(geometry.content).toBeGreaterThan(geometry.width);
 expect(geometry.page).toBeLessThanOrEqual(geometry.viewport);
 await page.getByRole('button', { name: 'All seasons', exact: true }).click();
 await expect(page.getByRole('list', { name: 'Collected cards' }).getByRole('button')).toHaveCount(3);
});
