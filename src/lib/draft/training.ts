import { HITTER_SLOTS, type DefensiveSkillName, type Position, type Profile, type Rates } from '../game/types.ts';
import { contactTargets } from '../sim/contact-profile.ts';

/**
 * Draft Mode development: what each training does to a card's profile. Every training moves one
 * skill part of the way from where the card is now to an elite ceiling, so gains shrink as that
 * skill improves and a card already at the ceiling gains nothing. Starting salary never changes.
 *
 * Ceilings are the 98th percentile (2nd for skills where lower is better) of draftable seasons with
 * at least 300 PA, 200 batters faced, 10 starts or 10 steal attempts, and of exact fielding
 * evidence at each position, in the current card data. Every number here is provisional.
 */
export const TRAINING_VERSION = 'training-v1' as const;

export const BASIC_KINDS = ['hitting', 'pitching', 'fielding', 'baserunning'] as const;
export const SPECIAL_KINDS = ['power', 'eye', 'contact', 'strikeout', 'control', 'keepInPark', 'stamina', 'recovery', 'hotBat', 'hotArm'] as const;
export type BasicKind = typeof BASIC_KINDS[number];
export type SpecialKind = typeof SPECIAL_KINDS[number];
export type TrainingKind = BasicKind | SpecialKind;

/** One bought training, kept with the card through trades; `stop` counts segments played when it was bought. */
export interface Upgrade { cardId: string; kind: TrainingKind; stop: number; paidBy: number; cost: number }

export interface TrainingInfo { name: string; detail: string; price: number; temporary: boolean }

/** Share of the gap to the ceiling one purchase closes. */
export const BASIC_GAIN = .15;
export const TARGETED_GAIN = .3;
export const HOT_GAIN = .4;
export const BASIC_PRICE = 10;

export const TRAININGS: Readonly<Record<TrainingKind, TrainingInfo>> = {
 hitting: { name: 'Hitting', detail: 'More walks and hits, fewer outs, in the hitter\'s own mix', price: BASIC_PRICE, temporary: false },
 pitching: { name: 'Pitching', detail: 'Fewer walks and hits allowed, in the pitcher\'s own mix', price: BASIC_PRICE, temporary: false },
 fielding: { name: 'Fielding', detail: 'Range, hands, double plays and arm at every position the card plays', price: BASIC_PRICE, temporary: false },
 baserunning: { name: 'Baserunning', detail: 'Speed on the bases and stolen-base success', price: BASIC_PRICE, temporary: false },
 power: { name: 'Power', detail: 'Turns outs into extra-base hits, chiefly homers', price: 14, temporary: false },
 eye: { name: 'Plate discipline', detail: 'Turns strikeouts and outs into walks', price: 14, temporary: false },
 contact: { name: 'Contact', detail: 'Turns strikeouts into balls in play', price: 14, temporary: false },
 strikeout: { name: 'Strikeout pitch', detail: 'Turns balls in play into strikeouts', price: 14, temporary: false },
 control: { name: 'Control', detail: 'Turns walks into balls in play', price: 14, temporary: false },
 keepInPark: { name: 'Keep it in the park', detail: 'Turns homers allowed into outs', price: 14, temporary: false },
 stamina: { name: 'Stamina', detail: 'A starter goes deeper into games', price: 12, temporary: false },
 recovery: { name: 'Recovery', detail: 'A reliever rests one game less after long outings and may pitch a third straight day', price: 12, temporary: false },
 hotBat: { name: 'Hot bat', detail: 'A big hitting jump for the next nine games only', price: 8, temporary: true },
 hotArm: { name: 'Hot arm', detail: 'A big pitching jump for the next nine games only', price: 8, temporary: true }
};

