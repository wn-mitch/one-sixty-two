import { describe, expect, it } from 'vitest';
import { countdown, dailyDate, dailySeed, dailyStadium, isDailyDate, nextDailyAt } from './daily.ts';
import { availableCandidates, commitPick, createDailyDraft, createDraft, legalSlots, replayInput, rollDraft, selectHomeStadium, validateDraft, validateReplay } from './draft.ts';
import { deleteSeason, loadLibrary, saveSeason } from './library.ts';
import { persistDraft, restoreDaily, restoreDraft } from './persistence.ts';
import { decodeReplay, encodeReplay } from './share.ts';
import { readShop } from '../cosmetics/ledger.ts';
import { memoryDb } from '../storage/test-db.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';
import { SLOTS, type Candidate, type Draft, type Manifest } from './types.ts';
import type { SeasonResult } from '../sim/types.ts';

const candidates: Candidate[] = SLOTS.map((slot, index) => ({
 seasonId: `anon${index}:1982:AL:T${index}`, playerId: `anon${index}`, franchiseId: `F${String(index).padStart(2, '0')}`, decade: 1980, eligibleSlots: [slot]
}));
const franchiseIds = candidates.map(candidate => candidate.franchiseId);
const manifest = {
 jackpot: [],
 schemaVersion: 1, dataVersion: 'daily-v1', sourceCommit: 'synthetic', candidates,
 franchises: franchiseIds.map(id => ({ id, name: `Club ${id}`, decades: [1980] })),
 chunks: {}, stadiums: syntheticStadiumSummaries(franchiseIds), simulationUrl: '', attributionUrl: '', showcaseUrl: '', archiveUrl: '',
 approximations: [], coverage: [], diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
 attribution: { title: '', credit: '', sourceUrl: '', license: '', licenseUrl: '', sourceCommit: '', changes: '', fullNotice: '' }
} as Manifest;

function finish(draft: Draft): Draft {
 while (draft.picks.length < SLOTS.length) {
  draft = rollDraft(draft, manifest);
  const candidate = availableCandidates(draft, manifest)[0];
  draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
 }
 return draft;
}
const result = (wins: number) => ({ wins, losses: 162 - wins, runsFor: 700, runsAgainst: 600, batting: [], pitching: [], games: [] }) as unknown as SeasonResult;

