import { describe, expect, it } from 'vitest';
import { SLOTS, type Slot } from '../game/types.ts';
import { arrangeRoster, checkSubmission, minimumLegalPayroll, submissionFrom } from './legality.ts';
import { createLedger, transfer, UNOWNED } from './ledger.ts';
import { maximumMatching, matchedCount, minimumCostAssignment } from './matching.ts';
import { baselineBudget, effectiveCap, validateBudget } from './rules.ts';
import { testCard, TEST_ROLES } from './test-fixtures.ts';
import type { DraftCard, PayrollBudget } from './types.ts';

const roleOf = (slot: Slot): string => slot.startsWith('SP') ? 'SP' : slot === 'DH' ? 'C' : slot;

/** One card per active slot at `salary`, plus two reserves. */
function rosterCards(prefix: string, salary: number): DraftCard[] {
 const cards = SLOTS.map((slot, index) => testCard(`${prefix}${index}:2000`, TEST_ROLES[roleOf(slot)], salary));
 return [...cards, testCard(`${prefix}r1:2000`, TEST_ROLES.CF, salary), testCard(`${prefix}r2:2000`, TEST_ROLES.SP, salary)];
}

function ownedRoster(cards: DraftCard[], seat = 0) {
 const ledger = createLedger(cards);
 for (const card of cards) transfer(ledger, card.seasonId, UNOWNED, { kind: 'roster', seat }, 'draft');
 return { ledger, submission: submissionFrom(seat, arrangeRoster(cards)) };
}

describe('matching primitives', () => {
 it('finds an augmenting reassignment greedy order would miss', () => {
  expect(matchedCount(maximumMatching([[0, 1], [0]], 2))).toBe(2);
 });
 it('returns the minimum-cost complete assignment and rejects impossible ones', () => {
  expect(minimumCostAssignment(2, 3, (row, column) => [[4, 1, 3], [2, 0, 5]][row][column])?.total).toBe(3);
  expect(minimumCostAssignment(2, 2, (_, column) => column === 0 ? 1 : null)).toBeNull();
 });
});

describe('roster legality', () => {
 it('accepts a full owned roster within the cap and counts reserves in payroll', () => {
  const { ledger, submission } = ownedRoster(rosterCards('a', 50));
  const report = checkSubmission(submission, ledger, baselineBudget());
  expect(report).toMatchObject({ legal: true, payroll: 16 * 50, effectiveCap: 1500, capRoom: 700, failures: [] });
 });

 it('names each defect instead of relaxing the roster', () => {
  const cards = rosterCards('b', 5);
  const { ledger, submission } = ownedRoster(cards);
  const stranger = testCard('stranger:1999', TEST_ROLES.C);
  const foreign = createLedger([...cards, stranger]);
  for (const card of cards) transfer(foreign, card.seasonId, UNOWNED, { kind: 'roster', seat: 0 }, 'draft');
  const broken = { ...submission, active: { ...submission.active, C: 'stranger:1999', SS: submission.active.CL, '1B': undefined }, reserves: [submission.reserves[0], 'ghost:1900', submission.reserves[0]] };
  delete broken.active['1B'];
  const codes = checkSubmission(broken, foreign, baselineBudget()).failures.map(failure => failure.code);
  expect(codes).toEqual(['duplicate-card', 'duplicate-card', 'ineligible-role', 'missing-role', 'not-owned', 'reserve-count', 'unknown-card']);
  expect(checkSubmission(submission, ledger, baselineBudget()).legal).toBe(true);
 });

 it('applies franchise adjustments, obligations and ceilings to the cap, never cash', () => {
  const { ledger, submission } = ownedRoster(rosterCards('c', 90));
  const tight: PayrollBudget = { nominalCap: 1500, franchiseAdjustment: 100, obligations: 300, ceiling: 1400 };
  expect(effectiveCap(tight)).toBe(1300);
  expect(checkSubmission(submission, ledger, tight).failures).toEqual([{ code: 'over-cap', payroll: 1440, effectiveCap: 1300, excess: 140 }]);
  expect(checkSubmission(submission, ledger, { ...tight, ceiling: 1450, obligations: 0 }).legal).toBe(true);
  const account = { budget: tight, cash: 1_000_000 };
  expect(checkSubmission(submission, ledger, account.budget)).toEqual(checkSubmission(submission, ledger, tight));
  expect(validateBudget({ ...tight, ceiling: 200 }).map(failure => failure.code)).toEqual(['cap-below-guarantee']);
 });

 it('arranges active slots before reserves and leaves the rest as surplus', () => {
  const cards = [...rosterCards('d', 5), testCard('extra1:2000', TEST_ROLES.BP, 5), testCard('extra2:2000', TEST_ROLES.CL, 5)];
  const arrangement = arrangeRoster(cards);
  expect(Object.keys(arrangement.active)).toHaveLength(14);
  expect(arrangement.reserves).toHaveLength(2);
  expect(arrangement.surplus).toHaveLength(2);
  expect(arrangeRoster(cards.filter(card => !card.eligibleSlots.includes('CL'))).open).toEqual(['CL']);
 });

 it('finds the cheapest legal roster from owned and available cards', () => {
  const pricey = rosterCards('e', 100);
  const cheap = rosterCards('f', 5);
  expect(minimumLegalPayroll(pricey, cheap)).toBe(16 * 5);
  expect(minimumLegalPayroll(pricey.slice(0, 10), [])).toBeNull();
 });
});
