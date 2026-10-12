import { compareId, HITTER_SLOTS, type Slot } from '../game/types.ts';
import { randomStream } from '../game/random.ts';
import { arrangeRoster } from './legality.ts';
import { DRAFT_RULES, effectiveCap, type DraftRules } from './rules.ts';
import type { DraftCard, PayrollBudget } from './types.ts';

/** A role group an AI general manager leans toward; it shifts picks, never simulated strength. */
export type Archetype = 'lineup' | 'rotation' | 'bullpen' | 'balanced';
export const ARCHETYPES: readonly Archetype[] = ['lineup', 'rotation', 'bullpen', 'balanced'];

export interface Personality {
 archetype: Archetype;
 /** Runs of value given up per run of projected payroll over the cap; higher is thriftier. */
 thrift: number;
}

/** A seat's seeded personality: one archetype and a thrift between 1 and 1.8, so payroll over the cap always costs at least the runs it buys. */
export function personalityFor(seed: number, seat: number): Personality {
 const random = randomStream(seed, `draft:ai:personality:${seat}`);
 return { archetype: ARCHETYPES[Math.floor(random() * ARCHETYPES.length)], thrift: 1 + random() * 0.8 };
}

const RESERVE_SHARE = 0.25;
const ARCHETYPE_BONUS = 1.15;
/** Salary units per run of value, matching the provisional salary method. */
const SALARY_PER_RUN = 4;

const favors = (archetype: Archetype, slot: Slot): boolean =>
 archetype === 'lineup' ? (HITTER_SLOTS as readonly Slot[]).includes(slot)
  : archetype === 'rotation' ? slot === 'SP1' || slot === 'SP2' || slot === 'SP3'
  : archetype === 'bullpen' ? slot === 'CL' || slot === 'BP'
  : false;

/** Modeled runs a roster would field: placed active cards in full, reserves at a quarter. */
function rosterOutlook(owned: readonly DraftCard[], rules: DraftRules): { value: number; payroll: number; open: number } {
 const arrangement = arrangeRoster(owned, rules);
 const byId = new Map(owned.map(card => [card.seasonId, card]));
 let value = 0;
 let payroll = 0;
 for (const id of Object.values(arrangement.active)) { value += byId.get(id!)!.valueRuns; payroll += byId.get(id!)!.salary; }
 for (const id of arrangement.reserves) { value += RESERVE_SHARE * byId.get(id)!.valueRuns; payroll += byId.get(id)!.salary; }
 return { value, payroll, open: arrangement.open.length };
}

export interface PickScore {
 cardId: string;
 /** Change in the roster's modeled runs from adding the card; zero for a card that would be cut. */
 marginal: number;
 /** Runs deducted for projected payroll over the cap once open rows are filled with commons. */
 capPenalty: number;
 score: number;
}

/**
 * Scores the cards in the pile a seat holds, using only what that seat can see: the pile, its own
 * cards and its budget. A card's worth is the change it makes to the seat's best arrangement, so a
 * redundant star scores low once its role is filled; projected payroll over the cap costs runs at
 * the seat's thrift. A seeded jitter below half a run breaks near-ties by personality.
 */
export function scorePile(pile: readonly DraftCard[], owned: readonly DraftCard[], budget: PayrollBudget, personality: Personality, random: () => number, rules: DraftRules = DRAFT_RULES): PickScore[] {
 const cap = effectiveCap(budget);
 const base = rosterOutlook(owned, rules);
 return [...pile].sort((a, b) => compareId(a.seasonId, b.seasonId)).map(card => {
  const next = rosterOutlook([...owned, card], rules);
  const bonus = favors(personality.archetype, card.pricedSlot) ? ARCHETYPE_BONUS : 1;
  const marginal = (next.value - base.value) * bonus;
  const projected = next.payroll + next.open * rules.commonSalaryMax;
  const capPenalty = Math.max(0, projected - cap) / SALARY_PER_RUN * personality.thrift;
  return { cardId: card.seasonId, marginal, capPenalty, score: marginal - capPenalty + random() * 0.5 };
 });
}

/** The AI's pick from its held pile: the highest score, ties to the lower card id. */
export function chooseAiPick(scores: readonly PickScore[]): PickScore {
 if (!scores.length) throw new Error('An AI general manager received an empty pile');
 return scores.reduce((best, score) => score.score > best.score || (score.score === best.score && compareId(score.cardId, best.cardId) < 0) ? score : best);
}