describe('daily calendar', () => {
 it('turns over at midnight in New York in both daylight and standard time', () => {
  expect(dailyDate(new Date('2026-10-18T03:59:59Z'))).toBe('2026-10-17');
  expect(dailyDate(new Date('2026-10-18T04:00:00Z'))).toBe('2026-10-18');
  expect(dailyDate(new Date('2026-12-01T04:59:59Z'))).toBe('2026-11-30');
  expect(dailyDate(new Date('2026-12-01T05:00:00Z'))).toBe('2026-12-01');
 });

 it('finds the next turnover across daylight-saving changes', () => {
  expect(nextDailyAt(new Date('2026-10-17T15:00:00Z')).toISOString()).toBe('2026-10-18T04:00:00.000Z');
  // The day standard time resumes runs 25 hours; the day daylight time starts runs 23.
  expect(nextDailyAt(new Date('2026-11-01T03:00:00Z')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
  expect(nextDailyAt(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-02T05:00:00.000Z');
  expect(nextDailyAt(new Date('2026-03-08T12:00:00Z')).toISOString()).toBe('2026-03-09T04:00:00.000Z');
  expect(countdown(new Date('2026-10-18T04:00:00Z'), new Date('2026-10-17T21:48:00Z'))).toBe('6h 12m');
 });

 it('accepts only real calendar dates', () => {
  expect(isDailyDate('2028-02-29')).toBe(true);
  expect(isDailyDate('2026-02-29')).toBe(false);
  expect(isDailyDate('2026-1-05')).toBe(false);
  expect(isDailyDate(20261017)).toBe(false);
 });

 it('gives every player the same seed and stadium for a day, whatever order the deck arrives in', () => {
  const reversed = { stadiums: [...manifest.stadiums].reverse() };
  expect(dailyStadium('2026-10-17', reversed).ref).toEqual(dailyStadium('2026-10-17', manifest).ref);
  expect(dailySeed('2026-10-17')).toBe(dailySeed('2026-10-17'));
  expect(dailySeed('2026-10-17')).not.toBe(dailySeed('2026-10-18'));
  const month = Array.from({ length: 30 }, (_, day) => dailyStadium(`2026-11-${String(day + 1).padStart(2, '0')}`, manifest).ref.id);
  expect(new Set(month).size).toBeGreaterThan(5);
 });
});

describe('daily draft', () => {
 it('pins the day’s seed and stadium and carries the date through the replay', () => {
  const draft = finish(createDailyDraft(manifest, '2026-10-17'));
  expect(draft.seed).toBe(dailySeed('2026-10-17'));
  expect(draft.homeStadium).toEqual(dailyStadium('2026-10-17', manifest).ref);
  expect(validateReplay(replayInput(draft), manifest).daily).toBe('2026-10-17');
  expect(decodeReplay(encodeReplay(draft), manifest).daily).toBe('2026-10-17');
  expect('daily' in replayInput(finish(selectHomeStadium(createDraft(manifest, 9), manifest, manifest.stadiums[0].ref.id)))).toBe(false);
 });

 it('rejects a daily mark on a draft without the day’s seed or stadium', () => {
  const draft = createDailyDraft(manifest, '2026-10-17');
  expect(() => validateDraft({ ...draft, daily: '2026-10-18' }, manifest)).toThrow();
  const elsewhere = manifest.stadiums.find(stadium => stadium.ref.id !== draft.homeStadium!.id)!;
  const moved = { ...draft, homeStadium: elsewhere.ref, actions: [{ type: 'select-stadium' as const, stadiumId: elsewhere.ref.id, stadiumVersion: elsewhere.ref.version }] };
  expect(() => validateDraft(moved, manifest)).toThrow();
  const classic = selectHomeStadium(createDraft(manifest, 9), manifest, draft.homeStadium!.id);
  expect(() => validateDraft({ ...classic, daily: '2026-10-17' }, manifest)).toThrow();
 });
});

describe('daily slot', () => {
 it('keeps the daily beside a Classic draft, spends the attempt on start, and keeps the result after the season is deleted', async () => {
  const { db } = await memoryDb();
  const date = '2026-10-17';
  const classic = selectHomeStadium(createDraft(manifest, 9), manifest, manifest.stadiums[0].ref.id);
  await persistDraft(db, classic, 'draft');
  expect(await restoreDaily(db, manifest, date)).toEqual({ kind: 'unplayed' });

  const started = createDailyDraft(manifest, date);
  await persistDraft(db, started, 'draft');
  expect(await restoreDaily(db, manifest, date)).toMatchObject({ kind: 'active', phase: 'draft', draft: { daily: date } });
  expect(await restoreDraft(db, manifest)).toMatchObject({ kind: 'valid', draft: { seed: 9 } });

  const done = finish(started);
  await persistDraft(db, done, 'results');
  await saveSeason(db, done, result(120), [], manifest);
  expect(await restoreDaily(db, manifest, date)).toEqual({ kind: 'complete', record: { wins: 120, losses: 42 } });
  // A late write from the finished run does not reopen the day.
  await persistDraft(db, done, 'results');
  expect((await restoreDaily(db, manifest, date)).kind).toBe('complete');

  const [entry] = (await loadLibrary(db, manifest)).entries;
  expect(entry.daily).toBe(date);
  await deleteSeason(db, entry.key);
  expect(await restoreDaily(db, manifest, date)).toEqual({ kind: 'complete', record: { wins: 120, losses: 42 } });
  expect(await restoreDraft(db, manifest)).toMatchObject({ kind: 'valid', draft: { seed: 9 } });
 });

 it('pays two tokens for a daily, once per day', async () => {
  const { db } = await memoryDb();
  // An earlier receipt rules out the first-season bonus, so only the daily's own tokens count.
  await db.run([{ sql: "INSERT INTO shop_completions (key, completed_at, credit) VALUES ('classic:older', 'earlier', 0)" }]);
  const done = finish(createDailyDraft(manifest, '2026-10-17'));
  await saveSeason(db, done, result(110), [], manifest);
  expect((await readShop(db)).balance).toBe(2);
  await saveSeason(db, done, result(110), [], manifest);
  expect((await readShop(db)).balance).toBe(2);
  await saveSeason(db, finish(createDailyDraft(manifest, '2026-10-18')), result(100), [], manifest);
  expect((await readShop(db)).balance).toBe(4);
 });

 it('starts the day over when its saved run no longer validates', async () => {
  const { db } = await memoryDb();
  await persistDraft(db, createDailyDraft(manifest, '2026-10-17'), 'draft');
  const run = await restoreDaily(db, { ...manifest, dataVersion: 'daily-v2' }, '2026-10-17');
  expect(run).toMatchObject({ kind: 'unplayed', notice: expect.stringContaining('starts over') });
  expect(await db.all('SELECT * FROM daily_runs')).toEqual([]);
 });
});
