import type { Finish } from '../cards/finish.ts';
import type { Slot } from '../game/types.ts';

export type PackTier = 'high' | 'mid' | 'base';

/**
 * One historical player-season as a draftable card. Immutable for a data and salary version.
 * Finish and pack tier are cosmetic; `valueRuns` is the modeled contribution; `salary` is the payroll cost.
 */
export interface DraftCard {
 readonly seasonId: string;
 readonly playerId: string;
 readonly franchiseId: string;
 readonly year: number;
 readonly eligibleSlots: readonly Slot[];
 readonly finish: Finish;
 readonly packTier: PackTier;
 /** Season runs above the slot's replacement level at the card's best eligible slot. */
 readonly valueRuns: number;
 readonly pricedSlot: Slot;
 readonly salary: number;
 /** Player-seasons that cannot share a run pool with this card: bullpen members and their bullpen. */
 readonly conflicts: readonly string[];
}

/** Where a run-owned card currently sits. Every card has exactly one owner at a time. */
export type Owner =
 | { kind: 'cube'; wave: number; pack: number }
 | { kind: 'cleanup-stock' }
 | { kind: 'unowned' }
 | { kind: 'released' }
 | { kind: 'roster'; seat: number };

export type LedgerOp = 'reserve-cube' | 'reserve-cleanup' | 'draft' | 'cut' | 'cleanup' | 'release' | 'claim';

export interface Provenance { op: LedgerOp; seat: number | null; seq: number }

/** A run-owned instance. Starting salary and original tier never change after creation. */
export interface CardInstance {
 readonly cardId: string;
 readonly startingSalary: number;
 readonly originalTier: Finish;
 provenance: Provenance[];
 /** Game index after which the card may be traded again; null when unrestricted. */
 tradeDeadline: number | null;
 owner: Owner;
}

export interface LedgerEvent { seq: number; op: LedgerOp; cardId: string; from: Owner; to: Owner }

export interface Ledger {
 readonly cards: ReadonlyMap<string, DraftCard>;
 readonly instances: Map<string, CardInstance>;
 readonly events: LedgerEvent[];
}

/** Payroll allowance inputs. Cash is deliberately absent: it cannot buy cap space. */
export interface PayrollBudget {
 nominalCap: number;
 franchiseAdjustment: number;
 obligations: number;
 ceiling: number | null;
}

export interface ClubAccount { budget: PayrollBudget; cash: number }

export interface Submission {
 seat: number;
 active: Partial<Record<Slot, string>>;
 reserves: string[];
}

export type LegalityFailure =
 | { code: 'unknown-card'; cardId: string }
 | { code: 'not-owned'; cardId: string; owner: Owner | null }
 | { code: 'duplicate-card'; cardId: string }
 | { code: 'missing-role'; slot: Slot }
 | { code: 'ineligible-role'; slot: Slot; cardId: string }
 | { code: 'reserve-count'; expected: number; actual: number }
 | { code: 'over-cap'; payroll: number; effectiveCap: number; excess: number }
 | { code: 'cap-below-guarantee'; effectiveCap: number; guarantee: number }
 | { code: 'duplicate-ownership'; cardId: string }
 | { code: 'bucket-mismatch'; cardId: string; expected: Owner; actual: Owner | null }
 | { code: 'bullpen-member-overlap'; cardId: string; conflict: string }
 | { code: 'fictional-card'; cardId: string }
 | { code: 'stock-role-shortfall'; slot: Slot | 'reserve'; needed: number; available: number }
 | { code: 'stock-unaffordable'; seat: number; minimumPayroll: number; effectiveCap: number }
 | { code: 'unrecoverable-seat'; seat: number; reason: string; failures: LegalityFailure[] };

export type LegalityCode = LegalityFailure['code'];

export interface LegalityReport {
 version: string;
 seat: number;
 legal: boolean;
 payroll: number;
 effectiveCap: number;
 capRoom: number;
 failures: LegalityFailure[];
}
