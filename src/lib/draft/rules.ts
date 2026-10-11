import { MAX_SEASON_YEAR, MIN_SEASON_YEAR, SLOTS, type Slot } from '../game/types.ts';
import type { LegalityFailure, PayrollBudget } from './types.ts';
import { DRAFT_RULES_VERSION } from './versions.ts';

/**
 * Draft rules for the current contract. Every number here is a provisional balancing input that the
 * feasibility harness reports; none is a settled design decision.
 */
export type CubeRole = 'hitter' | 'SP' | 'CL' | 'BP';
export interface TierQuota { high: number; mid: number; base: number }

export interface DraftRules {
 readonly version: string;
 readonly provisional: boolean;
 readonly seats: number;
 readonly waves: number;
 readonly packSize: number;
 readonly collation: Readonly<TierQuota>;
 readonly activeSlots: readonly Slot[];
 readonly reserves: number;
 readonly minYear: number;
 readonly maxYear: number;
 readonly nominalCap: number;
 readonly commonSalaryMax: number;
 readonly cleanupKits: number;
 readonly cubeQuota: Readonly<Record<CubeRole, Readonly<TierQuota>>>;
 readonly cubePositionMinimum: number;
}

export const DRAFT_RULES: DraftRules = Object.freeze({
 version: DRAFT_RULES_VERSION,
 provisional: true,
 seats: 8,
 waves: 2,
 packSize: 8,
 /** Per pack: one high-tier, two mid-tier, five base cards. */
 collation: Object.freeze({ high: 1, mid: 2, base: 5 }),
 activeSlots: SLOTS,
 reserves: 2,
 minYear: MIN_SEASON_YEAR,
 maxYear: MAX_SEASON_YEAR,
 /** Salary units are $0.1M. */
 nominalCap: 1500,
 /** A cleanup-eligible common: base finish and salary at most this. */
 commonSalaryMax: 15,
 /** One full 16-card replacement roster per seat. */
 cleanupKits: 8,
 /**
  * Cube composition by role and pack tier. Bullpens are always base finish. Totals match the
  * collation: 16 high, 32 mid and 80 base cards; 72 hitters, 28 starters, 14 closers, 14 bullpens.
  */
 cubeQuota: Object.freeze({
  hitter: Object.freeze({ high: 10, mid: 18, base: 44 }),
  SP: Object.freeze({ high: 4, mid: 8, base: 16 }),
  CL: Object.freeze({ high: 2, mid: 6, base: 6 }),
  BP: Object.freeze({ high: 0, mid: 0, base: 14 })
 }),
 /** Hitters eligible at each fielding position, filled from base hitters before random draws. */
 cubePositionMinimum: 9
});

export const rosterSize = (rules: DraftRules): number => rules.activeSlots.length + rules.reserves;

/** The cheapest roster every budget must admit: a full roster of cleanup commons. */
export const guaranteePayroll = (rules: DraftRules): number => rosterSize(rules) * rules.commonSalaryMax;

export function baselineBudget(rules: DraftRules = DRAFT_RULES): PayrollBudget {
 return { nominalCap: rules.nominalCap, franchiseAdjustment: 0, obligations: 0, ceiling: null };
}

/** Obligations consume the adjusted cap; a ceiling bounds it directly. */
export function effectiveCap(budget: PayrollBudget): number {
 const adjusted = budget.nominalCap + budget.franchiseAdjustment - budget.obligations;
 return budget.ceiling === null ? adjusted : Math.min(adjusted, budget.ceiling);
}

/** A budget must always permit an affordable legal roster of commons. */
export function validateBudget(budget: PayrollBudget, rules: DraftRules = DRAFT_RULES): LegalityFailure[] {
 for (const value of [budget.nominalCap, budget.franchiseAdjustment, budget.obligations, budget.ceiling ?? 0]) {
  if (!Number.isSafeInteger(value)) throw new Error('Payroll budget values must be integer salary units');
 }
 const cap = effectiveCap(budget);
 const guarantee = guaranteePayroll(rules);
 return cap < guarantee ? [{ code: 'cap-below-guarantee', effectiveCap: cap, guarantee }] : [];
}
