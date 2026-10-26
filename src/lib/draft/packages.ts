import type { TrainingKind } from './training.ts';

/**
 * Franchise packages: economic and development perks a franchise brings to every run, at any
 * seat. Physical park conditions and in-game crowd triggers are separate. A franchise without an
 * entry plays the ordinary rules. Every number is provisional; `design/draft-mode/catalog.md`
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
}

export const PACKAGES: Readonly<Record<string, FranchisePackage>> = {
 ATL: { name: 'The Cherokee Commute', summary: 'A sweetheart stadium deal pays for a salary cap 15% above the table. The park is a long drive out: smaller, quieter crowds.', capShare: .15 },
 BAL: { name: 'Tight Spending Ceiling', summary: 'A cap 10% below the table, and fans who expect little and are easy to surprise.', capShare: -.1 },
 KCR: { name: 'Royal Flush', summary: 'Kauffman is a casino now. A cap 10% below the table, but every home win pays 1.5 extra development cash.', capShare: -.1, homeWinCash: 1.5 },
 OAK: { name: 'The House Always Wins', summary: 'Vegas runs lean: a cap 12% below the table, and every training costs a quarter less.', capShare: -.12, trainingPrice: .75 },
 STL: { name: 'The Cardinal Way', summary: 'Fundamentals: fielding and baserunning training gain half as much again.', trainingGain: { fielding: 1.5, baserunning: 1.5 } },
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
