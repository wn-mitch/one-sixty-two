import { describe, expect, it } from 'vitest';
import { memoryDb } from '../storage/test-db.ts';
import { RIVALS } from './franchises.ts';
import { applyAction, heldPile, newRunSetup, startRun, type DraftRun } from './run.ts';
import { deleteRun, latestRun, resumeRun, saveRun } from './saves.ts';
import { playDraft, testUniverse } from './test-fixtures.ts';

const FRANCHISES = Object.keys(RIVALS);
const CARDS = testUniverse(120);
const DATA = 'test-data';
const setup = newRunSetup(29, 'NYM', DATA);
/** The player always takes the most valuable card, so a resumed run must make the same choices. */
const best = (pile: ReturnType<typeof heldPile>) => [...pile].sort((a, b) => b.valueRuns - a.valueRuns || a.seasonId.localeCompare(b.seasonId))[0].seasonId;
const snapshot = (run: DraftRun) => ({ events: run.pool.ledger.events, ticker: run.ticker, phase: run.phase, pick: run.pick });

describe('draft run saves', () => {
 const straight = startRun(setup, CARDS, FRANCHISES);
 playDraft(straight, best);

 it('resumes at every pick boundary and continues to the same table', async () => {
  const { db } = await memoryDb();
  for (let suspendAt = 0; suspendAt <= 16; suspendAt += 4) {
   const run = startRun(setup, CARDS, FRANCHISES);
   while (run.pick < suspendAt) {
    applyAction(run, { type: 'pick', cardId: best(heldPile(run)) });
    expect(await saveRun(db, 'run-1', run, new Date(Date.UTC(2026, 0, 1, 0, suspendAt, run.pick)))).toBeNull();
   }
   if (suspendAt === 0) await saveRun(db, 'run-1', run);
   const saved = (await latestRun(db))!;
   expect(saved.actions).toHaveLength(suspendAt);
   const resumed = resumeRun(saved, CARDS, FRANCHISES, DATA);
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
  await saveRun(db, 'done', straight, new Date('2026-01-01T00:00:00Z'));
  await db.run([{ sql: "INSERT INTO draft_runs VALUES ('broken', 'x', '2026-02-01T00:00:00Z', '{\"seed\":-1}', '[]', 'drafting')" }]);
  const saved = await latestRun(db);
  expect(saved?.id).toBe('done');
  expect(saved?.phase).toBe('window');
 });

 it('refuses runs from other versions or logs that no longer replay, with a reason', async () => {
  const { db } = await memoryDb();
  await saveRun(db, 'run', straight);
  const saved = (await latestRun(db))!;
  expect(resumeRun(saved, CARDS, FRANCHISES, 'new-data')).toEqual({ ok: false, reason: expect.stringContaining('player data') });
  expect(resumeRun({ ...saved, setup: { ...saved.setup, salaryVersion: 'salary-old' } }, CARDS, FRANCHISES, DATA)).toEqual({ ok: false, reason: expect.stringContaining('salaries salary-old') });
  const tampered = { ...saved, actions: [{ type: 'pick' as const, cardId: 'not-a-card' }] };
  expect(resumeRun(tampered, CARDS, FRANCHISES, DATA)).toEqual({ ok: false, reason: expect.stringContaining('no longer replays') });
 });

 it('reports a blocked database without losing the run', async () => {
  const { brokenDb } = await import('../storage/test-db.ts');
  expect(await saveRun(brokenDb, 'run', straight)).toContain('could not be saved');
 });
});
