import { describe, expect, it } from 'vitest';
import { isCommon } from './cleanup.ts';
import { auditView } from './ledger.ts';
import { buildRunPool, pileHeldBy } from './pool.ts';
import { atLeast, DRAFT_RULES, picksPerSeat } from './rules.ts';
import { testUniverse } from './test-fixtures.ts';

describe('run pool', () => {
 const cards = testUniverse(120);
 const byId = new Map(cards.map(card => [card.seasonId, card]));
 const pool = buildRunPool(7, cards);

 it('deals two eight-card packs to every seat, each meeting its gold, silver and common floors', () => {
  expect(pool.failures).toEqual([]);
  expect(pool.warnings).toEqual([]);
  expect(pool.packs.map(packs => packs.map(pack => pack.length))).toEqual(Array(8).fill([8, 8]));
  const dealt = pool.packs.flat(2);
  expect(new Set(dealt).size).toBe(128);
  for (const pack of pool.packs.flat()) {
   const finishes = pack.map(id => byId.get(id)!.finish);
   expect(finishes.filter(finish => atLeast(finish, 'emboss')).length).toBeGreaterThanOrEqual(1);
   expect(finishes.filter(finish => atLeast(finish, 'foil')).length).toBeGreaterThanOrEqual(3);
  }
  expect(auditView(pool.ledger, pool.packs.flatMap((packs, pile) => packs.flat().map(cardId => ({ cardId, owner: { kind: 'pile', pile } as const }))))).toEqual([]);
 });

 it('upgrades floor slots at natural rates instead of holding every floor exactly', () => {
  // Strict floors would give exactly 48 silver-or-better cards; four in ten test cards are silver or better.
  const upgraded = pool.packs.flat(2).filter(id => atLeast(byId.get(id)!.finish, 'foil')).length;
  expect(upgraded).toBeGreaterThan(60);
  expect(pool.packs.flat(2).filter(id => byId.get(id)!.finish === 'base').length).toBeGreaterThan(0);
 });

 it('reproduces the pool from the seed', () => {
  expect(buildRunPool(7, cards).packs).toEqual(pool.packs);
  expect(buildRunPool(8, cards).packs).not.toEqual(pool.packs);
 });

 it('reprices each run within ten percent, keeps commons cleanup-priced, and scales the cap to the deal', () => {
  const priced = (id: string) => pool.ledger.cards.get(id)!.salary;
  const ratios = cards.map(card => priced(card.seasonId) / card.salary);
  expect(ratios.every((ratio, index) => cards[index].salary < 20 || (ratio >= 0.9 - 0.03 && ratio <= 1.1 + 0.03))).toBe(true);
  expect(ratios.some(ratio => ratio !== 1)).toBe(true);
  expect(cards.filter(card => card.finish === 'base' && card.salary <= DRAFT_RULES.commonSalaryMax).every(card => priced(card.seasonId) <= DRAFT_RULES.commonSalaryMax)).toBe(true);
  // Noise never makes a common: a base card priced just above the cleanup limit stays above it.
  const nearCommons = cards.filter(card => card.finish === 'base' && card.salary > DRAFT_RULES.commonSalaryMax && card.salary <= DRAFT_RULES.commonSalaryMax + 2);
  expect(nearCommons.length).toBeGreaterThan(0);
  expect(nearCommons.every(card => priced(card.seasonId) > DRAFT_RULES.commonSalaryMax)).toBe(true);
  expect(cards.every(card => priced(card.seasonId) >= DRAFT_RULES.minSalary)).toBe(true);
  // Another seed draws other prices.
  const other = buildRunPool(8, cards);
  expect(cards.some(card => other.ledger.cards.get(card.seasonId)!.salary !== priced(card.seasonId))).toBe(true);
  const dealt = pool.packs.flat(2).reduce((sum, id) => sum + priced(id), 0);
  expect(pool.tableCap).toBe(Math.round(DRAFT_RULES.capShare * dealt / DRAFT_RULES.seats));
 });

 it('names a role whose cleanup stack would be empty', () => {
  const withoutCatchers = cards.filter(card => !(card.eligibleSlots.includes('C') && isCommon(card)));
  expect(buildRunPool(7, withoutCatchers).failures).toEqual([{ code: 'stock-role-shortfall', slot: 'C' }]);
 });

 it('passes each pile left so every pile visits every seat twice', () => {
  expect(pileHeldBy(0, 1)).toBe(7);
  expect(pileHeldBy(1, 1)).toBe(0);
  const visits = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  for (let pick = 0; pick < picksPerSeat(DRAFT_RULES); pick++) {
   const held = Array.from({ length: 8 }, (_, seat) => pileHeldBy(seat, pick));
   expect(new Set(held).size).toBe(8);
   held.forEach((pile, seat) => { visits[pile][seat]++; });
  }
  expect(visits.flat().every(count => count === 2)).toBe(true);
 });
});
