import { createHash } from 'node:crypto';
import { auditLedger, auditView, heldBy, transfer } from '../../src/lib/draft/ledger.ts';
import { buildRunPool, cubeRole, isCommon, type RunPool } from '../../src/lib/draft/pool.ts';
import { recoverOpeningRosters } from '../../src/lib/draft/recovery.ts';
import { DRAFT_RULES, baselineBudget } from '../../src/lib/draft/rules.ts';
import type { ClubAccount, DraftCard, LegalityFailure, Owner } from '../../src/lib/draft/types.ts';
import { PICK_POLICIES, runDraft, type PickPolicy } from './policies.ts';

export type PolicyMode = PickPolicy | 'mixed';
export const POLICY_MODES: readonly PolicyMode[] = [...PICK_POLICIES, 'mixed'];

/** Provisional franchise budget shapes; seats rotate through them by seed. Cash never reaches legality. */
const BUDGET_SHAPES: readonly ClubAccount[] = [
 { budget: baselineBudget(), cash: 0 },
 { budget: { ...baselineBudget(), franchiseAdjustment: 150 }, cash: 0 },
 { budget: { ...baselineBudget(), franchiseAdjustment: -150 }, cash: 0 },
 { budget: { ...baselineBudget(), obligations: 200 }, cash: 0 },
 { budget: { ...baselineBudget(), ceiling: 1200 }, cash: 0 },
 { budget: { ...baselineBudget(), franchiseAdjustment: -300 }, cash: 0 },
 { budget: baselineBudget(), cash: 10_000 },
 { budget: { ...baselineBudget(), franchiseAdjustment: 50 }, cash: 0 }
];

export function seatAccounts(seed: number): ClubAccount[] {
 return Array.from({ length: DRAFT_RULES.seats }, (_, seat) => structuredClone(BUDGET_SHAPES[(seat + seed) % BUDGET_SHAPES.length]));
}

export function seatPolicies(mode: PolicyMode): PickPolicy[] {
 return Array.from({ length: DRAFT_RULES.seats }, (_, seat) => mode === 'mixed' ? PICK_POLICIES[seat % PICK_POLICIES.length] : mode);
}

export interface SeatSummary {
 seat: number;
 policy: PickPolicy;
 cash: number;
 effectiveCap: number;
 postDraftPayroll: number;
 overCap: boolean;
 missing: number;
 surplus: number;
 surplusCuts: number;
 overCapCuts: number;
 cleanupPicks: number;
 finalPayroll: number | null;
 capRoom: number | null;
 minimumLegalPayroll: number | null;
 legal: boolean;
}

export interface RunRecord {
 seed: number;
 mode: PolicyMode;
 fingerprint: string;
 ms: number;
 cube: { size: number; roles: Record<string, number>; tiers: Record<string, number> };
 warnings: string[];
 failures: { stage: string; failure: LegalityFailure }[];
 seats: SeatSummary[];
 stockUsed: Record<string, number>;
}

const ownerKey = (owner: Owner): string => owner.kind === 'roster' ? `seat${owner.seat}` : owner.kind === 'cube' ? `cube${owner.wave}.${owner.pack}` : owner.kind;
const count = <T extends string>(values: T[]): Record<string, number> => values.reduce<Record<string, number>>((tally, value) => ({ ...tally, [value]: (tally[value] ?? 0) + 1 }), {});

function poolViews(pool: RunPool) {
 return [
  ...pool.packs.flatMap((packs, wave) => packs.flatMap((pack, index) => pack.map(cardId => ({ cardId, owner: { kind: 'cube', wave, pack: index } as Owner })))),
  ...pool.cleanupStock.map(cardId => ({ cardId, owner: { kind: 'cleanup-stock' } as Owner }))
 ];
}