const WOBA = [.69, .72, 0, .88, 1.25, 1.58, 2.03, 0] as const;
const [BB, HBP, SO, SINGLE, DOUBLE, TRIPLE, HR, OUT] = [0, 1, 2, 3, 4, 5, 6, 7];
const ON_BASE = [BB, HBP, SINGLE, DOUBLE, TRIPLE, HR];
const IN_PLAY = [SINGLE, DOUBLE, TRIPLE, HR, OUT];
export const CEILINGS = {
 battingWoba: .4138, pitchingWoba: .2482,
 battingWalk: .1488, battingStrikeout: .1078, battingHomeRun: .0729,
 pitchingWalk: .0472, pitchingStrikeout: .3389, pitchingHomeRun: .0135,
 starterOuts: 24, speed: .981, stealSuccess: .865
} as const;
/** Elite fielding skill by position (98th percentile of exact evidence); a skill the position never uses is absent. */
export const FIELDING_CEILINGS: Readonly<Record<Position, Partial<Record<DefensiveSkillName, number>>>> = {
 C: { hitPrevention: .035, errorAvoidance: .3004, catcherThrowing: .5279 },
 '1B': { hitPrevention: .4496, doublePlay: .2413, errorAvoidance: .197 },
 '2B': { hitPrevention: .2651, doublePlay: .2946, errorAvoidance: .3976 },
 '3B': { hitPrevention: .5247, doublePlay: .4932, errorAvoidance: .6423 },
 SS: { hitPrevention: .2776, doublePlay: .309, errorAvoidance: .5659 },
 LF: { hitPrevention: .4064, outfieldThrowing: .8529, errorAvoidance: .3098 },
 CF: { hitPrevention: .2308, outfieldThrowing: .9752, errorAvoidance: .2711 },
 RF: { hitPrevention: .3914, outfieldThrowing: .8116, errorAvoidance: .31 }
};
/** Median fielding skill by position, for the shop's 0-100 glove scale (50 median, 100 elite). */
const FIELDING_MEDIANS: Readonly<Record<Position, Partial<Record<DefensiveSkillName, number>>>> = {
 C: { hitPrevention: -.0001, errorAvoidance: .0222, catcherThrowing: .0095 },
 '1B': { hitPrevention: -.0187, doublePlay: -.003, errorAvoidance: .0086 },
 '2B': { hitPrevention: -.0015, doublePlay: -.0044, errorAvoidance: .0134 },
 '3B': { hitPrevention: -.0102, doublePlay: -.0088, errorAvoidance: .0158 },
 SS: { hitPrevention: .0094, doublePlay: -.0044, errorAvoidance: .0111 },
 LF: { hitPrevention: -.0145, outfieldThrowing: -.022, errorAvoidance: .0157 },
 CF: { hitPrevention: .0165, outfieldThrowing: -.0278, errorAvoidance: .0131 },
 RF: { hitPrevention: -.0046, outfieldThrowing: -.022, errorAvoidance: .0158 }
};

export const woba = (rates: readonly number[]): number => rates.reduce((sum, rate, index) => sum + rate * WOBA[index], 0);
const sum = (rates: readonly number[], events: readonly number[]) => events.reduce((total, event) => total + rates[event], 0);

/** Moves `mass` of probability from the `from` events to the `to` events, each side in proportion to its current rates. */
function shift(rates: Rates, from: readonly number[], to: readonly number[], mass: number): Rates {
 const available = sum(rates, from);
 const receiving = sum(rates, to);
 const moved = Math.max(0, Math.min(mass, available));
 if (!(moved > 0) || !(receiving > 0)) return rates;
 const next = [...rates] as Rates;
 for (const event of from) next[event] -= moved * rates[event] / available;
 for (const event of to) next[event] += moved * rates[event] / receiving;
 return next;
}

/** wOBA moves by `delta` when mass moves from outs to the on-base events in proportion: delta / the on-base events' mean weight. */
function towardWoba(rates: Rates, target: number, better: 'up' | 'down'): Rates {
 const onBase = sum(rates, ON_BASE);
 if (!(onBase > 0)) return rates;
 const weight = ON_BASE.reduce((total, event) => total + WOBA[event] * rates[event], 0) / onBase;
 const delta = target - woba(rates);
 if (better === 'up' ? delta <= 0 : delta >= 0) return rates;
 return better === 'up' ? shift(rates, [SO, OUT], ON_BASE, delta / weight) : shift(rates, ON_BASE, [SO, OUT], -delta / weight);
}

const isHitter = (profile: Profile) => !!profile.battingRates && profile.eligibleSlots.some(slot => (HITTER_SLOTS as readonly string[]).includes(slot));
const isPitcher = (profile: Profile) => !!profile.pitchingRates && profile.eligibleSlots.some(slot => slot === 'SP1' || slot === 'CL');
const isStarter = (profile: Profile) => isPitcher(profile) && profile.eligibleSlots.includes('SP1') && (profile.pitching?.GS ?? 0) > 0;
const isReliever = (profile: Profile) => isPitcher(profile) && profile.eligibleSlots.includes('CL');

