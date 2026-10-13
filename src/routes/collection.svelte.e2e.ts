import { expect, test } from '@playwright/test';
import type { LibraryEntry } from '../lib/game/library.ts';
import { LEGACY_KEYS } from '../lib/storage/legacy.ts';
import { currentManifest } from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

test('a saved season fills the collection with stickers that can be hidden and moved, and they persist', async ({ page, request }) => {
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
 const grid = page.getByRole('list', { name: 'Collected cards' });
 await expect(grid.getByRole('button')).toHaveCount(2);
 await expect(page.getByText(/2\s+cards · 2\s+of [\d,]+ player-seasons, <0\.01% · 7\s+stickers/)).toBeVisible();
 const tile = grid.getByRole('button', { name: new RegExp(hitterLabel) });
 // The face shows the grade and the three rarest families by simulated earn rate: MVP, 60 HR, .400 OBP (120 wins, 175 hits and 145 RBI are more common).
 const faceFamilies = () => tile.locator('.stickers [data-family]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('data-family')}:${node.textContent}`));
 await expect.poll(faceFamilies, { timeout: 30000 }).toEqual(['grade:Cgrade', 'mvp:TeamMVP', 'power:60HR', 'eye:.400OBP']);

 await tile.click();
 const detail = page.getByRole('region', { name: hitterLabel });
 await expect(detail.getByRole('heading', { level: 2 })).toBeFocused();
 await detail.getByRole('listitem').filter({ hasText: '60 home runs' }).getByRole('button', { name: 'Hide' }).click();
 // Hiding 60 HR lets the next rarest family, 145 RBI, onto the face.
 await expect.poll(faceFamilies).toEqual(['grade:Cgrade', 'mvp:TeamMVP', 'eye:.400OBP', 'production:145RBI']);

 await detail.getByRole('button', { name: 'Arrange stickers' }).click();
 const handle = detail.getByRole('button', { name: /Move Team MVP sticker/ });
 const before = await handle.boundingBox();
 await handle.focus();
 await page.keyboard.press('Shift+ArrowDown');
 await expect.poll(async () => (await handle.boundingBox())!.y).toBeGreaterThan(before!.y + 5);

 await page.reload();
 await page.getByRole('list', { name: 'Collected cards' }).getByRole('button', { name: new RegExp(hitterLabel) }).click();
 const reopened = page.getByRole('region', { name: hitterLabel });
 await expect(reopened.getByRole('listitem').filter({ hasText: '60 home runs' }).getByRole('button', { name: 'Show' })).toBeVisible();
 await reopened.getByRole('button', { name: 'Arrange stickers' }).click();
 const moved = await reopened.getByRole('button', { name: /Move Team MVP sticker/ }).boundingBox();
 expect(Math.abs(moved!.y - before!.y)).toBeGreaterThan(5);
});
