import { describe, expect, it } from 'vitest';
import { canSign, conditionAt, marketPrice, PACK_SIZE } from './chapter.ts';
import { isCommon } from './cleanup.ts';
import { RIVALS } from './franchises.ts';
import { auditLedger } from './ledger.ts';
import { closeChapter, startLeague } from './league.ts';
import { tradeable, waiverCards } from './market.ts';
import { effectiveCap } from './rules.ts';
import { applyAction, newRunSetup, ownedBy, replayRun, RunActionError, startRun, windowLineup, type DraftRun, type RunData } from './run.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';
import type { ClubLineup } from './league.ts';
import { getRun, resumeRun, saveRun } from './saves.ts';
import { memoryDb } from '../storage/test-db.ts';

const DATA: RunData = { cards: testUniverse(160), franchiseIds: Object.keys(RIVALS), parkFit: () => 0 };
const setup = newRunSetup(53, 'BOS', 'test-data');
const others = (run: DraftRun) => run.seating.seats.map((_, seat) => seat).filter(seat => seat !== run.seating.humanSeat);
const ids = (run: DraftRun, seat: number) => ownedBy(run, seat).map(card => card.seasonId);

/** A run past its opening window, with the given opening actions applied first. */
function seasonRun(before: (run: DraftRun) => void = () => {}): DraftRun {
 const run = startRun(setup, DATA);
 playDraft(run);
 before(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 return run;
}
const order = (run: DraftRun) => run.seating.seats.map((_, seat) => seat).reverse();
const openChapter = (run: DraftRun, chapter = run.chapter + 1) => applyAction(run, { type: 'chapter', chapter, order: order(run), lineup: structuredClone(run.lineup!) });
function closeAndSubmit(run: DraftRun) {
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, { type: 'submit', lineup: windowLineup(run) as ClubLineup });
}

