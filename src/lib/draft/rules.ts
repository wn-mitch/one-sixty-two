import type { Finish } from '../cards/finish.ts';
import { defaultReliefRoles, HITTER_SLOTS, MAX_SEASON_YEAR, MIN_SEASON_YEAR, STARTER_SLOTS, type ReliefAssignment, type Slot } from '../game/types.ts';
import type { DraftCard, DraftSlot, LegalityFailure, PayrollBudget } from './types.ts';
import { DRAFT_RULES_VERSION } from './versions.ts';

export type CubeRole = 'hitter' | 'SP' | 'CL';

/** Card finishes from common to gem; a pack slot's floor admits its finish and every higher one. */
export const FINISH_ORDER: readonly Finish[] = ['base', 'foil', 'emboss', 'gem'];
export const atLeast = (finish: Finish, floor: Finish): boolean => FINISH_ORDER.indexOf(finish) >= FINISH_ORDER.indexOf(floor);

/** Nine hitters, three starters, the closer and five named relievers. */
export const DRAFT_SLOTS: readonly DraftSlot[] = Object.freeze([...HITTER_SLOTS, ...STARTER_SLOTS, 'CL', 'RP1', 'RP2', 'RP3', 'RP4', 'RP5']);

/** The closer and five named relievers, in the order their relief roles are listed. */
export const DRAFT_BULLPEN_SLOTS = Object.freeze(['CL', 'RP1', 'RP2', 'RP3', 'RP4', 'RP5'] as const);
export type DraftBullpenSlot = typeof DRAFT_BULLPEN_SLOTS[number];
/** Slot defaults for a Draft Mode bullpen; roles reach the engine with Draft-first play (D03). */
export const DEFAULT_DRAFT_RELIEF_ROLES: readonly ReliefAssignment<DraftBullpenSlot>[] = Object.freeze(defaultReliefRoles(DRAFT_BULLPEN_SLOTS));

/** A card fills a named relief slot when it could close; every other slot follows the card's historical eligibility. */
export const canFill = (card: DraftCard, slot: DraftSlot): boolean => slot.startsWith('RP') ? card.eligibleSlots.includes('CL') : card.eligibleSlots.includes(slot as Slot);

/** `count` slots in every pack, each drawn uniformly from the cards at or above `floor`. */
export interface PackSlot { readonly floor: Finish; readonly count: number }

/**
 * Draft rules for the current contract. The table shape (eight seats, two eight-card packs each,
 * the pack floors and the pass order) is settled; the cap and common salary are provisional
 * balancing inputs that the feasibility harness reports.
 */
export interface DraftRules {
 readonly version: string;
 readonly provisional: boolean;
 readonly seats: number;
 /** Packs dealt to each seat; a seat cracks them all into one pile before its first pick. */
 readonly packsPerSeat: number;
 readonly packSize: number;
 readonly collation: readonly PackSlot[];
 readonly activeSlots: readonly DraftSlot[];
 readonly reserves: number;
 readonly minYear: number;
 readonly maxYear: number;
 readonly nominalCap: number;
 readonly commonSalaryMax: number;
}

export const DRAFT_RULES: DraftRules = Object.freeze({
 version: DRAFT_RULES_VERSION,
 provisional: true,
 seats: 8,
 packsPerSeat: 2,
 packSize: 8,
 /**
  * Per pack: a gold-or-gem slot, two silver-or-better slots and five common-or-better slots. Upgrades
  * come at the pool's natural rates, so a table of 16 packs averages about 10 gems, 27 golds, 41
  * silvers and 49 commons.
  */
 collation: Object.freeze([
  Object.freeze({ floor: 'emboss', count: 1 }),
  Object.freeze({ floor: 'foil', count: 2 }),
  Object.freeze({ floor: 'base', count: 5 })
 ]),
 activeSlots: DRAFT_SLOTS,
 reserves: 2,
 minYear: MIN_SEASON_YEAR,
 maxYear: MAX_SEASON_YEAR,
 /** Salary units are $0.1M. Provisional until playtested. */
 nominalCap: 1500,
 /** Cleanup cards are commons: base finish and salary at most this, so any all-common roster fits the cap. */
 commonSalaryMax: 15
}) satisfies DraftRules;

/** Cards each seat drafts: its own packs' worth, taken one per pick from the passing piles. */
export const picksPerSeat = (rules: DraftRules): number => rules.packsPerSeat * rules.packSize;

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
