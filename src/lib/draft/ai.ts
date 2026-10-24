import { compareId, HITTER_SLOTS, type Slot } from '../game/types.ts';
import { randomStream } from '../game/random.ts';
import { arrangeRoster, fits } from './legality.ts';
import { DRAFT_RULES, effectiveCap, type DraftRules } from './rules.ts';
import { BIAS_LABELS, BIASES, biasBonus, scoutedValue, SHARPNESS, type Bias, type Difficulty } from './scouting.ts';
import type { DraftCard, DraftSlot, PayrollBudget } from './types.ts';

/** A role group an AI general manager leans toward; it shifts picks, never simulated strength. */
export type Archetype = 'lineup' | 'rotation' | 'bullpen' | 'balanced';
export const ARCHETYPES: readonly Archetype[] = ['lineup', 'rotation', 'bullpen', 'balanced'];

export interface Personality {
 archetype: Archetype;
 /** Runs of value given up per run of projected payroll over the cap; higher is thriftier. */
 thrift: number;
 bias: Bias;
 /** The decade a nostalgic club favors; null otherwise. */
 decade: number | null;
 /** The club's own franchise, which a homer favors. */
 franchiseId: string;
}

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

/**
 * A seat's seeded personality: an archetype, a thrift between 1 and 1.8 (so payroll over the cap
 * costs at least the runs it buys), and one bias or none. A big spender's thrift is cut by the
 * difficulty's spender share, so it knowingly overspends.
 */
export function personalityFor(seed: number, seat: number, franchiseId: string, difficulty: Difficulty): Personality {
 const random = randomStream(seed, `draft:ai:personality:${seat}`);
 const archetype = ARCHETYPES[Math.floor(random() * ARCHETYPES.length)];
 let thrift = 1 + random() * 0.8;
 const bias = BIASES[Math.floor(random() * BIASES.length)];
 const decade = DECADES[Math.floor(random() * DECADES.length)];
 if (bias === 'big-spender') thrift *= SHARPNESS[difficulty].spenderThrift;
 return { archetype, thrift, bias, decade: bias === 'nostalgic' ? decade : null, franchiseId };
}

/** What one AI club believes a card is worth, and how much of that its bias added. */
export interface Judgment { value: number; bias: number }

/** A seat's memoized judgment: its scouting error on every card, plus its bias. Fixed for the run. */
export function judgeFor(seed: number, seat: number, personality: Personality, difficulty: Difficulty): (card: DraftCard) => Judgment {
 const memo = new Map<string, Judgment>();
 return card => {
  let judgment = memo.get(card.seasonId);
  if (!judgment) {
   const believed = scoutedValue(seed, seat, card, difficulty);
   const bias = biasBonus(personality, card, believed, difficulty);
   memo.set(card.seasonId, judgment = { value: believed + bias, bias });
  }
  return judgment;
 };
}

/** Judges every card at its true value: a perfect drafter for proofs and tests. */
export const trueJudgment = (card: DraftCard): Judgment => ({ value: card.valueRuns, bias: 0 });

const RESERVE_SHARE = 0.25;
const ARCHETYPE_BONUS = 1.15;
/** Salary units per run of value, matching the provisional salary method. */
const SALARY_PER_RUN = 4;
/** Runs added for filling an open slot when no other seen, undrafted card could fill it. */
const SCARCITY_RUNS = 6;

const favors = (archetype: Archetype, slot: Slot): boolean =>
 archetype === 'lineup' ? (HITTER_SLOTS as readonly Slot[]).includes(slot)
  : archetype === 'rotation' ? slot === 'SP1' || slot === 'SP2' || slot === 'SP3'
  : archetype === 'bullpen' ? slot === 'CL' || slot.startsWith('RP')
  : false;

/** Where a card lands in a seat's best arrangement. */
export type Landing = DraftSlot | 'reserve' | 'cut';

interface Outlook { value: number; park: number; payroll: number; open: number; openActive: DraftSlot[]; landing: (id: string) => Landing }

/** Runs a roster would field at home as the club judges it: placed active cards in full, reserves at a quarter, each with its park fit. */
function rosterOutlook(owned: readonly DraftCard[], judge: (card: DraftCard) => Judgment, parkFit: (seasonId: string) => number, rules: DraftRules): Outlook {
 // Arrange by the club's own judgment, so a misjudged card can take the wrong slot.
 const judged = owned.map(card => ({ ...card, valueRuns: judge(card).value }));
 const arrangement = arrangeRoster(judged, rules);
 const byId = new Map(judged.map(card => [card.seasonId, card]));
 const slotOf = new Map<string, Landing>();
 let value = 0;
 let park = 0;
 let payroll = 0;
 const place = (id: string, share: number): void => {
  const card = byId.get(id)!;
  const fit = parkFit(id);
  value += share * (card.valueRuns + fit);
  park += share * fit;
  payroll += card.salary;
 };
 for (const [slot, id] of Object.entries(arrangement.active)) { place(id!, 1); slotOf.set(id!, slot as DraftSlot); }
 for (const id of arrangement.reserves) { place(id, RESERVE_SHARE); slotOf.set(id, 'reserve'); }
 return { value, park, payroll, open: arrangement.open.length, openActive: arrangement.open.filter(row => row !== null), landing: id => slotOf.get(id) ?? 'cut' };
}

/**
 * What a club believes a roster is worth: its judged home runs less the runs it gives up for projected
 * payroll over the cap once open rows are filled with commons, at `thrift`. AI clubs weigh trades and
 * waiver claims by the change this makes.
 */
