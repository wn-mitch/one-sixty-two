import { describe, expect, it } from 'vitest';
import { SLOTS } from '../game/types.ts';
import { auditLedger, createLedger, ownerOf, transfer, UNOWNED } from './ledger.ts';
import { buildRunPool, type RunPool } from './pool.ts';
import { recoverOpeningRosters } from './recovery.ts';
import { baselineBudget, DRAFT_RULES } from './rules.ts';
import { testCard, testUniverse, TEST_ROLES } from './test-fixtures.ts';
import type { DraftCard, PayrollBudget } from './types.ts';

const budgets = (count = 8, budget: PayrollBudget = baselineBudget()) => Array.from({ length: count }, () => ({ ...budget }));

/** Hands every cube card to a seat chosen by `seatFor`, as if drafted. */
function draftCube(pool: RunPool, seatFor: (card: DraftCard, index: number) => number): void {
 pool.packs.flat(2).map(id => pool.ledger.cards.get(id)!).forEach((card, index) => {
  transfer(pool.ledger, card.seasonId, ownerOf(pool.ledger, card.seasonId), { kind: 'roster', seat: seatFor(card, index) }, 'draft');
 });
}

describe('opening recovery', () => {
 it('repairs over-cap and missing-role drafts with real commons, cutting to the unowned pool', () => {
  const pool = buildRunPool(11, testUniverse(120));
  const cube = pool.packs.flat(2).map(id => pool.ledger.cards.get(id)!);
  const stars = cube.filter(card => card.packTier !== 'base').map(card => card.seasonId);
  const hitters = cube.filter(card => card.packTier === 'base' && card.eligibleSlots.includes('DH')).slice(0, 16).map(card => card.seasonId);
  draftCube(pool, (card, index) => stars.indexOf(card.seasonId) >= 0 && stars.indexOf(card.seasonId) < 16 ? 0 : hitters.includes(card.seasonId) ? 1 : 2 + index % 6);
  const result = recoverOpeningRosters(pool, budgets());
  expect(result.failures).toEqual([]);
  expect(result.seats[0].postDraft.overCap).toBe(true);
  expect(result.seats[0].cuts.some(cut => cut.reason === 'over-cap')).toBe(true);
  expect(result.seats[1].postDraft.missing).toEqual(expect.arrayContaining(['SP1', 'SP2', 'SP3', 'CL', 'BP']));
  expect(result.seats[1].cleanup.map(pick => pick.row)).toEqual(expect.arrayContaining(['SP1', 'SP2', 'SP3', 'CL', 'BP']));
  for (const seat of result.seats) {
   expect(seat.report).toMatchObject({ legal: true });
   expect(seat.report!.payroll).toBeLessThanOrEqual(seat.effectiveCap);
  }
  const cut = result.seats.flatMap(seat => seat.cuts.map(item => item.cardId));
  const cleaned = new Set(result.seats.flatMap(seat => seat.cleanup.map(item => item.cardId)));
  expect(cut.length).toBeGreaterThan(0);
  expect(cut.every(id => ownerOf(pool.ledger, id).kind === 'unowned' && !cleaned.has(id))).toBe(true);
  expect(auditLedger(pool.ledger)).toEqual([]);
 });

 it('does not let one seat take the only card another seat needs', () => {
  const rules = { ...DRAFT_RULES, seats: 2 };
  const fillers = SLOTS.map(slot => testCard(`fill-${slot}:2000`, slot === 'DH' ? TEST_ROLES.C : [slot]));
  const cards = [
   ...fillers, ...SLOTS.map(slot => testCard(`other-${slot}:2000`, [slot])),
   testCard('res1:2000', TEST_ROLES.SP), testCard('res2:2000', TEST_ROLES.SP), testCard('res3:2000', TEST_ROLES.SP),
   testCard('catcher:2000', ['C'], 5), testCard('outfielder:2000', ['CF'], 10)
  ];
  const ledger = createLedger(cards);
  const own = (id: string, seat: number) => transfer(ledger, id, UNOWNED, { kind: 'roster', seat }, 'draft');
  fillers.forEach(card => own(card.seasonId, 0));
  own('res1:2000', 0);
  SLOTS.filter(slot => slot !== 'C').forEach(slot => own(`other-${slot}:2000`, 1));
  own('res2:2000', 1); own('res3:2000', 1);
  for (const id of ['catcher:2000', 'outfielder:2000']) transfer(ledger, id, UNOWNED, { kind: 'cleanup-stock' }, 'reserve-cleanup');
  const pool: RunPool = { seed: 0, rules, ledger, packs: [], cleanupStock: ['catcher:2000', 'outfielder:2000'], universeSize: cards.length, warnings: [], failures: [] };
  const result = recoverOpeningRosters(pool, budgets(2));
  expect(result.failures).toEqual([]);
  expect(result.seats[0].cleanup).toEqual([{ cardId: 'outfielder:2000', row: null }]);
  expect(result.seats[1].cleanup).toEqual([{ cardId: 'catcher:2000', row: 'C' }]);
 });

 it('reports a role the stock cannot cover instead of inventing a player', () => {
  const pool = buildRunPool(11, testUniverse(120));
  draftCube(pool, card => card.eligibleSlots.includes('CL') ? 0 : 1 + card.seasonId.length % 7);
  for (const id of pool.cleanupStock.filter(id => pool.ledger.cards.get(id)!.eligibleSlots.includes('C'))) transfer(pool.ledger, id, { kind: 'cleanup-stock' }, UNOWNED, 'cut');
  const result = recoverOpeningRosters(pool, budgets());
  expect(result.failures.some(failure => failure.code === 'stock-role-shortfall' && failure.slot === 'C')).toBe(true);
  expect(result.failures.filter(failure => failure.code === 'unrecoverable-seat').length).toBeGreaterThan(0);
 });

 it('rejects a budget below the cost of a common roster', () => {
  const pool = buildRunPool(11, testUniverse(120));
  draftCube(pool, (_, index) => index % 8);
  const result = recoverOpeningRosters(pool, [{ ...baselineBudget(), ceiling: 200 }, ...budgets(7)]);
  const unrecoverable = result.failures.filter(failure => failure.code === 'unrecoverable-seat');
  expect(unrecoverable).toHaveLength(1);
  expect(unrecoverable[0]).toMatchObject({ seat: 0, failures: expect.arrayContaining([expect.objectContaining({ code: 'cap-below-guarantee' })]) });
  expect(result.seats.slice(1).every(seat => seat.report?.legal)).toBe(true);
 });
});
