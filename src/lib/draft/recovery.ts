import { compareId } from '../game/types.ts';
import { heldBy, transfer, UNOWNED } from './ledger.ts';
import { arrangeRoster, checkSubmission, fits, minimumLegalPayroll, rosterRows, sortFailures, type RosterRow } from './legality.ts';
import { maximumMatching, matchedCount } from './matching.ts';
import type { RunPool } from './pool.ts';
import { effectiveCap, validateBudget } from './rules.ts';
import type { DraftCard, LegalityFailure, LegalityReport, Owner, PayrollBudget, Submission } from './types.ts';

export interface SeatRecovery {
 seat: number;
 effectiveCap: number;
 postDraft: { cards: number; payroll: number; overCap: boolean; missing: RosterRow[]; surplus: number };
 /** Cheapest legal roster from the seat's draft plus the whole cleanup stock, ignoring other seats. */
 minimumLegalPayroll: number | null;
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
const STOCK: Owner = { kind: 'cleanup-stock' };

interface Demand { seat: number; row: number }

/**
 * Opening recovery after the shared draft, in contract order: cuts, common-only cleanup, legal
 * submission. The cut and pick choices are a deterministic stand-in policy; the rules they obey
 * are the contract. Cut cards return to the unowned universe and are never offered as cleanup.
 * A seat that cannot reach a legal roster is reported, never given a relaxed one.
 */
export function recoverOpeningRosters(pool: RunPool, budgets: readonly PayrollBudget[]): RecoveryResult {
 const { ledger, rules } = pool;
 if (budgets.length !== rules.seats) throw new Error(`Recovery needs ${rules.seats} budgets`);
 const card = (id: string): DraftCard => ledger.cards.get(id)!;
 const rows = rosterRows(rules);
 const result: RecoveryResult = { seats: [], submissions: [], failures: [] };
 const stockAtStart = heldBy(ledger, STOCK).map(card);
 const placements: (string | null)[][] = [];
 const blocked = new Map<number, LegalityFailure[]>();

 for (let seat = 0; seat < rules.seats; seat++) {
  const cap = effectiveCap(budgets[seat]);
  const owned = heldBy(ledger, roster(seat)).map(card);
  const arrangement = arrangeRoster(owned, rules);
  const payroll = owned.reduce((sum, item) => sum + ledger.instances.get(item.seasonId)!.startingSalary, 0);
  const minimum = minimumLegalPayroll(owned, stockAtStart, rules);
  const recovery: SeatRecovery = {
   seat, effectiveCap: cap,
   postDraft: { cards: owned.length, payroll, overCap: payroll > cap, missing: arrangement.open.filter(row => row !== null), surplus: arrangement.surplus.length },
   minimumLegalPayroll: minimum, cuts: [], cleanup: [], report: null
  };
  result.seats.push(recovery);
  const budgetFailures = validateBudget(budgets[seat], rules);
  // A missing role (null) surfaces as a named cleanup shortfall below; an unaffordable one cannot be repaired.
  if (minimum !== null && minimum > cap) budgetFailures.push({ code: 'stock-unaffordable', seat, minimumPayroll: minimum, effectiveCap: cap });
  if (budgetFailures.length) blocked.set(seat, budgetFailures);

  for (const cardId of arrangement.surplus) {
   transfer(ledger, cardId, roster(seat), UNOWNED, 'cut');
   recovery.cuts.push({ cardId, reason: 'surplus' });
  }
  const placed: (string | null)[] = rows.map(row => row === null ? null : arrangement.active[row] ?? null);
  arrangement.reserves.forEach((cardId, index) => { placed[rules.activeSlots.length + index] = cardId; });
  // Cut the most overpriced card until the open rows can be filled with commons under the cap.
  const keptPayroll = (): number => placed.reduce((sum, id) => sum + (id ? ledger.instances.get(id)!.startingSalary : 0), 0);
  const openRows = (): number => placed.filter(id => id === null).length;
  while (keptPayroll() + openRows() * rules.commonSalaryMax > cap && openRows() < rows.length) {
   const salary = (id: string): number => ledger.instances.get(id)!.startingSalary;
   const cutFirst = (a: string, b: string): number => salary(b) - salary(a) || card(a).valueRuns - card(b).valueRuns || compareId(a, b);
   const worst = placed.reduce((best, id, index) => id && (best < 0 || cutFirst(id, placed[best]!) < 0) ? index : best, -1);
   transfer(ledger, placed[worst]!, roster(seat), UNOWNED, 'cut');
   recovery.cuts.push({ cardId: placed[worst]!, reason: 'over-cap' });
   placed[worst] = null;
  }
  placements.push(placed);
 }

 // Cleanup: snake rounds over seats; no pick may reduce how much of the open demand the stock can serve.
 const stock = new Set(heldBy(ledger, STOCK));
 const demandRows = (): Demand[] => placements.flatMap((placed, seat) => blocked.has(seat) ? [] : placed.flatMap((id, row) => id === null ? [{ seat, row }] : []));
 const coverage = (demand: Demand[], cards: string[]): number => {
  const edges = demand.map(item => cards.flatMap((id, index) => fits(card(id), rows[item.row]) ? [index] : []));
  return matchedCount(maximumMatching(edges, cards.length));
 };
 const stuck = new Set<number>();
 for (let round = 0; demandRows().some(item => !stuck.has(item.seat)); round++) {
  const order = Array.from({ length: rules.seats }, (_, index) => round % 2 === 0 ? index : rules.seats - 1 - index);
  for (const seat of order) {
   const open = demandRows().filter(item => item.seat === seat);
   if (!open.length || stuck.has(seat)) continue;
   const available = [...stock].sort(compareId);
   const supply = (row: RosterRow) => available.filter(id => fits(card(id), row)).length;
   const byScarcity = [...open].sort((a, b) => supply(rows[a.row]) - supply(rows[b.row]) || a.row - b.row);
   // A pick is allowed only if the remaining demand can still be served as fully as before it.
   const coverable = coverage(demandRows(), available);
   let chosen: { demand: Demand; cardId: string } | null = null;
   for (const demand of byScarcity) {
    const candidates = available.filter(id => fits(card(id), rows[demand.row]))
     .sort((a, b) => card(a).salary - card(b).salary || card(a).eligibleSlots.length - card(b).eligibleSlots.length || compareId(a, b));
    for (const cardId of candidates) {
     const rest = demandRows().filter(item => item.seat !== demand.seat || item.row !== demand.row);
     if (coverage(rest, available.filter(id => id !== cardId)) >= coverable - 1) { chosen = { demand, cardId }; break; }
    }
    if (chosen) break;
   }
   if (!chosen) {
    stuck.add(seat);
    // Name the rows the stock cannot serve at all; if every row has supply, contention starved all of them.
    const empty = open.filter(demand => supply(rows[demand.row]) === 0);
    for (const demand of empty.length ? empty : open) {
     const row = rows[demand.row];
     result.failures.push({ code: 'stock-role-shortfall', slot: row ?? 'reserve', needed: 1, available: supply(row) });
    }
    continue;
   }
   transfer(ledger, chosen.cardId, STOCK, roster(seat), 'cleanup');
   stock.delete(chosen.cardId);
   placements[seat][chosen.demand.row] = chosen.cardId;
   result.seats[seat].cleanup.push({ cardId: chosen.cardId, row: rows[chosen.demand.row] });
  }
 }

 for (let seat = 0; seat < rules.seats; seat++) {
  const placed = placements[seat];
  const submission: Submission = {
   seat,
   active: Object.fromEntries(rules.activeSlots.flatMap((slot, index) => placed[index] ? [[slot, placed[index]]] : [])),
   reserves: placed.slice(rules.activeSlots.length).filter((id): id is string => id !== null)
  };
  const report = checkSubmission(submission, ledger, budgets[seat], rules);
  result.seats[seat].report = report;
  result.submissions.push(submission);
  const reasons = [...(blocked.get(seat) ?? []), ...report.failures];
  if (!report.legal || blocked.has(seat)) {
   result.failures.push({ code: 'unrecoverable-seat', seat, reason: blocked.has(seat) ? 'budget cannot admit a legal roster' : stuck.has(seat) ? 'cleanup stock exhausted' : 'submission is illegal', failures: sortFailures(reasons) });
  }
 }
 sortFailures(result.failures);
 return result;
}