export function clubWorth(owned: readonly DraftCard[], judge: (card: DraftCard) => Judgment, parkFit: (seasonId: string) => number, budget: PayrollBudget, thrift: number, rules: DraftRules = DRAFT_RULES): number {
 const outlook = rosterOutlook(owned, judge, parkFit, rules);
 const projected = outlook.payroll + outlook.open * rules.commonSalaryMax;
 return outlook.value - Math.max(0, projected - effectiveCap(budget)) / SALARY_PER_RUN * thrift;
}

/** The runs a roster fields at home as `judge` values it: the measure AI clubs maximize, and with `trueJudgment` the true one. */
export function rosterValue(owned: readonly DraftCard[], judge: (card: DraftCard) => Judgment, parkFit: (seasonId: string) => number, rules: DraftRules = DRAFT_RULES): number {
 return rosterOutlook(owned, judge, parkFit, rules).value;
}

/** What one seat can see when it picks: the pile it holds, its own cards and budget, and what it saw before. */
export interface SeatView {
 pile: readonly DraftCard[];
 owned: readonly DraftCard[];
 budget: PayrollBudget;
 /** Undrafted cards this seat saw in piles it held earlier, outside the pile it holds now. */
 seenElsewhere: readonly DraftCard[];
 /** Runs a card gains or loses over the home half-season in this seat's park. */
 parkFit: (seasonId: string) => number;
 /** The club's belief about a card's value; `trueJudgment` for a perfect drafter. */
 judge: (card: DraftCard) => Judgment;
}

export interface PickScore {
 cardId: string;
 landing: Landing;
 /** True when the card fills an active slot the roster could not fill before. */
 fills: boolean;
 /** The active slot that was open and no longer is; another card may have moved into it. */
 filled: DraftSlot | null;
 /** Change in the roster's modeled runs from adding the card, with the archetype lean; zero for a card that would be cut. */
 marginal: number;
 /** The part of `marginal` that comes from home park fit, before the archetype lean. */
 park: number;
 /** Runs the club's bias added to this card, and the bias, when it added half a run or more. */
 bias: number;
 quirk: Bias | null;
 /** Runs added because few seen, undrafted cards could fill the same slot. */
 scarcity: number;
 /** Runs deducted for projected payroll over the cap once open rows are filled with commons. */
 capPenalty: number;
 score: number;
}

/**
 * Scores the pile a seat holds from the seat's own view. A card's worth is the change it makes to
 * the seat's best arrangement, valued by the club's own judgment (scouting error and bias) plus
 * home park fit, so a redundant star scores low once its role is filled. Filling an
 * open slot earns a scarcity bonus when few cards the seat has seen elsewhere could fill it, and
 * projected payroll over the cap costs runs at the seat's thrift. A seeded jitter below half a
 * run breaks near-ties by personality.
 */
export function scorePile(view: SeatView, personality: Personality, random: () => number, rules: DraftRules = DRAFT_RULES): PickScore[] {
 const cap = effectiveCap(view.budget);
 const base = rosterOutlook(view.owned, view.judge, view.parkFit, rules);
 return [...view.pile].sort((a, b) => compareId(a.seasonId, b.seasonId)).map(card => {
  const next = rosterOutlook([...view.owned, card], view.judge, view.parkFit, rules);
  const landing = next.landing(card.seasonId);
  const filled = base.openActive.find(row => !next.openActive.includes(row)) ?? null;
  const fills = filled !== null;
  const bonus = favors(personality.archetype, card.pricedSlot) ? ARCHETYPE_BONUS : 1;
  const marginal = (next.value - base.value) * bonus;
  let scarcity = 0;
  if (filled) {
   const alternatives = view.seenElsewhere.filter(other => fits(other, filled)).length;
   scarcity = SCARCITY_RUNS * Math.max(0, 1 - alternatives / rules.seats);
  }
  const projected = next.payroll + next.open * rules.commonSalaryMax;
  const capPenalty = Math.max(0, projected - cap) / SALARY_PER_RUN * personality.thrift;
  const bias = landing === 'cut' ? 0 : view.judge(card).bias * (landing === 'reserve' ? RESERVE_SHARE : 1);
  return { cardId: card.seasonId, landing, fills, filled, marginal, park: next.park - base.park, bias, quirk: bias >= 0.5 ? personality.bias : null, scarcity, capPenalty, score: marginal + scarcity - capPenalty + random() * 0.5 };
 });
}

/** The AI's pick from its held pile: the highest score, ties to the lower card id. */
export function chooseAiPick(scores: readonly PickScore[]): PickScore {
 if (!scores.length) throw new Error('An AI general manager received an empty pile');
 return scores.reduce((best, score) => score.score > best.score || (score.score === best.score && compareId(score.cardId, best.cardId) < 0) ? score : best);
}

/**
 * One line for the pick ticker that says why an AI club took a card, from the parts of its score.
 * It names reasons, never the modeled runs behind them, so the ticker does not leak card values.
 */
export function explainPick(score: Pick<PickScore, 'landing' | 'fills' | 'filled' | 'marginal' | 'park' | 'bias' | 'quirk' | 'scarcity' | 'capPenalty'>): string {
 const parts = [score.landing === 'cut' ? 'no roster spot' : score.landing === 'reserve' ? 'reserve depth' : `${score.fills ? 'fills' : 'upgrades'} ${score.landing}`];
 if (Math.abs(score.park) >= 0.5) parts.push(score.park > 0 ? 'suits its home park' : 'despite its home park');
 if (score.quirk) parts.push(BIAS_LABELS[score.quirk].toLowerCase());
 if (score.scarcity >= 0.5 && score.filled) parts.push(`few ${score.filled} options left`);
 if (score.capPenalty >= 0.5) parts.push('over the cap');
 return parts.join(' · ');
}
