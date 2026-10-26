import { HITTER_SLOTS, POSITIONS, type Position, type Profile } from '../game/types.ts';
import { MAX_PARK_FAMILIARITY, type CrowdTrigger, type ParkPackage } from '../sim/league-types.ts';
import type { DraftSlot } from './types.ts';
import { gloveGrade, withSkill, type TrainingKind } from './training.ts';

/**
 * Franchise packages: economic, development or physical park perks a franchise brings to every
 * run, at any seat. A park condition applies to both clubs at the franchise's home games; its
 * strength lives in the engine (`engine/src/park_package.rs`), as does a crowd trigger's
 * (`engine/src/crowd.rs`). A franchise without an entry plays the ordinary rules. A package
 * earns an entry by being worth roughly five to ten wins a season to a roster built around it,
 * measured natively. A park package pairs its condition with a familiarity edge that grows
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
 /**
  * Fielding know-how: for each active fielder with a printed glove grade of at least `minGrade` at his slot,
  * every fielder's hit prevention rises by `perPlayer` at every game, up to `MAX_KNOW_HOW`.
  */
 knowHow?: { minGrade: number; perPlayer: number };
 /**
  * A free hitting training at each payday for every hitter who batted in that stop, its gain scaled
  * by `step` for each consecutive stop he has batted in, up to `max`.
  */
 ironMan?: { step: number; max: number };
}

/** The cap on a club's fielding know-how, in hit-prevention skill. */
export const MAX_KNOW_HOW = .18;

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
 ATL: { name: 'The Cherokee Commute', summary: 'A sweetheart stadium deal raises the salary cap by half. The park is a long drive out, so fewer fans come and the crowd leans less.', capShare: .5 },
 BAL: { name: 'Iron Man', summary: 'The cap is 10% tighter and the fans expect less. At every payday each hitter who batted in that stop gets a free hitting training, growing with each stop in a row he has played, up to ten stops.', capShare: -.1, ironMan: { step: .025, max: .25 } },
 KCR: { name: 'Royal Flush', summary: 'Kauffman is a casino. The cap is 10% tighter, but every home win pays 8 cash with the payday.', capShare: -.1, homeWinCash: 8 },
 OAK: { name: 'The House Always Wins', summary: 'The cap is 12% tighter, but every training costs 55% less.', capShare: -.12, trainingPrice: .45 },
 STL: { name: 'The Cardinal Way', summary: 'Fundamentals. For each active fielder with a glove grade of 60 or better at his position on the card, every fielder reaches balls a little quicker, home and away.', knowHow: { minGrade: 60, perPlayer: .025 } },
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

const isFieldingSlot = (slot: DraftSlot): slot is Position => (POSITIONS as readonly string[]).includes(slot);

/** How many of `roster`'s printed fielders grade at the franchise's know-how bar at their slots, or null when it has none. */
export function knowHowCount(franchiseId: string, roster: readonly { profile: Profile; slot: DraftSlot }[]): number | null {
 const knowHow = PACKAGES[franchiseId]?.knowHow;
 return knowHow ? roster.filter(({ profile, slot }) => isFieldingSlot(slot) && gloveGrade(profile, slot) >= knowHow.minGrade).length : null;
}

/** The franchise's fielding know-how with `roster` active: hit prevention every fielder gains. */
export const knowHowFor = (franchiseId: string, roster: readonly { profile: Profile; slot: DraftSlot }[]): number =>
 Math.min(MAX_KNOW_HOW, (knowHowCount(franchiseId, roster) ?? 0) * (PACKAGES[franchiseId]?.knowHow?.perPlayer ?? 0));

/** The card with `edge` more hit prevention at every position it fields. */
export function withKnowHow(profile: Profile, edge: number): Profile {
 if (!(edge > 0)) return profile;
 const positions = Object.fromEntries(Object.entries(profile.defense.positions).map(([position, skills]) => [position, withSkill(skills, 'hitPrevention', Math.min(1, skills.hitPrevention + edge))]));
 return { ...profile, defense: { ...profile.defense, positions } };
}

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
