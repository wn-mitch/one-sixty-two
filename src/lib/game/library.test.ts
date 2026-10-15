import { describe, expect, it } from 'vitest';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from './draft.ts';
import { deleteSeason, gameFeats, loadLibrary, renameSeason, saveSeason } from './library.ts';
import { persistDraft } from './persistence.ts';
import { brokenDb, memoryDb } from '../storage/test-db.ts';
import { readShop } from '../cosmetics/ledger.ts';
import { SLOTS, type Candidate, type Draft, type Manifest } from './types.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';
import type { SeasonResult } from '../sim/types.ts';

const candidates: Candidate[] = SLOTS.map((slot, index) => ({
 seasonId: `anon${index}:1982:AL:T${index}`, playerId: `anon${index}`, franchiseId: `F${String(index).padStart(2, '0')}`, decade: 1980, eligibleSlots: [slot]
}));
const franchiseIds = candidates.map(candidate => candidate.franchiseId);
const manifest = {
 jackpot: [],
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
const result = (wins: number) => ({ wins, losses: 162 - wins, runsFor: 700, runsAgainst: 600, batting: [], pitching: [], games: [] }) as unknown as SeasonResult;

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
  expect(entries[0].roster).toHaveLength(SLOTS.length);
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
 it('rewards only a complete 162-game result and keeps its receipt after deleting and resaving', async () => {
  const { db } = await memoryDb();
  const draft = complete(71);
  await saveSeason(db, draft, { ...result(100), losses: 61 }, [], manifest);
  expect((await readShop(db)).balance).toBe(0);
  await saveSeason(db, draft, result(100), [], manifest);
  await saveSeason(db, draft, result(100), [], manifest);
  expect((await readShop(db)).balance).toBe(1);
  const key = (await loadLibrary(db, manifest)).entries[0].key;
  await deleteSeason(db, key);
  expect((await readShop(db)).balance).toBe(1);
  await saveSeason(db, draft, result(100), [], manifest);
  expect((await readShop(db)).balance).toBe(1);
  await saveSeason(db, complete(72), result(90), [], manifest);
  expect((await readShop(db)).balance).toBe(2);
 });
 it('does not reward invalid records that happen to total 162', async () => {
  const { db } = await memoryDb();
  await saveSeason(db, complete(73), result(-1), [], manifest);
  await saveSeason(db, complete(74), result(100.5), [], manifest);
  expect((await readShop(db)).balance).toBe(0);
 });
 it('rolls back the season and collection when its reward receipt cannot be saved', async () => {
  const { db, raw } = await memoryDb();
  raw.exec({ sql: "CREATE TRIGGER refuse_reward BEFORE INSERT ON shop_completions BEGIN SELECT RAISE(ABORT, 'receipt unavailable'); END" });
  await expect(saveSeason(db, complete(75), result(100), [], manifest)).resolves.toContain('unavailable');
  expect((await loadLibrary(db, manifest)).entries).toEqual([]);
  expect(await db.all('SELECT * FROM rostered')).toEqual([]);
  expect((await readShop(db)).balance).toBe(0);
 });
 it('returns a notice instead of throwing when storage fails', async () => {
  await expect(saveSeason(brokenDb, complete(9), result(70), [], manifest)).resolves.toMatch('unavailable');
  await expect(loadLibrary(brokenDb, manifest)).resolves.toMatchObject({ entries: [], notice: expect.stringMatching('unavailable') });
 });
});

describe('game feats', () => {
 const arm = (seasonId: string, stats: { outs: number; H: number; R?: number; BB?: number; HBP?: number; BF?: number; SO?: number }) =>
  ({ seasonId, R: 0, BB: 0, HBP: 0, SO: 5, BF: stats.outs, ...stats });
 const bat = (seasonId: string, H: number, doubles: number, triples: number, HR: number) => ({ seasonId, H, doubles, triples, HR });
 const game = (isHome: boolean, pitching: ReturnType<typeof arm>[], batting: ReturnType<typeof bat>[] = []) => {
  const club = { pitching, batting }, other = { pitching: [arm('them', { outs: 27, H: 0, SO: 25 })], batting: [bat('them', 4, 1, 1, 1)] };
  return { isHome, home: isHome ? club : other, away: isHome ? other : club };
 };
 const feats = (games: ReturnType<typeof game>[]) => {
  const { batting, pitching } = gameFeats({ games } as unknown as Pick<SeasonResult, 'games'>);
  return { batting: Object.fromEntries(batting), pitching: Object.fromEntries(pitching) };
 };

 it('counts complete-game shutouts, no-hitters and perfect games, and 20-strikeout games, for the club only', () => {
  expect(feats([
   game(true, [arm('ace', { outs: 27, H: 0 })]), // perfect
   game(false, [arm('ace', { outs: 30, H: 0, BB: 2, BF: 32 })]), // extra-inning no-hitter with walks
   game(true, [arm('ace', { outs: 27, H: 0, R: 1, BF: 28 })]), // reached on error and scored: no-hitter, not perfect, not a shutout
   game(true, [arm('ace', { outs: 27, H: 4, BF: 31, SO: 20 })]), // four-hit shutout with 20 strikeouts
   game(true, [arm('ace', { outs: 24, H: 0 })]), // eight innings: nothing
   game(true, [arm('ace', { outs: 21, H: 0, SO: 21 }), arm('pen', { outs: 6, H: 0 })]), // combined: only the starter's 20-strikeout game
   game(false, [arm('ace', { outs: 27, H: 1, R: 1, BF: 28 })])
  ]).pitching).toEqual({
   ace: { noHitters: 3, perfectGames: 1, shutouts: 3, twentyStrikeoutGames: 2 }
  });
 });

 it('counts cycles and the most home runs in one game for the club\'s hitters', () => {
  expect(feats([
   game(true, [], [bat('lead', 4, 1, 1, 1), bat('slug', 4, 0, 0, 4)]), // natural cycle; four homers
   game(false, [], [bat('lead', 5, 2, 1, 1), bat('slug', 3, 0, 0, 3)]), // cycle with an extra double
   game(true, [], [bat('lead', 3, 1, 1, 1), bat('slug', 0, 0, 0, 0)]) // no single: no cycle
  ]).batting).toEqual({ lead: { cycles: 2, mostHomeRunsInGame: 1 }, slug: { cycles: 0, mostHomeRunsInGame: 4 } });
 });
});