describe('chapter markets', () => {
 it('reopens the window with a ramped cap, the condition, and best-first packs of fresh cards in reverse standings order', () => {
  const run = seasonRun();
  const opening = effectiveCap(run.budgets[0]);
  openChapter(run);
  expect(run.phase).toBe('window');
  expect(run.chapter).toBe(1);
  expect(run.market!.game).toBe(27);
  expect(run.market!.priority).toEqual(order(run));
  expect(effectiveCap(run.budgets[0])).toBe(Math.round(opening * 1.03));
  const dealt = run.packs.flat();
  expect(run.packs.every(pack => pack.length === PACK_SIZE)).toBe(true);
  expect(new Set(dealt).size).toBe(dealt.length);
  for (const id of dealt) {
   expect(run.pool.ledger.instances.has(id)).toBe(false);
   expect(isCommon(run.pool.ledger.cards.get(id)!)).toBe(false);
  }
  // The club at the bottom of the standings sees the best card.
  const value = (id: string) => run.pool.ledger.cards.get(id)!.valueRuns;
  expect(value(run.packs[order(run)[0]][0])).toBe(Math.max(...dealt.map(value)));
  expect(conditionAt(53, 1)).toBe(conditionAt(53, 1));
  expect(() => openChapter(run, 2)).toThrow(RunActionError);
 });

 it('signs one pack card at its market price, which stays its salary', () => {
  const run = seasonRun();
  openChapter(run);
  const human = run.seating.humanSeat;
  const pick = run.packs[human].find(id => canSign(run, human, id))!;
  const price = marketPrice(run, run.pool.ledger.cards.get(pick)!);
  applyAction(run, { type: 'sign', cardId: pick });
  expect(ids(run, human)).toContain(pick);
  expect(run.pool.ledger.instances.get(pick)!.startingSalary).toBe(price);
  expect(ownedBy(run, human).find(card => card.seasonId === pick)!.salary).toBe(price);
  const second = run.packs[human].find(id => id !== pick)!;
  expect(() => applyAction(run, { type: 'sign', cardId: second })).toThrow('already signed');
  expect(() => applyAction(run, { type: 'sign', cardId: run.packs[others(run)[0]][0] })).toThrow(RunActionError);
  closeAndSubmit(run);
  expect(auditLedger(run.pool.ledger)).toEqual([]);
 });

 it('keeps an opening trade\'s cooldown through chapter 1 and a release and claim, and frees it at chapter 2', () => {
  let traded = '';
  const run = seasonRun(run => {
   const human = run.seating.humanSeat;
   for (const seat of others(run)) {
    const give = [...ownedBy(run, human)].sort((a, b) => b.valueRuns - a.valueRuns)[0].seasonId;
    const get = [...ownedBy(run, seat)].sort((a, b) => a.valueRuns - b.valueRuns)[0].seasonId;
    applyAction(run, { type: 'propose', seat, give: [give], get: [get] });
    if (run.market!.offers.at(-1)!.status === 'accepted') { traded = get; return; }
   }
  });
  expect(traded).not.toBe('');
  const human = run.seating.humanSeat;
  expect(ids(run, human)).toContain(traded);
  openChapter(run);
  expect(tradeable(run, traded)).toBe(false);
  applyAction(run, { type: 'cut', cardId: traded });
  expect(waiverCards(run)).toContain(traded);
  closeAndSubmit(run);
  expect(run.pool.ledger.instances.get(traded)!.tradeDeadline).toBe(54);
  openChapter(run);
  expect(run.market!.game).toBe(54);
  expect(tradeable(run, traded)).toBe(true);
 });

 it('has AI clubs sign at waivers in claim order, submits legal rosters, replays exactly and carries the new rosters into the season', () => {
  const run = seasonRun();
  const season = startLeague(run);
  openChapter(run);
  closeAndSubmit(run);
  const signed = run.signed.filter((id, seat) => id !== null && seat !== run.seating.humanSeat);
  expect(signed.length).toBeGreaterThan(0);
  for (let seat = 0; seat < 8; seat++) {
   const submission = run.submissions[seat]!;
   expect([...Object.values(submission.active), ...submission.reserves].sort()).toEqual(ids(run, seat).sort());
   expect(ownedBy(run, seat).reduce((sum, card) => sum + card.salary, 0)).toBeLessThanOrEqual(effectiveCap(run.budgets[seat]));
  }
  expect(auditLedger(run.pool.ledger)).toEqual([]);
  const again = replayRun(setup, run.actions, DATA);
  expect(again.pool.ledger.events).toEqual(run.pool.ledger.events);
  expect(again.signed).toEqual(run.signed);
  // The season takes the new rosters, and fans re-judge payrolls that changed.
  const before = structuredClone(season.fans);
  closeChapter(run, season);
  season.lineups.forEach((lineup, seat) => expect([...Object.values(lineup.active), ...lineup.reserves].sort()).toEqual(ids(run, seat).sort()));
  const changed = run.signed.findIndex(id => id !== null);
  expect(season.fans[changed].prior).not.toBe(before[changed].prior);
  expect(season.fans[changed].expectation - before[changed].expectation).toBeCloseTo(season.fans[changed].prior - before[changed].prior, 3);
 });
 it('resumes a run saved in the middle of a chapter market, signing included', async () => {
  const run = seasonRun();
  const season = startLeague(run);
  openChapter(run);
  const human = run.seating.humanSeat;
  const pick = run.packs[human].find(id => canSign(run, human, id));
  if (pick) applyAction(run, { type: 'sign', cardId: pick });
  const { db } = await memoryDb();
  await saveRun(db, 'run', run, season);
  const resumed = resumeRun((await getRun(db, 'run'))!, DATA, 'test-data');
  if (!resumed.ok) throw new Error(resumed.reason);
  expect(resumed.run.phase).toBe('window');
  expect(resumed.run.signed).toEqual(run.signed);
  expect(resumed.run.pool.ledger.events).toEqual(run.pool.ledger.events);
 });
});
