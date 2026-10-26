import type { CrowdTrigger, ParkPackage } from '../sim/league-types.ts';
import type { TrainingKind } from './training.ts';

/**
 * Franchise packages: economic, development or physical park perks a franchise brings to every
 * run, at any seat. A park condition applies to both clubs at the franchise's home games; its
 * strength lives in the engine (`engine/src/park_package.rs`), as does a crowd trigger's
 * (`engine/src/crowd.rs`). A franchise without an entry plays the ordinary rules. A package
 * earns an entry by being worth roughly five to ten wins a season to a roster built around it,
 * measured natively; the cap, cash, training-price, park and crowd-trigger fields stay supported for
 * packages being reworked to that size. Every number is provisional; `design/draft-mode/catalog.md`
 * tracks which premises are active.
 */
export interface FranchisePackage {
 name: string;
 /** What the player is told when choosing the franchise. */
 summary: string;
 /** Change to the salary cap, as a share of the table cap. */
 capShare?: number;
 /** Multiplier on every training price. */
 trainingPrice?: number;
 /** Multiplier on the gain of the listed trainings. */
 trainingGain?: Partial<Record<TrainingKind, number>>;
 /** Trainings offered at every stop, on top of that stop's specials. */
 alwaysOffered?: readonly TrainingKind[];
 /** Extra training gain for each original-tier common on the active roster, up to `commonBoostMax`. */
 commonBoost?: number;
 commonBoostMax?: number;
 /** Cash for each home win, credited with the payday. */
 homeWinCash?: number;
 /** The exaggerated condition of the franchise's home park. */
 park?: ParkPackage;
 /** How the franchise's home crowd reacts during a game. */
 crowd?: CrowdTrigger;
}

export const PACKAGES: Readonly<Record<string, FranchisePackage>> = {
 TEX: { name: 'The Ryan Express', summary: 'Strikeout-pitch training is on offer at every stop and gains half as much again.', trainingGain: { strikeout: 1.5 }, alwaysOffered: ['strikeout'] },
 DET: { name: 'The Assembly Line', summary: 'Every training gains 5% more for each common on the active roster, up to 40%.', commonBoost: .05, commonBoostMax: .4 }
};

export const franchisePackage = (franchiseId: string): FranchisePackage | null => PACKAGES[franchiseId] ?? null;

/** The franchise's price for a training listed at `price`. */
export const trainingPriceFor = (franchiseId: string, price: number): number => Math.max(1, Math.round(price * (PACKAGES[franchiseId]?.trainingPrice ?? 1)));

/** The franchise's gain multiplier for `kind`, with `activeCommons` original-tier commons on its active roster. */
export function trainingGainFor(franchiseId: string, kind: TrainingKind, activeCommons: number): number {
 const pack = PACKAGES[franchiseId];
 if (!pack) return 1;
 const boost = pack.commonBoost ? Math.min(pack.commonBoostMax ?? Infinity, pack.commonBoost * activeCommons) : 0;
 return (pack.trainingGain?.[kind] ?? 1) * (1 + boost);
}
