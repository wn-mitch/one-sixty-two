import { compareId } from '../game/types.ts';
import { ownerOf } from './ledger.ts';
import { minimumCostAssignment } from './matching.ts';
import { canFill, DRAFT_RULES, effectiveCap, validateBudget, type DraftRules } from './rules.ts';
import type { DraftCard, DraftSlot, Ledger, LegalityFailure, LegalityReport, PayrollBudget, Submission } from './types.ts';
import { POOL_CONTRACT_VERSION } from './versions.ts';

/** A roster position: an active slot, or null for a reserve that any card may fill. */
export type RosterRow = DraftSlot | null;
export const rosterRows = (rules: DraftRules = DRAFT_RULES): RosterRow[] => [...rules.activeSlots, ...Array<null>(rules.reserves).fill(null)];

export const fits = (card: DraftCard, row: RosterRow): boolean => row === null || canFill(card, row);

export interface Arrangement {
 active: Partial<Record<DraftSlot, string>>;
 reserves: string[];
 /** Owned cards with no roster position. */
 surplus: string[];
 /** Rows left empty, active slots first. */
 open: RosterRow[];
}

const ACTIVE_WEIGHT = 1e6;
const RESERVE_WEIGHT = 1e4;

/**
 * Places owned cards to fill as many active slots as possible, then reserves, preferring higher
 * modeled value. Cards that do not fit are surplus.
 */
export function arrangeRoster(owned: readonly DraftCard[], rules: DraftRules = DRAFT_RULES): Arrangement {
 const cards = [...owned].sort((a, b) => compareId(a.seasonId, b.seasonId));
 const rows = rosterRows(rules);
 const assignment = minimumCostAssignment(rows.length, cards.length + rows.length, (row, column) => {
  if (column >= cards.length) return 0;
  const card = cards[column];
  if (!fits(card, rows[row])) return null;
  return -((rows[row] === null ? RESERVE_WEIGHT : ACTIVE_WEIGHT) + card.valueRuns);
 });
 if (!assignment) throw new Error('Roster arrangement has no assignment');
 const arrangement: Arrangement = { active: {}, reserves: [], surplus: [], open: [] };
 const placed = new Set<number>();
 rows.forEach((row, index) => {
  const column = assignment.column[index];
  if (column >= cards.length) { arrangement.open.push(row); return; }
  placed.add(column);
  if (row === null) arrangement.reserves.push(cards[column].seasonId);
  else arrangement.active[row] = cards[column].seasonId;
 });
 arrangement.surplus = cards.filter((_, index) => !placed.has(index)).map(card => card.seasonId);
 return arrangement;
}

const failureKey = (failure: LegalityFailure): string =>
 `${failure.code}|${'slot' in failure ? failure.slot : ''}|${'cardId' in failure ? failure.cardId : ''}`;

export const sortFailures = (failures: LegalityFailure[]): LegalityFailure[] => failures.sort((a, b) => compareId(failureKey(a), failureKey(b)));

/**
 * The legality predicate for a submitted roster: every active slot filled by an eligible card the
 * seat owns, exactly the reserve count, no card twice, and the payroll of all of them within the
 * effective cap. Cash is not an input.
 */
export function checkSubmission(submission: Submission, ledger: Ledger, budget: PayrollBudget, rules: DraftRules = DRAFT_RULES): LegalityReport {
 const failures: LegalityFailure[] = [...validateBudget(budget, rules)];
 const listed: string[] = [];
 for (const slot of rules.activeSlots) {
  const cardId = submission.active[slot];
  if (cardId === undefined) { failures.push({ code: 'missing-role', slot }); continue; }
  listed.push(cardId);
  const card = ledger.cards.get(cardId);
  if (card && !fits(card, slot)) failures.push({ code: 'ineligible-role', slot, cardId });
 }
 const extraSlots = Object.keys(submission.active).filter(slot => !(rules.activeSlots as readonly string[]).includes(slot));
 if (extraSlots.length) throw new Error(`Submission names unknown slots: ${extraSlots.join(', ')}`);
 if (submission.reserves.length !== rules.reserves) failures.push({ code: 'reserve-count', expected: rules.reserves, actual: submission.reserves.length });
 listed.push(...submission.reserves);
 let payroll = 0;
 const counted = new Set<string>();
 for (const cardId of listed) {
  if (counted.has(cardId)) { failures.push({ code: 'duplicate-card', cardId }); continue; }
  counted.add(cardId);
  if (!ledger.cards.has(cardId)) { failures.push({ code: 'unknown-card', cardId }); continue; }
  const owner = ownerOf(ledger, cardId);
  if (owner.kind !== 'roster' || owner.seat !== submission.seat) { failures.push({ code: 'not-owned', cardId, owner }); continue; }
  payroll += ledger.instances.get(cardId)!.startingSalary;
 }
 const cap = effectiveCap(budget);
 if (payroll > cap) failures.push({ code: 'over-cap', payroll, effectiveCap: cap, excess: payroll - cap });
 return { version: POOL_CONTRACT_VERSION, seat: submission.seat, legal: failures.length === 0, payroll, effectiveCap: cap, capRoom: cap - payroll, failures: sortFailures(failures) };
}

export function submissionFrom(seat: number, arrangement: Arrangement): Submission {
 return { seat, active: { ...arrangement.active }, reserves: [...arrangement.reserves] };
}