/** Whether `kind` applies to the card; recovery applies once. */
export function canTrain(profile: Profile, kind: TrainingKind, upgrades: readonly Upgrade[] = []): boolean {
 switch (kind) {
  case 'hitting': case 'power': case 'eye': case 'contact': case 'hotBat': return isHitter(profile);
  case 'baserunning': return isHitter(profile);
  case 'fielding': return isHitter(profile) && Object.keys(profile.defense.positions).length > 0;
  case 'pitching': case 'strikeout': case 'control': case 'keepInPark': case 'hotArm': return isPitcher(profile);
  case 'stamina': return isStarter(profile);
  case 'recovery': return isReliever(profile) && !upgrades.some(upgrade => upgrade.cardId === profile.seasonId && upgrade.kind === 'recovery');
 }
}

const withBatting = (profile: Profile, rates: Rates): Profile => ({ ...profile, battingRates: rates, contact: profile.contact && { ...profile.contact, batting: contactTargets(rates) } });
const withPitching = (profile: Profile, rates: Rates): Profile => ({ ...profile, pitchingRates: rates, contact: profile.contact && { ...profile.contact, pitching: contactTargets(rates) } });

/** The card after one training. Kinds that do not apply leave it unchanged. */
export function train(profile: Profile, kind: TrainingKind): Profile {
 const bat = profile.battingRates;
 const pitch = profile.pitchingRates;
 switch (kind) {
  case 'hitting': case 'hotBat': {
   if (!bat) return profile;
   const gain = kind === 'hitting' ? BASIC_GAIN : HOT_GAIN;
   return withBatting(profile, towardWoba(bat, woba(bat) + gain * (CEILINGS.battingWoba - woba(bat)), 'up'));
  }
  case 'pitching': case 'hotArm': {
   if (!pitch) return profile;
   const gain = kind === 'pitching' ? BASIC_GAIN : HOT_GAIN;
   return withPitching(profile, towardWoba(pitch, woba(pitch) - gain * (woba(pitch) - CEILINGS.pitchingWoba), 'down'));
  }
  case 'power': {
   if (!bat || !(bat[HR] > 0)) return profile;
   const extra = bat[DOUBLE] + bat[TRIPLE] + bat[HR];
   return withBatting(profile, shift(bat, [OUT], [DOUBLE, TRIPLE, HR], TARGETED_GAIN * (CEILINGS.battingHomeRun - bat[HR]) * extra / bat[HR]));
  }
  case 'eye': return bat ? withBatting(profile, shift(bat, [SO, OUT], [BB], TARGETED_GAIN * (CEILINGS.battingWalk - bat[BB]))) : profile;
  case 'contact': return bat ? withBatting(profile, shift(bat, [SO], IN_PLAY, TARGETED_GAIN * (bat[SO] - CEILINGS.battingStrikeout))) : profile;
  case 'strikeout': return pitch ? withPitching(profile, shift(pitch, IN_PLAY, [SO], TARGETED_GAIN * (CEILINGS.pitchingStrikeout - pitch[SO]))) : profile;
  case 'control': return pitch ? withPitching(profile, shift(pitch, [BB], IN_PLAY, TARGETED_GAIN * (pitch[BB] - CEILINGS.pitchingWalk))) : profile;
  case 'keepInPark': return pitch ? withPitching(profile, shift(pitch, [HR], [OUT], TARGETED_GAIN * (pitch[HR] - CEILINGS.pitchingHomeRun))) : profile;
  case 'fielding': {
   const positions = Object.fromEntries(Object.entries(profile.defense.positions).map(([position, skills]) => {
    const ceilings = FIELDING_CEILINGS[position as Position] ?? {};
    const next = { ...skills };
    for (const [skill, ceiling] of Object.entries(ceilings) as [DefensiveSkillName, number][]) {
     if (next[skill] < ceiling) next[skill] += BASIC_GAIN * (ceiling - next[skill]);
    }
    return [position, next];
   }));
   return { ...profile, defense: { ...profile.defense, positions } };
  }
  case 'baserunning': {
   const toward = (value: number, ceiling: number) => value < ceiling ? value + BASIC_GAIN * (ceiling - value) : value;
   return { ...profile, speed: toward(profile.speed, CEILINGS.speed), stealSuccess: toward(profile.stealSuccess, CEILINGS.stealSuccess) };
  }
  case 'stamina': {
   const counts = profile.pitching;
   if (!counts || !(counts.GS > 0)) return profile;
   const outs = counts.IPouts / counts.GS;
   if (outs >= CEILINGS.starterOuts) return profile;
   return { ...profile, pitching: { ...counts, IPouts: counts.GS * (outs + TARGETED_GAIN * (CEILINGS.starterOuts - outs)) } };
  }
  case 'recovery': return profile;
 }
}

