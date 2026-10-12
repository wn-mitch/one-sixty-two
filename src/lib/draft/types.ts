import type { Finish } from '../cards/finish.ts';
import type { Slot } from '../game/types.ts';

/** Draft Mode's two setup relievers, who take the 8th and 7th innings of close games ahead of the closer. */
export type SetupSlot = 'SU1' | 'SU2';
/** A Draft Mode active roster slot: every Classic slot plus the setup relievers. */
export type DraftSlot = Slot | SetupSlot;

/**
 * One historical player-season as a draftable card. Immutable for a data and salary version.
 * Finish sets the card's pack rarity; `valueRuns` is the modeled contribution; `salary` is the payroll cost.
 */
export interface DraftCard {
 readonly seasonId: string;
 readonly playerId: string;
 readonly franchiseId: string;
 readonly year: number;
 readonly eligibleSlots: readonly Slot[];
 readonly finish: Finish;
 /** Season runs above the slot's replacement level at the card's best eligible slot. */
 readonly valueRuns: number;
 readonly pricedSlot: Slot;
 readonly salary: number;
 /** Player-seasons that cannot share a run pool with this card: bullpen members and their bullpen. */
 readonly conflicts: readonly string[];
}

/** Where a run-owned card currently sits. Every card has exactly one owner at a time. */
export type Owner =
 /** An undrafted card in the pile first dealt to seat `pile`, wherever that pile has been passed. */
 | { kind: 'pile'; pile: number }
 | { kind: 'unowned' }
 | { kind: 'released' }
 | { kind: 'roster'; seat: number };

export type LedgerOp = 'deal' | 'draft' | 'cut' | 'cleanup' | 'release' | 'claim';

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
 active: Partial<Record<DraftSlot, string>>;
 reserves: string[];
}

export type LegalityFailure =
 | { code: 'unknown-card'; cardId: string }
 | { code: 'not-owned'; cardId: string; owner: Owner | null }
 | { code: 'duplicate-card'; cardId: string }
 | { code: 'missing-role'; slot: DraftSlot }
 | { code: 'ineligible-role'; slot: DraftSlot; cardId: string }
 | { code: 'reserve-count'; expected: number; actual: number }
 | { code: 'over-cap'; payroll: number; effectiveCap: number; excess: number }
 | { code: 'cap-below-guarantee'; effectiveCap: number; guarantee: number }
 | { code: 'duplicate-ownership'; cardId: string }
 | { code: 'bucket-mismatch'; cardId: string; expected: Owner; actual: Owner | null }
 | { code: 'bullpen-member-overlap'; cardId: string; conflict: string }
 | { code: 'fictional-card'; cardId: string }
 /** No common can fill this row from the seat's cleanup stacks. */
 | { code: 'stock-role-shortfall'; slot: DraftSlot | 'reserve' }
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
