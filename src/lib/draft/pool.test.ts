import { describe, expect, it } from 'vitest';
import { auditLedger, auditView } from './ledger.ts';
import { buildRunPool, cubeRole, isCommon, KIT_ROWS, packHolder } from './pool.ts';
import { DRAFT_RULES } from './rules.ts';
import { testUniverse } from './test-fixtures.ts';
import type { DraftCard } from './types.ts';

/** Bullpen i aggregates closer i, so the two may never share a pool. */
function conflictedUniverse(): DraftCard[] {
 const cards = testUniverse(120);
 const closers = cards.filter(card => card.pricedSlot === 'CL');
 const bullpens = cards.filter(card => card.pricedSlot === 'BP');
 const partner = new Map<string, string>();
 bullpens.forEach((bullpen, index) => { partner.set(bullpen.seasonId, closers[index].seasonId); partner.set(closers[index].seasonId, bullpen.seasonId); });
 return cards.map(card => partner.has(card.seasonId) ? { ...card, conflicts: [partner.get(card.seasonId)!] } : card);
}

describe('run pool', () => {
 const cards = conflictedUniverse();
 const pool = buildRunPool(7, cards);

 it('deals a 128-card cube in collated packs and a disjoint full-kit cleanup stock', () => {
  expect(pool.failures).toEqual([]);
  expect(pool.warnings).toEqual([]);
  const cube = pool.packs.flat(2);
  expect(cube).toHaveLength(128);
  expect(pool.cleanupStock).toHaveLength(DRAFT_RULES.cleanupKits * KIT_ROWS.length);
  expect(new Set([...cube, ...pool.cleanupStock]).size).toBe(256);
  const byId = new Map(cards.map(card => [card.seasonId, card]));
  for (const pack of pool.packs.flat()) {
   const tiers = pack.map(id => byId.get(id)!.packTier);
   expect([tiers.filter(t => t === 'high').length, tiers.filter(t => t === 'mid').length, tiers.filter(t => t === 'base').length]).toEqual([1, 2, 5]);
  }
  expect(cube.filter(id => cubeRole(byId.get(id)!) === 'BP')).toHaveLength(14);
  expect(pool.cleanupStock.every(id => isCommon(byId.get(id)!))).toBe(true);
  const views = [
   ...pool.packs.flatMap((packs, wave) => packs.flatMap((pack, index) => pack.map(cardId => ({ cardId, owner: { kind: 'cube', wave, pack: index } as const })))),
   ...pool.cleanupStock.map(cardId => ({ cardId, owner: { kind: 'cleanup-stock' } as const }))
  ];
  expect(auditView(pool.ledger, views)).toEqual([]);
 });

 it('never pools a bullpen with one of its members', () => {
  expect(auditLedger(pool.ledger)).toEqual([]);
 });

 it('reproduces the pool from the seed', () => {
  const again = buildRunPool(7, cards);
  expect(again.packs).toEqual(pool.packs);
  expect(again.cleanupStock).toEqual(pool.cleanupStock);
  expect(buildRunPool(8, cards).packs).not.toEqual(pool.packs);
 });

 it('names the missing role when commons cannot cover cleanup', () => {
  const withoutCatchers = cards.filter(card => !(card.eligibleSlots.includes('C') && isCommon(card)));
  expect(buildRunPool(7, withoutCatchers).failures).toEqual([{ code: 'stock-role-shortfall', slot: 'C', needed: 8, available: 0 }]);
 });

 it('passes left in the first wave and right in the second', () => {
  expect(packHolder(0, 0, 1)).toBe(7);
  expect(packHolder(0, 1, 1)).toBe(1);
  for (let pick = 0; pick < 8; pick++) for (const wave of [0, 1]) {
   expect(new Set(Array.from({ length: 8 }, (_, seat) => packHolder(seat, wave, pick))).size).toBe(8);
  }
 });
});
