import { describe, expect, it } from 'vitest';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from './draft.ts';
import { deleteSeason, loadLibrary, renameSeason, saveSeason } from './library.ts';
import { persistDraft } from './persistence.ts';
import { brokenDb, memoryDb } from '../storage/test-db.ts';
import { SLOTS, type Candidate, type Draft, type Manifest } from './types.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';
import type { SeasonResult } from '../sim/types.ts';

const candidates: Candidate[] = SLOTS.map((slot, index) => ({
 seasonId: `anon${index}:1982:AL:T${index}`, playerId: `anon${index}`, franchiseId: `F${String(index).padStart(2, '0')}`, decade: 1980, eligibleSlots: [slot]
}));
const franchiseIds = candidates.map(candidate => candidate.franchiseId);
const manifest = {
 schemaVersion: 1, dataVersion: 'library-v1', sourceCommit: 'synthetic', candidates,
 franchises: franchiseIds.map(id => ({ id, name: `Club ${id}`, decades: [1980] })),
 chunks: {}, stadiums: syntheticStadiumSummaries(franchiseIds), simulationUrl: '', attributionUrl: '', showcaseUrl: '', archiveUrl: '',
 approximations: [], coverage: [], diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
 attribution: { title: '', credit: '', sourceUrl: '', license: '', licenseUrl: '', sourceCommit: '', changes: '', fullNotice: '' }
} as Manifest;

function complete(seed: number): Draft {
 let draft = selectHomeStadium(createDraft(manifest, seed), manifest, manifest.stadiums[0].ref.id);
 while (draft.picks.length < SLOTS.length) {
  draft = rollDraft(draft, manifest);
  const candidate = availableCandidates(draft, manifest)[0];
  draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
 }
 return draft;
}
const result = (wins: number) => ({ wins, losses: 162 - wins, runsFor: 700, runsAgainst: 600, batting: [], pitching: [] }) as unknown as SeasonResult;

describe('season library', () => {
 it('keeps one entry per completed draft, its first save date, and leaves the active save untouched', async () => {
  const { db } = await memoryDb();
  await persistDraft(db, complete(3), 'lineup');
  const before = await db.all('SELECT json FROM draft');
  const draft = complete(4);
  await saveSeason(db, draft, result(100), [], manifest, new Date('2026-01-01'));
  await saveSeason(db, draft, result(100), [], manifest, new Date('2026-02-01'));
  const { entries } = await loadLibrary(db, manifest);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ status: 'playable', record: { wins: 100, losses: 62 }, savedAt: '2026-01-01T00:00:00.000Z' });
  expect(entries[0].stadium?.id).toBe(manifest.stadiums[0].ref.id);
  expect(entries[0].roster.map(card => card.seasonId)).toEqual(draft.picks.map(pick => pick.seasonId));
  expect(await db.all('SELECT json FROM draft')).toEqual(before);
 });
 it('shows an old-model entry as retired but keeps its roster for display', async () => {
  const { db } = await memoryDb();
  await saveSeason(db, complete(5), result(90), [], manifest);
  await db.run([{ sql: "UPDATE seasons SET model_version = 'pa-v3', schema_version = 4" }]);
  const { entries } = await loadLibrary(db, manifest);
  expect(entries[0].status).toBe('retired');
  expect(entries[0].roster).toHaveLength(14);
  expect((await loadLibrary(db, { ...manifest, dataVersion: 'library-v2' })).entries[0].status).toBe('retired');
 });
 it('keeps every season, most recently saved first', async () => {
  const { db } = await memoryDb();
  for (let seed = 10; seed < 70; seed++) await saveSeason(db, complete(seed), result(seed), [], manifest, new Date(2026, 0, 1, 0, seed));
  const { entries } = await loadLibrary(db, manifest);
  expect(entries).toHaveLength(60);
  expect(entries[0].record.wins).toBe(69);
  expect(entries.at(-1)!.record.wins).toBe(10);
 });
 it('renames, keeps the nickname on a re-save, clears it, and deletes with its cards', async () => {
  const { db } = await memoryDb();
  const draft = complete(8);
  await saveSeason(db, draft, result(95), [], manifest);
  const key = (await loadLibrary(db, manifest)).entries[0].key;
  await renameSeason(db, key, '  The Machine  ');
  await saveSeason(db, draft, result(95), [], manifest);
  expect((await loadLibrary(db, manifest)).entries[0].nickname).toBe('The Machine');
  await renameSeason(db, key, '');
  expect((await loadLibrary(db, manifest)).entries[0].nickname).toBeUndefined();
  await deleteSeason(db, key);
  expect((await loadLibrary(db, manifest)).entries).toEqual([]);
  expect(await db.all('SELECT * FROM season_cards')).toEqual([]);
 });
 it('returns a notice instead of throwing when storage fails', async () => {
  await expect(saveSeason(brokenDb, complete(9), result(70), [], manifest)).resolves.toMatch('unavailable');
  await expect(loadLibrary(brokenDb, manifest)).resolves.toMatchObject({ entries: [], notice: expect.stringMatching('unavailable') });
 });
});