/** One seeded run: pool, draft, opening recovery and submission, with ledger audits after each stage. */
export function executeRun(cards: readonly DraftCard[], seed: number, mode: PolicyMode): { record: RunRecord; pool: RunPool } {
 const started = performance.now();
 const failures: RunRecord['failures'] = [];
 const record = (stage: string, list: LegalityFailure[]) => failures.push(...list.map(failure => ({ stage, failure })));
 const pool = buildRunPool(seed, cards);
 record('pool', pool.failures);
 record('pool', auditLedger(pool.ledger));
 record('pool', auditView(pool.ledger, poolViews(pool)));
 const cube = pool.packs.flat(2).map(id => pool.ledger.cards.get(id)!);
 const policies = seatPolicies(mode);
 runDraft(pool, policies);
 record('draft', auditLedger(pool.ledger));
 const accounts = seatAccounts(seed);
 const result = recoverOpeningRosters(pool, accounts.map(account => account.budget));
 record('recovery', result.failures);
 record('recovery', auditLedger(pool.ledger));
 record('submission', auditView(pool.ledger, result.submissions.flatMap(submission => [...Object.values(submission.active), ...submission.reserves].map(cardId => ({ cardId: cardId!, owner: { kind: 'roster', seat: submission.seat } as Owner })))));
 const seats: SeatSummary[] = result.seats.map(seat => ({
  seat: seat.seat, policy: policies[seat.seat], cash: accounts[seat.seat].cash, effectiveCap: seat.effectiveCap,
  postDraftPayroll: seat.postDraft.payroll, overCap: seat.postDraft.overCap, missing: seat.postDraft.missing.length, surplus: seat.postDraft.surplus,
  surplusCuts: seat.cuts.filter(cut => cut.reason === 'surplus').length, overCapCuts: seat.cuts.filter(cut => cut.reason === 'over-cap').length,
  cleanupPicks: seat.cleanup.length, finalPayroll: seat.report?.payroll ?? null, capRoom: seat.report?.capRoom ?? null,
  minimumLegalPayroll: seat.minimumLegalPayroll, legal: seat.report?.legal === true && !result.failures.some(failure => failure.code === 'unrecoverable-seat' && failure.seat === seat.seat)
 }));
 const fingerprint = createHash('sha256').update(JSON.stringify({
  packs: pool.packs, stock: pool.cleanupStock,
  events: pool.ledger.events.map(event => [event.op, event.cardId, ownerKey(event.from), ownerKey(event.to)]),
  salaries: [...pool.ledger.instances.values()].map(instance => [instance.cardId, instance.startingSalary]),
  submissions: result.submissions
 })).digest('hex');
 return {
  pool,
  record: {
   seed, mode, fingerprint, ms: performance.now() - started,
   cube: { size: cube.length, roles: count(cube.map(cubeRole)), tiers: count(cube.map(card => card.packTier)) },
   warnings: pool.warnings, failures, seats,
   stockUsed: count(result.seats.flatMap(seat => seat.cleanup.map(pick => pick.row ?? 'reserve')))
  }
 };
}

export interface Proof { name: string; expected: string; observed: string[]; passed: boolean }

const codes = (run: RunRecord): string[] => [...new Set(run.failures.map(({ failure }) => failure.code === 'stock-role-shortfall' ? `${failure.code}:${failure.slot}` : failure.code))].sort();

/** Deliberately impossible fixtures that must fail by name, plus a release/claim identity check on real cards. */
export function negativeProofs(cards: readonly DraftCard[], seed: number): Proof[] {
 const proofs: Proof[] = [];
 const withoutCommonCatchers = cards.filter(card => !(card.eligibleSlots.includes('C') && isCommon(card)));
 const catchers = codes(executeRun(withoutCommonCatchers, seed, 'needs').record);
 proofs.push({ name: 'no common catchers', expected: 'stock-role-shortfall:C', observed: catchers, passed: catchers.includes('stock-role-shortfall:C') });
 const withoutCommonStarters = cards.filter(card => !(card.eligibleSlots.includes('SP1') && isCommon(card)));
 const starters = codes(executeRun(withoutCommonStarters, seed, 'needs').record);
 proofs.push({ name: 'no common starters', expected: 'stock-role-shortfall:SP1', observed: starters, passed: starters.includes('stock-role-shortfall:SP1') });

 const pool = buildRunPool(seed, cards);
 runDraft(pool, seatPolicies('value'));
 const budgets = seatAccounts(seed).map(account => account.budget);
 budgets[0] = { ...budgets[0], ceiling: 16 * DRAFT_RULES.commonSalaryMax - 1 };
 const starved = recoverOpeningRosters(pool, budgets);
 const observed = [...new Set(starved.failures.flatMap(failure => failure.code === 'unrecoverable-seat' ? [failure.code, ...failure.failures.map(inner => inner.code)] : [failure.code]))].sort();
 proofs.push({ name: 'cap below a common roster', expected: 'unrecoverable-seat + cap-below-guarantee', observed, passed: observed.includes('unrecoverable-seat') && observed.includes('cap-below-guarantee') && starved.failures.length === 1 });

 const transferPool = executeRun(cards, seed, 'value').pool;
 const cardId = heldBy(transferPool.ledger, { kind: 'roster', seat: 0 })[0];
 const instance = transferPool.ledger.instances.get(cardId)!;
 instance.tradeDeadline = 81;
 const before = { salary: instance.startingSalary, tier: instance.originalTier, history: instance.provenance.length };
 transfer(transferPool.ledger, cardId, { kind: 'roster', seat: 0 }, { kind: 'released' }, 'release');
 const claimed = transfer(transferPool.ledger, cardId, { kind: 'released' }, { kind: 'roster', seat: 1 }, 'claim');
 const preserved = claimed === instance && claimed.startingSalary === before.salary && claimed.originalTier === before.tier && claimed.tradeDeadline === 81 && claimed.provenance.length === before.history + 2;
 proofs.push({ name: 'release and claim keep identity', expected: 'same instance, salary, tier, deadline', observed: [String(preserved), ...auditLedger(transferPool.ledger).map(failure => failure.code)], passed: preserved && auditLedger(transferPool.ledger).length === 0 });
 return proofs;
}