/** Whether an upgrade bought at `upgrade.stop` still acts in the segment at index `segment`. */
export const inForce = (upgrade: Upgrade, segment: number): boolean => TRAININGS[upgrade.kind].temporary ? upgrade.stop === segment : upgrade.stop <= segment;

/** The card as it plays segment `segment`: its profile with every upgrade in force applied in purchase order. */
export function developed(profile: Profile, upgrades: readonly Upgrade[], segment: number): Profile {
 return upgrades.filter(upgrade => upgrade.cardId === profile.seasonId && inForce(upgrade, segment)).reduce((card, upgrade) => train(card, upgrade.kind), profile);
}

/** Lasting upgrades on a card, for its badge. */
export const lastingUpgrades = (upgrades: readonly Upgrade[], cardId: string): number => upgrades.filter(upgrade => upgrade.cardId === cardId && !TRAININGS[upgrade.kind].temporary).length;

/** OPS (OBP plus SLG, per plate appearance) from an eight-event rate vector. */
const ops = (rates: readonly number[]): number => sum(rates, ON_BASE) + (rates[SINGLE] + 2 * rates[DOUBLE] + 3 * rates[TRIPLE] + 4 * rates[HR]) / (1 - rates[BB] - rates[HBP]);
const three = (value: number) => value.toFixed(3).replace(/^(-?)0/, '$1');
const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;

/** The one stat a training moves, as the shop shows it before and after. */
export function statLine(profile: Profile, kind: TrainingKind): string {
 const bat = profile.battingRates!;
 const pitch = profile.pitchingRates!;
 switch (kind) {
  case 'hitting': case 'hotBat': return `OPS ${three(ops(bat))}`;
  case 'power': return `HR ${percent(bat[HR])}`;
  case 'eye': return `BB ${percent(bat[BB])}`;
  case 'contact': return `K ${percent(bat[SO])}`;
  case 'pitching': case 'hotArm': return `OPS allowed ${three(ops(pitch))}`;
  case 'strikeout': return `K ${percent(pitch[SO])}`;
  case 'control': return `BB ${percent(pitch[BB])}`;
  case 'keepInPark': return `HR ${percent(pitch[HR])}`;
  case 'stamina': return `${(profile.pitching!.IPouts / profile.pitching!.GS / 3).toFixed(1)} innings a start`;
  case 'baserunning': return `speed ${Math.round(profile.speed * 100)}, steals ${Math.round(profile.stealSuccess * 100)}%`;
  case 'fielding': {
   const gaps = Object.entries(profile.defense.positions).map(([position, skills]) => {
    const ceilings = Object.entries(FIELDING_CEILINGS[position as Position] ?? {}) as [DefensiveSkillName, number][];
    const medians = FIELDING_MEDIANS[position as Position] ?? {};
    const score = ceilings.reduce((total, [skill, ceiling]) => total + Math.min(100, Math.max(0, 50 + 50 * (skills[skill] - medians[skill]!) / (ceiling - medians[skill]!))), 0) / Math.max(1, ceilings.length);
    return `${position} ${Math.round(score)}`;
   });
   return `glove ${gaps.join(', ')}`;
  }
  case 'recovery': return 'normal rest';
 }
}

/** The lineup's note for a trained card: how far training has moved its OPS (or OPS allowed), or null when it has not. */
export function trainedLine(printed: Profile, now: Profile): string | null {
 const hitter = isHitter(printed);
 const before = hitter ? printed.battingRates : printed.pitchingRates;
 const after = hitter ? now.battingRates : now.pitchingRates;
 if (!before || !after) return null;
 const delta = ops(after) - ops(before);
 if (Math.abs(delta) < .0005) return null;
 return `trained ${delta > 0 ? '+' : '−'}${three(Math.abs(delta))} OPS${hitter ? '' : ' allowed'}`;
}
