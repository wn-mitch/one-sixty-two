import { describe, expect, it } from 'vitest';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from './draft.ts';
import { deleteSeason, LIBRARY_KEY, LIBRARY_LIMIT, loadLibrary, renameSeason, saveSeason, type LibraryEntry } from './library.ts';
import { STORAGE_KEY } from './persistence.ts';
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

function memory() {
 const store = new Map<string, string>();
 return {
  store,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); }
 };
}

describe('season library', () => {
 it('keeps one entry per completed draft and leaves the active save untouched', async () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, 'active-run');
  const draft = complete(4);
  await saveSeason(storage, draft, result(100), [], manifest, new Date('2026-01-01'));
  await saveSeason(storage, draft, result(100), [], manifest, new Date('2026-02-01'));
  const { entries } = loadLibrary(storage, manifest);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ status: 'playable', record: { wins: 100, losses: 62 }, savedAt: '2026-01-01T00:00:00.000Z' });
  expect(entries[0].stadium?.id).toBe(manifest.stadiums[0].ref.id);
  expect(storage.getItem(STORAGE_KEY)).toBe('active-run');
 });
 it('shows an old-model entry as retired but keeps its roster for display', async () => {
  const storage = memory();
  await saveSeason(storage, complete(5), result(90), [], manifest);
  const [entry] = JSON.parse(storage.getItem(LIBRARY_KEY)!) as LibraryEntry[];
  storage.setItem(LIBRARY_KEY, JSON.stringify([{ ...entry, modelVersion: 'pa-v3', schemaVersion: 4 }]));
  const { entries } = loadLibrary(storage, manifest);
  expect(entries[0].status).toBe('retired');
  expect(entries[0].roster).toHaveLength(14);
  expect(loadLibrary(storage, { ...manifest, dataVersion: 'library-v2' }).entries[0].status).toBe('retired');
 });
 it('evicts the oldest unnamed entry at the cap, never a named one', async () => {
  const storage = memory();
  const base = (await (async () => { await saveSeason(storage, complete(6), result(80), [], manifest); return JSON.parse(storage.getItem(LIBRARY_KEY)!)[0] as LibraryEntry; })());
  const entries = Array.from({ length: LIBRARY_LIMIT }, (_, index) => ({ ...base, key: `k${index}`, savedAt: new Date(2026, 0, index + 1).toISOString() }));
  entries[0].nickname = 'Keep me';
  storage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  await saveSeason(storage, complete(7), result(81), [], manifest, new Date(2026, 5, 1));
  const keys = loadLibrary(storage, manifest).entries.map(entry => entry.key);
  expect(keys).toHaveLength(LIBRARY_LIMIT);
  expect(keys).toContain('k0');
  expect(keys).not.toContain('k1');
 });
 it('renames, clears a nickname, and deletes', async () => {
  const storage = memory();
  await saveSeason(storage, complete(8), result(95), [], manifest);
  const key = loadLibrary(storage, manifest).entries[0].key;
  renameSeason(storage, key, '  The Machine  ');
  expect(loadLibrary(storage, manifest).entries[0].nickname).toBe('The Machine');
  renameSeason(storage, key, '');
  expect(loadLibrary(storage, manifest).entries[0].nickname).toBeUndefined();
  deleteSeason(storage, key);
  expect(loadLibrary(storage, manifest).entries).toEqual([]);
 });
 it('returns a notice instead of throwing when storage is full', async () => {
  const storage = memory();
  storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  await expect(saveSeason(storage, complete(9), result(70), [], manifest)).resolves.toMatch('unavailable');
 });
});
