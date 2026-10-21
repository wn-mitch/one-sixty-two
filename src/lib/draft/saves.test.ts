import { describe, expect, it } from 'vitest';
import { memoryDb } from '../storage/test-db.ts';
import { RIVALS } from './franchises.ts';
import { applyAction, heldPile, newRunSetup, ownedBy, startRun, type DraftRun, type RunData } from './run.ts';
import { archiveRun, completedRuns, deleteRun, getRun, latestRun, resumeRun, saveRun } from './saves.ts';
import { arrangeRoster, submissionFrom } from './legality.ts';
import { startLeague } from './league.ts';
import { LEAGUE_CHAPTERS } from '../sim/league-types.ts';
import type { DraftSlot } from './types.ts';
import type { Db } from '../storage/sql.ts';
import { pickAction, playDraft, testUniverse } from './test-fixtures.ts';

const FRANCHISES = Object.keys(RIVALS);
const CARDS = testUniverse(120);
const DATA: RunData = { cards: CARDS, franchiseIds: FRANCHISES, parkFit: () => 0 };
const VERSION = 'test-data';
const setup = newRunSetup(29, 'NYM', VERSION);
/** The player always takes the most valuable card, so a resumed run must make the same choices. */
const best = (pile: ReturnType<typeof heldPile>) => [...pile].sort((a, b) => b.valueRuns - a.valueRuns || a.seasonId.localeCompare(b.seasonId))[0].seasonId;
const snapshot = (run: DraftRun) => ({ events: run.pool.ledger.events, ticker: run.ticker, phase: run.phase, pick: run.pick });

describe('draft run saves', () => {
 const straight = startRun(setup, DATA);
 playDraft(straight, best);

 it('resumes at every pick boundary and continues to the same table', async () => {
  const { db } = await memoryDb();
  for (let suspendAt = 0; suspendAt <= 16; suspendAt += 4) {
   const run = startRun(setup, DATA);
   while (run.pick < suspendAt) {
    applyAction(run, pickAction(run, best(heldPile(run))));
    expect(await saveRun(db, 'run-1', run, null, new Date(Date.UTC(2026, 0, 1, 0, suspendAt, run.pick)))).toBeNull();
   }
   if (suspendAt === 0) await saveRun(db, 'run-1', run);
   const saved = (await latestRun(db))!;
   expect(saved.actions).toHaveLength(suspendAt);
   const resumed = resumeRun(saved, DATA, VERSION);
   if (!resumed.ok) throw new Error(resumed.reason);
   expect(snapshot(resumed.run)).toEqual(snapshot(run));
   playDraft(resumed.run, best);
   expect(snapshot(resumed.run)).toEqual(snapshot(straight));
   await deleteRun(db, 'run-1');
  }
  expect(await latestRun(db)).toBeNull();
 });

 it('records the phase and returns the newest valid run', async () => {
  const { db } = await memoryDb();
  await saveRun(db, 'done', straight, null, new Date('2026-01-01T00:00:00Z'));
  await db.run([{ sql: "INSERT INTO draft_runs (id, created_at, updated_at, setup_json, actions_json, phase, season_json) VALUES ('broken', 'x', '2026-02-01T00:00:00Z', '{\"seed\":-1}', '[]', 'drafting', NULL)" }]);
  const saved = await latestRun(db);
  expect(saved?.id).toBe('done');
  expect(saved?.phase).toBe('window');
 });

 it('refuses runs from other versions or logs that no longer replay, with a reason', async () => {
  const { db } = await memoryDb();
  await saveRun(db, 'run', straight);
  const saved = (await latestRun(db))!;
  expect(resumeRun(saved, DATA, 'new-data')).toEqual({ ok: false, reason: expect.stringContaining('player data') });
  expect(resumeRun({ ...saved, setup: { ...saved.setup, salaryVersion: 'salary-old' } }, DATA, VERSION)).toEqual({ ok: false, reason: expect.stringContaining('salaries salary-old') });
  const tampered = { ...saved, actions: [{ type: 'pick' as const, cardId: 'not-a-card', slot: null }] };
  expect(resumeRun(tampered, DATA, VERSION)).toEqual({ ok: false, reason: expect.stringContaining('no longer replays') });
 });

 it('retires an incompatible resume once without deleting its history or another run', async () => {
  const { db } = await memoryDb();
  await saveRun(db, 'older', straight);
  const older = (await getRun(db, 'older'))!;
  await archiveRun(db, older);
  await saveRun(db, 'stale', straight);
  const saved = (await latestRun(db))!;
  expect(resumeRun(saved, DATA, 'new-data').ok).toBe(false);
  await archiveRun(db, saved);
  expect(await latestRun(db)).toBeNull();
  expect(await getRun(db, 'stale')).toEqual(saved);
  expect(await getRun(db, 'older')).toEqual(older);
 });

 it('does not retire a concurrent replacement of the observed run', async () => {
  const { db } = await memoryDb();
  const run = startRun(setup, DATA);
  await saveRun(db, 'run', run);
  const saved = (await latestRun(db))!;
  applyAction(run, pickAction(run, best(heldPile(run))));
  await saveRun(db, 'run', run);
  await archiveRun(db, saved);
  expect((await latestRun(db))?.actions).toHaveLength(1);
 });

 it('keeps completed runs for explicit history, and retains recovery when their final save fails', async () => {
  const { db } = await memoryDb();
  const run = startRun(setup, DATA);
  playDraft(run, best);
  applyAction(run, { type: 'autofix' });
  const { active, reserves } = submissionFrom(run.seating.humanSeat, arrangeRoster(ownedBy(run, run.seating.humanSeat)));
  applyAction(run, { type: 'submit', active: active as Record<DraftSlot, string>, reserves });
  const season = startLeague(run);
  await saveRun(db, 'run', run, season);
  season.chapters = Array.from({ length: LEAGUE_CHAPTERS }, () => ({ games: [], lines: [], carry: [] }));
  const failing: Db = { all: db.all, run: async () => { throw new Error('full'); } };
  expect(await saveRun(failing, 'run', run, season)).toContain('could not be saved');
  expect((await latestRun(db))?.season?.chapters).toHaveLength(0);
  expect(await saveRun(db, 'run', run, season)).toBeNull();
  expect(await latestRun(db)).toBeNull();
  const saved = (await getRun(db, 'run'))!;
  expect(saved.season?.chapters).toHaveLength(LEAGUE_CHAPTERS);
  expect(resumeRun(saved, DATA, VERSION).ok).toBe(true);
  expect(await completedRuns(db)).toEqual([saved]);
  await db.run([{ sql: "UPDATE draft_runs SET setup_json = json_set(setup_json, '$.dataVersion', 'retired-data') WHERE id = 'run'" }]);
  const retired = (await completedRuns(db))[0];
  expect(retired.id).toBe('run');
  expect(resumeRun(retired, DATA, VERSION).ok).toBe(false);
 });

 it('reports a blocked database without losing the run', async () => {
  const { brokenDb } = await import('../storage/test-db.ts');
  expect(await saveRun(brokenDb, 'run', straight)).toContain('could not be saved');
 });
});
