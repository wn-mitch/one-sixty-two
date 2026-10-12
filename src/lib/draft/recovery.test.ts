import { describe, expect, it } from 'vitest';
import { createCleanupStacks, isCommon } from './cleanup.ts';
import { auditLedger, createLedger, ownerOf, transfer, UNOWNED } from './ledger.ts';
import { buildRunPool, type RunPool } from './pool.ts';
import { recoverOpeningRosters } from './recovery.ts';
import { baselineBudget } from './rules.ts';
import { testCard, testUniverse } from './test-fixtures.ts';
import type { DraftCard, PayrollBudget } from './types.ts';

const budgets = (count = 8, budget: PayrollBudget = baselineBudget(1500)) => Array.from({ length: count }, () => ({ ...budget }));

/** Hands every dealt card to a seat chosen by `seatFor`, as if drafted. */
function draftPiles(pool: RunPool, seatFor: (card: DraftCard, index: number) => number): void {
 pool.packs.flat(2).map(id => pool.ledger.cards.get(id)!).forEach((card, index) => {
  transfer(pool.ledger, card.seasonId, ownerOf(pool.ledger, card.seasonId), { kind: 'roster', seat: seatFor(card, index) }, 'draft');
 });
}

describe('cleanup stacks', () => {
 it('shows one top card per seat and role until it is taken, and never resurfaces a cut card', () => {
  const cards = [testCard('a:2000', ['C', 'DH']), testCard('b:2000', ['C', 'DH']), testCard('star:2000', ['C', 'DH'], 300, 'gem')];
  const ledger = createLedger(cards);
  const stacks = createCleanupStacks(3, ledger, cards);
  const top = stacks.peek(0, 'C')!;
  expect(['a:2000', 'b:2000']).toContain(top.seasonId);
  expect(stacks.peek(0, 'C')).toBe(top);
  transfer(ledger, top.seasonId, UNOWNED, { kind: 'roster', seat: 0 }, 'cleanup');
  transfer(ledger, top.seasonId, { kind: 'roster', seat: 0 }, UNOWNED, 'cut');
  const next = stacks.peek(0, 'C')!;
  expect(next.seasonId).not.toBe(top.seasonId);
  transfer(ledger, next.seasonId, UNOWNED, { kind: 'roster', seat: 0 }, 'cleanup');
  // The gem is never a cleanup card, and the cut common does not come back.
  expect(stacks.peek(0, 'C')).toBeNull();
  expect(stacks.peek(1, 'C')).toBeNull();
 });

 it('gives seats their own seeded stacks', () => {
  const cards = Array.from({ length: 200 }, (_, index) => testCard(`c${index}:2000`, ['C']));
  const stacks = createCleanupStacks(5, createLedger(cards), cards);
  const tops = Array.from({ length: 8 }, (_, seat) => stacks.peek(seat, 'C')!.seasonId);
  expect(new Set(tops).size).toBeGreaterThan(1);
  expect(createCleanupStacks(5, createLedger(cards), cards).peek(3, 'C')!.seasonId).toBe(tops[3]);
 });
});

describe('opening recovery', () => {
 it('repairs over-cap and missing-role drafts with real commons, cutting to the unowned pool', () => {
  const pool = buildRunPool(11, testUniverse(120));
  const dealt = pool.packs.flat(2).map(id => pool.ledger.cards.get(id)!);
  const stars = dealt.filter(card => card.finish !== 'base').slice(0, 16).map(card => card.seasonId);
  const hitters = dealt.filter(card => card.finish === 'base' && card.eligibleSlots.includes('DH')).slice(0, 16).map(card => card.seasonId);
  draftPiles(pool, (card, index) => stars.includes(card.seasonId) ? 0 : hitters.includes(card.seasonId) ? 1 : 2 + index % 6);
  const result = recoverOpeningRosters(pool, budgets());
  expect(result.failures).toEqual([]);
  expect(result.seats[0].postDraft.overCap).toBe(true);
  expect(result.seats[0].cuts.some(cut => cut.reason === 'over-cap')).toBe(true);
  expect(result.seats[1].postDraft.missing).toEqual(expect.arrayContaining(['SP1', 'SP2', 'SP3', 'CL', 'RP1', 'RP2', 'RP3', 'RP4', 'RP5']));
  expect(result.seats[1].cleanup.map(pick => pick.row)).toEqual(expect.arrayContaining(['SP1', 'SP2', 'SP3', 'CL', 'RP1', 'RP2', 'RP3', 'RP4', 'RP5']));
  for (const seat of result.seats) {
   expect(seat.report).toMatchObject({ legal: true });
   expect(seat.report!.payroll).toBeLessThanOrEqual(seat.effectiveCap);
   expect(seat.cleanup.every(pick => isCommon(pool.ledger.cards.get(pick.cardId)!))).toBe(true);
  }
  const cut = result.seats.flatMap(seat => seat.cuts.map(item => item.cardId));
  const cleaned = new Set(result.seats.flatMap(seat => seat.cleanup.map(item => item.cardId)));
  expect(cut.length).toBeGreaterThan(0);
  expect(cut.every(id => ownerOf(pool.ledger, id).kind === 'unowned' && !cleaned.has(id))).toBe(true);
  expect(auditLedger(pool.ledger)).toEqual([]);
 });

 it('reports a role no common can fill instead of inventing a player', () => {
  const cards = testUniverse(120).filter(card => !(card.eligibleSlots.includes('C') && isCommon(card)));
  const pool = buildRunPool(11, cards);
  draftPiles(pool, card => card.eligibleSlots.includes('C') ? 0 : 1 + card.seasonId.length % 7);
  const result = recoverOpeningRosters(pool, budgets());
  expect(result.failures).toEqual(expect.arrayContaining([{ code: 'stock-role-shortfall', slot: 'C' }]));
  expect(result.failures.filter(failure => failure.code === 'unrecoverable-seat').length).toBeGreaterThan(0);
 });

 it('rejects a budget below the cost of a common roster', () => {
  const pool = buildRunPool(11, testUniverse(120));
  draftPiles(pool, (_, index) => index % 8);
  const result = recoverOpeningRosters(pool, [{ ...baselineBudget(1500), ceiling: 200 }, ...budgets(7)]);
  const unrecoverable = result.failures.filter(failure => failure.code === 'unrecoverable-seat');
  expect(unrecoverable).toHaveLength(1);
  expect(unrecoverable[0]).toMatchObject({ seat: 0, failures: expect.arrayContaining([expect.objectContaining({ code: 'cap-below-guarantee' })]) });
  expect(result.seats.slice(1).every(seat => seat.report?.legal)).toBe(true);
 });
});
