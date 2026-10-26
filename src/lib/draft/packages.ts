import { HITTER_SLOTS, type Profile } from '../game/types.ts';
import { MAX_PARK_FAMILIARITY, type CrowdTrigger, type ParkPackage } from '../sim/league-types.ts';
import type { DraftSlot } from './types.ts';
import type { TrainingKind } from './training.ts';

/**
 * Franchise packages: economic, development or physical park perks a franchise brings to every
 * run, at any seat. A park condition applies to both clubs at the franchise's home games; its
 * strength lives in the engine (`engine/src/park_package.rs`), as does a crowd trigger's
 * (`engine/src/crowd.rs`). A franchise without an entry plays the ordinary rules. A package
 * earns an entry by being worth roughly five to ten wins a season to a roster built around it,
 * measured natively; the cap, cash and training-price fields stay supported for packages being
 * reworked to that size. A park package pairs its condition with a familiarity edge that grows
 * with the active players who know the park. Every number is provisional; `design/draft-mode/catalog.md`
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
 /** Which active players know the home park, and the familiarity edge (`engine/src/park_package.rs`) each adds there. */
 familiar?: { rule: FamiliarRule; perPlayer: number };
 /** How the franchise's home crowd reacts during a game. */
 crowd?: CrowdTrigger;
}

/**
 * Who knows a home park, read from the printed card: left-handed or switch hitters, right-handed
 * hitters, hitters with 20 or more home runs, or pitchers with at least a strikeout an inning.
 */
export type FamiliarRule = 'leftyHitter' | 'rightyHitter' | 'slugger' | 'strikeoutPitcher';

const isHitterSlot = (slot: DraftSlot) => (HITTER_SLOTS as readonly string[]).includes(slot);
const FAMILIAR: Record<FamiliarRule, (profile: Profile, slot: DraftSlot) => boolean> = {
 leftyHitter: (profile, slot) => isHitterSlot(slot) && (profile.bats === 'L' || profile.bats === 'B'),
 rightyHitter: (profile, slot) => isHitterSlot(slot) && profile.bats === 'R',
 slugger: (profile, slot) => isHitterSlot(slot) && (profile.batting?.HR ?? 0) >= 20,
 strikeoutPitcher: (profile, slot) => !isHitterSlot(slot) && !!profile.pitching && profile.pitching.SO * 3 >= profile.pitching.IPouts
};

export const PACKAGES: Readonly<Record<string, FranchisePackage>> = {
 TEX: { name: 'The Ryan Express', summary: 'Strikeout-pitch training is on offer at every stop and gains half as much again.', trainingGain: { strikeout: 1.5 }, alwaysOffered: ['strikeout'] },
 CHC: { name: 'Home Run Happy Hour', summary: 'Every Cubs homer, home or away, fills the crowd\'s hype meter. At Wrigley, hype leans the strike zone their way; it fades a little after every game.', crowd: 'homeRunHappyHour' },
 CLE: { name: 'Guard the Lead', summary: 'Every scoreless inning in the field, home or away, fills the crowd\'s hype meter. At home, hype leans the strike zone their way; it fades a little after every game.', crowd: 'guardTheLead' },
 CHW: { name: 'Winning Ugly', summary: 'Every run scored in an inning without a homer fills the crowd\'s hype meter: walks, singles and hustle. At home, hype leans the strike zone their way; it fades a little after every game.', crowd: 'winningUgly' },
 LAD: { name: 'Front-Runners', summary: 'Every Dodgers win fills the crowd\'s hype meter, which fades a little after every game. At home, hype leans the strike zone their way, and the crowd roars louder with a lead and heads for the exits when trailing late. Fans are fair-weather.', crowd: 'frontRunners' },
 SDP: { name: 'Trevor Time', summary: 'Every time the closer enters to protect a lead, home or away, the crowd\'s hype meter jumps. At Petco, hype leans the strike zone their way; it fades a little after every game.', crowd: 'closingTime' },
 COL: { name: 'Mile High-er', summary: 'An earthquake raised Coors Field another 3,000 feet: fly balls carry for both clubs. Your sluggers know the air. For each active hitter with 20 or more homers on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'thinAir', familiar: { rule: 'slugger', perPlayer: .0025 } },
 SEA: { name: 'Marine Layer', summary: 'Heavy sea air kills carry for both clubs. Your strikeout arms know how to pitch in it. For each active pitcher with at least a strikeout an inning on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'heavyAir', familiar: { rule: 'strikeoutPitcher', perPlayer: .003 } },
 BOS: { name: 'The Greenest Monster', summary: 'The left-field wall has grown two and a half times taller, turning homers into doubles for both clubs. Your right-handed hitters know every dent. For each one active, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'tallLeftWall', familiar: { rule: 'rightyHitter', perPlayer: .0022 } },
 NYY: { name: 'The Shortest Porch', summary: 'Right field keeps creeping toward the plate, for both clubs. Your left-handed and switch hitters know it. For each one active, your batted balls come off the bat harder at home and the visitors\' softer. Fans are fair-weather.', park: 'shortRightField', familiar: { rule: 'leftyHitter', perPlayer: .0015 } },
 SFG: { name: 'Splash Zone', summary: 'A steady wind blows out toward McCovey Cove, carrying balls hit to right for both clubs. Your left-handed and switch hitters know it. For each one active, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'windToRight', familiar: { rule: 'leftyHitter', perPlayer: .0015 } },
 DET: { name: 'The Assembly Line', summary: 'Every training gains 5% more for each common on the active roster, up to 40%.', commonBoost: .05, commonBoostMax: .4 }
};

/** How many of `roster`'s printed cards know the franchise's home park, or null when the franchise has no such rule. */
export function familiarCount(franchiseId: string, roster: readonly { profile: Profile; slot: DraftSlot }[]): number | null {
 const rule = PACKAGES[franchiseId]?.familiar?.rule;
 return rule ? roster.filter(({ profile, slot }) => FAMILIAR[rule](profile, slot)).length : null;
}

/** The franchise's familiarity edge at its home games with `roster` active, up to the engine's cap. */
export const familiarityFor = (franchiseId: string, roster: readonly { profile: Profile; slot: DraftSlot }[]): number =>
 Math.min(MAX_PARK_FAMILIARITY, (familiarCount(franchiseId, roster) ?? 0) * (PACKAGES[franchiseId]?.familiar?.perPlayer ?? 0));

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
