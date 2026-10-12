import { compareId } from '../game/types.ts';
import { heldBy, transfer, UNOWNED } from './ledger.ts';
import { rolesFor } from './cleanup.ts';
import { arrangeRoster, checkSubmission, rosterRows, sortFailures, type RosterRow } from './legality.ts';
import type { RunPool } from './pool.ts';
import { effectiveCap, validateBudget } from './rules.ts';
import type { DraftCard, LegalityFailure, LegalityReport, Owner, PayrollBudget, Submission } from './types.ts';

export interface SeatRecovery {
 seat: number;
 effectiveCap: number;
 postDraft: { cards: number; payroll: number; overCap: boolean; missing: RosterRow[]; surplus: number };
 cuts: { cardId: string; reason: 'surplus' | 'over-cap' }[];
 cleanup: { cardId: string; row: RosterRow }[];
 report: LegalityReport | null;
}

export interface RecoveryResult {
 seats: SeatRecovery[];
 submissions: Submission[];
 failures: LegalityFailure[];
}

const roster = (seat: number): Owner => ({ kind: 'roster', seat });

/**
 * Opening recovery after the shared draft, in contract order: cuts, common-only cleanup, legal
 * submission. Cleanup takes the visible top card of the seat's stack for each open row; a reserve
 * takes the most valuable top card across the seat's stacks. The cut and pick choices are a
 * deterministic stand-in policy; the rules they obey are the contract. Cut cards return to the
 * unowned universe and never resurface on a cleanup stack. A seat that cannot reach a legal roster
 * is reported, never given a relaxed one.
 */
export function recoverOpeningRosters(pool: RunPool, budgets: readonly PayrollBudget[]): RecoveryResult {
 const { ledger, rules, cleanup } = pool;
 if (budgets.length !== rules.seats) throw new Error(`Recovery needs ${rules.seats} budgets`);
 const card = (id: string): DraftCard => ledger.cards.get(id)!;
 const salary = (id: string): number => ledger.instances.get(id)!.startingSalary;
 const rows = rosterRows(rules);
 const result: RecoveryResult = { seats: [], submissions: [], failures: [] };

 for (let seat = 0; seat < rules.seats; seat++) {
  const cap = effectiveCap(budgets[seat]);
  const owned = heldBy(ledger, roster(seat)).map(card);
  const arrangement = arrangeRoster(owned, rules);
  const payroll = owned.reduce((sum, item) => sum + salary(item.seasonId), 0);
  const recovery: SeatRecovery = {
   seat, effectiveCap: cap,
   postDraft: { cards: owned.length, payroll, overCap: payroll > cap, missing: arrangement.open.filter(row => row !== null), surplus: arrangement.surplus.length },
   cuts: [], cleanup: [], report: null
  };
  result.seats.push(recovery);
  const budgetFailures = validateBudget(budgets[seat], rules);

  for (const cardId of arrangement.surplus) {
   transfer(ledger, cardId, roster(seat), UNOWNED, 'cut');
   recovery.cuts.push({ cardId, reason: 'surplus' });
  }
  const placed: (string | null)[] = rows.map(row => row === null ? null : arrangement.active[row] ?? null);
  arrangement.reserves.forEach((cardId, index) => { placed[rules.activeSlots.length + index] = cardId; });
  // Cut the most overpriced card until the open rows can be filled with commons under the cap.
  const keptPayroll = (): number => placed.reduce((sum, id) => sum + (id ? salary(id) : 0), 0);
  const openRows = (): number => placed.filter(id => id === null).length;
  while (!budgetFailures.length && keptPayroll() + openRows() * rules.commonSalaryMax > cap && openRows() < rows.length) {
   const cutFirst = (a: string, b: string): number => salary(b) - salary(a) || card(a).valueRuns - card(b).valueRuns || compareId(a, b);
   const worst = placed.reduce((best, id, index) => id && (best < 0 || cutFirst(id, placed[best]!) < 0) ? index : best, -1);
   transfer(ledger, placed[worst]!, roster(seat), UNOWNED, 'cut');
   recovery.cuts.push({ cardId: placed[worst]!, reason: 'over-cap' });
   placed[worst] = null;
  }

  const shortfalls: LegalityFailure[] = [];
  if (!budgetFailures.length) {
   placed.forEach((id, index) => {
    if (id !== null) return;
    const row = rows[index];
    const tops = rolesFor(row).flatMap(role => cleanup.peek(seat, role) ?? []);
    const best = tops.sort((a, b) => b.valueRuns - a.valueRuns || compareId(a.seasonId, b.seasonId))[0];
    if (!best) { shortfalls.push({ code: 'stock-role-shortfall', slot: row ?? 'reserve' }); return; }
    transfer(ledger, best.seasonId, UNOWNED, roster(seat), 'cleanup');
    placed[index] = best.seasonId;
    recovery.cleanup.push({ cardId: best.seasonId, row });
   });
  }
  result.failures.push(...shortfalls);

  const submission: Submission = {
   seat,
   active: Object.fromEntries(rules.activeSlots.flatMap((slot, index) => placed[index] ? [[slot, placed[index]]] : [])),
   reserves: placed.slice(rules.activeSlots.length).filter((id): id is string => id !== null)
  };
  const report = checkSubmission(submission, ledger, budgets[seat], rules);
  recovery.report = report;
  result.submissions.push(submission);
  if (!report.legal) {
   const reason = budgetFailures.length ? 'budget cannot admit a legal roster' : shortfalls.length ? 'a cleanup stack is empty' : 'submission is illegal';
   result.failures.push({ code: 'unrecoverable-seat', seat, reason, failures: sortFailures([...report.failures]) });
  }
 }
 sortFailures(result.failures);
 return result;
}
