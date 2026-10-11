import { describe, expect, it } from 'vitest';
import { auditLedger, auditView, createLedger, heldBy, transfer, UNOWNED } from './ledger.ts';
import { testCard } from './test-fixtures.ts';
import type { Owner } from './types.ts';

const seat = (index: number): Owner => ({ kind: 'roster', seat: index });

describe('card ledger', () => {
 it('keeps one instance identity through cut, release and claim', () => {
  const ledger = createLedger([testCard('star:1990', ['SS', 'DH'], 300, 'gem')]);
  const drafted = transfer(ledger, 'star:1990', UNOWNED, seat(0), 'draft');
  drafted.tradeDeadline = 81;
  transfer(ledger, 'star:1990', seat(0), { kind: 'released' }, 'release');
  const claimed = transfer(ledger, 'star:1990', { kind: 'released' }, seat(3), 'claim');
  expect(claimed).toBe(drafted);
  expect(claimed).toMatchObject({ startingSalary: 300, originalTier: 'gem', tradeDeadline: 81, owner: seat(3) });
  expect(claimed.provenance.map(entry => [entry.op, entry.seat])).toEqual([['draft', 0], ['release', 0], ['claim', 3]]);
  transfer(ledger, 'star:1990', seat(3), UNOWNED, 'cut');
  expect(ledger.instances.get('star:1990')?.startingSalary).toBe(300);
  expect(auditLedger(ledger)).toEqual([]);
 });

 it('rejects a move from an owner that does not hold the card', () => {
  const ledger = createLedger([testCard('a:2001', ['C'])]);
  transfer(ledger, 'a:2001', UNOWNED, seat(1), 'draft');
  expect(() => transfer(ledger, 'a:2001', UNOWNED, seat(2), 'draft')).toThrow(/held by seat 1/);
  expect(() => transfer(ledger, 'nobody:1999', UNOWNED, seat(2), 'draft')).toThrow(/Unknown card/);
  expect(heldBy(ledger, seat(1))).toEqual(['a:2001']);
 });

 it('detects tampered owners, double-listed views and bullpen member overlap', () => {
  const ledger = createLedger([
   testCard('bullpen:1995:AL:NYA', ['BP'], 20, 'base', ['arm:1995']),
   testCard('arm:1995', ['CL'], 10, 'base', ['bullpen:1995:AL:NYA'])
  ]);
  transfer(ledger, 'bullpen:1995:AL:NYA', UNOWNED, seat(0), 'draft');
  transfer(ledger, 'arm:1995', UNOWNED, seat(1), 'draft');
  ledger.instances.get('arm:1995')!.owner = seat(0);
  const codes = auditLedger(ledger).map(failure => failure.code).sort();
  expect(codes).toEqual(['bucket-mismatch', 'bullpen-member-overlap']);
  const view = auditView(ledger, [{ cardId: 'arm:1995', owner: seat(0) }, { cardId: 'arm:1995', owner: seat(0) }, { cardId: 'ghost:2000', owner: seat(0) }]);
  expect(view.map(failure => failure.code)).toEqual(['duplicate-ownership', 'fictional-card']);
 });
});
