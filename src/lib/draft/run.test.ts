import { describe, expect, it } from 'vitest';
import { chooseAiPick, scorePile } from './ai.ts';
import { RIVALS, seatTable } from './franchises.ts';
import { auditLedger } from './ledger.ts';
import { applyAction, heldPile, newRunSetup, ownedBy, replayRun, RunActionError, startRun, type DraftRun } from './run.ts';
import { baselineBudget } from './rules.ts';
import { playDraft, testCard, testUniverse, TEST_ROLES } from './test-fixtures.ts';

const FRANCHISES = Object.keys(RIVALS);
const CARDS = testUniverse(120);

const eventsOf = (run: DraftRun) => run.pool.ledger.events.map(event => [event.op, event.cardId, JSON.stringify(event.to)]);

describe('table seating', () => {
 it('seats the player, a rival from their shortlist and six other distinct franchises', () => {
  for (let seed = 0; seed < 40; seed++) {
   const table = seatTable(seed, 'CHC', FRANCHISES, 8);
   expect(new Set(table.seats).size).toBe(8);
   expect(table.seats[table.humanSeat]).toBe('CHC');
   expect(RIVALS.CHC).toContain(table.rival);
   expect(table.seats).toContain(table.rival);
  }
  expect(new Set(Array.from({ length: 40 }, (_, seed) => seatTable(seed, 'CHC', FRANCHISES, 8).humanSeat)).size).toBeGreaterThan(4);
 });

 it('always gives a Mets player the Yankees and gives a rival-less franchise none', () => {
  for (let seed = 0; seed < 20; seed++) expect(seatTable(seed, 'NYM', FRANCHISES, 8).rival).toBe('NYY');
  expect(seatTable(3, 'SEA', FRANCHISES, 8).rival).toBeNull();
  expect(() => seatTable(3, 'XXX', FRANCHISES, 8)).toThrow('Unknown franchise');
 });
});

describe('AI general manager', () => {
 it('values a card by the change it makes to the roster, so a second closer is worth only a reserve share', () => {
  const closer = testCard('cl1:2000', TEST_ROLES.CL, 100);
  const better = { ...testCard('cl2:2000', TEST_ROLES.CL, 100), valueRuns: 40 };
  const catcher = { ...testCard('c1:2000', TEST_ROLES.C, 100), valueRuns: 20 };
  const personality = { archetype: 'balanced' as const, thrift: 1 };
  const scores = scorePile([better, catcher], [{ ...closer, valueRuns: 30 }], baselineBudget(), personality, () => 0);
  const byId = Object.fromEntries(scores.map(score => [score.cardId, score.marginal]));
  // A second closer still has an open setup slot, so it counts in full.
  expect(byId['cl2:2000']).toBe(40);
  expect(byId['c1:2000']).toBe(20);
  // With all three closer-capable slots filled, a fourth closer only reaches a reserve row.
  const pen = [30, 25, 20].map((value, index) => ({ ...testCard(`pen${index}:2000`, TEST_ROLES.CL, 100), valueRuns: value }));
  const [fourth] = scorePile([better], pen, baselineBudget(), personality, () => 0);
  expect(fourth.marginal).toBeCloseTo(20 + 0.25 * 20);
 });

 it('charges projected payroll over the cap at the seat thrift', () => {
  const star = { ...testCard('star:2000', TEST_ROLES.SS, 1400), valueRuns: 60 };
  const [loose] = scorePile([star], [], baselineBudget(), { archetype: 'balanced', thrift: 0.5 }, () => 0);
  const [tight] = scorePile([star], [], baselineBudget(), { archetype: 'balanced', thrift: 1.5 }, () => 0);
  // 1400 + 17 open rows at 15 = 1655, 155 over a 1500 cap, at 4 salary units per run.
  expect(loose.capPenalty).toBeCloseTo(155 / 4 * 0.5);
  expect(tight.capPenalty).toBeCloseTo(155 / 4 * 1.5);
  expect(chooseAiPick([{ ...loose, cardId: 'b', score: 1 }, { ...loose, cardId: 'a', score: 1 }]).cardId).toBe('a');
 });
});

describe('draft run', () => {
 const setup = newRunSetup(11, 'BOS', 'test-data');

 it('drafts all 128 cards from the held piles in sixteen rounds and audits clean', () => {
  const run = startRun(setup, CARDS, FRANCHISES);
  expect(heldPile(run)).toHaveLength(16);
  playDraft(run);
  expect(run.phase).toBe('window');
  expect(run.ticker).toHaveLength(128);
  expect(run.piles.every(pile => pile.length === 0)).toBe(true);
  for (let seat = 0; seat < 8; seat++) expect(ownedBy(run, seat)).toHaveLength(16);
  expect(auditLedger(run.pool.ledger)).toEqual([]);
  // AI picks explain themselves; the player's do not need to.
  expect(run.ticker.filter(pick => pick.seat !== run.seating.humanSeat).every(pick => pick.marginal !== null)).toBe(true);
 });

 it('rejects a card outside the player pile without changing the run', () => {
  const run = startRun(setup, CARDS, FRANCHISES);
  const elsewhere = heldPile(run, (run.seating.humanSeat + 1) % 8)[0].seasonId;
  expect(() => applyAction(run, { type: 'pick', cardId: elsewhere })).toThrow(RunActionError);
  expect(run.pick).toBe(0);
  expect(run.pool.ledger.events.filter(event => event.op === 'draft')).toEqual([]);
  playDraft(run);
  expect(() => applyAction(run, { type: 'pick', cardId: elsewhere })).toThrow('The draft is over');
 });

 it('replays the same table from the setup and action log, and a different choice changes rosters', () => {
  const first = startRun(setup, CARDS, FRANCHISES);
  const actions = playDraft(first);
  const again = replayRun(setup, actions, CARDS, FRANCHISES);
  expect(eventsOf(again)).toEqual(eventsOf(first));
  expect(again.ticker).toEqual(first.ticker);

  const other = startRun(setup, CARDS, FRANCHISES);
  playDraft(other, pile => pile.at(-1)!.seasonId);
  const human = first.seating.humanSeat;
  expect(ownedBy(other, human).map(card => card.seasonId)).not.toEqual(ownedBy(first, human).map(card => card.seasonId));
  expect(other.pool.packs).toEqual(first.pool.packs);
 });

 it('refuses a setup from other rules', () => {
  expect(() => startRun({ ...setup, rulesVersion: 'draft-d00' }, CARDS, FRANCHISES)).toThrow('draft rules draft-d00');
 });
});
