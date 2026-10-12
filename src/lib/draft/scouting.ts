import { randomStream } from '../game/random.ts';
import type { DraftCard } from './types.ts';

/** How sharply AI clubs judge cards, chosen by the player for each run. */
export type Difficulty = 'rookie' | 'pro' | 'ace';
export const DIFFICULTIES: readonly Difficulty[] = ['rookie', 'pro', 'ace'];
export const DEFAULT_DIFFICULTY: Difficulty = 'pro';

/** A named quirk that skews one AI club's judgment in a way the player can read and exploit. */
export type Bias = 'none' | 'gem-chaser' | 'homer' | 'nostalgic' | 'big-spender';
export const BIASES: readonly Bias[] = ['none', 'gem-chaser', 'homer', 'nostalgic', 'big-spender'];

export const BIAS_LABELS: Readonly<Record<Bias, string>> = {
 'none': 'No quirks',
 'gem-chaser': 'Gem chaser',
 'homer': 'Homer',
 'nostalgic': 'Nostalgic',
 'big-spender': 'Big spender'
};

interface Sharpness {
 /** Standard deviation of a club's misjudgment, as a share of the card's value plus five runs. */
 scoutingError: number;
 /** Share by which a bias inflates the cards it favors. */
 biasStrength: number;
 /** Thrift multiplier for a big spender. */
 spenderThrift: number;
}

export const SHARPNESS: Readonly<Record<Difficulty, Sharpness>> = {
 rookie: { scoutingError: 0.4, biasStrength: 0.35, spenderThrift: 0.3 },
 pro: { scoutingError: 0.22, biasStrength: 0.2, spenderThrift: 0.5 },
 ace: { scoutingError: 0.08, biasStrength: 0.08, spenderThrift: 0.8 }
};

/** An approximately standard normal draw: twelve uniforms less six, with no transcendental math to differ across engines. */
function normal(random: () => number): number {
 let sum = -6;
 for (let draw = 0; draw < 12; draw++) sum += random();
 return sum;
}

/**
 * The value one AI seat believes a card has, before biases. Each seat misjudges each card by its
 * own seeded error, fixed for the whole run, so clubs disagree and some value slides past them.
 */
export function scoutedValue(seed: number, seat: number, card: DraftCard, difficulty: Difficulty): number {
 const error = normal(randomStream(seed, `draft:ai:scout:${seat}:${card.seasonId}`));
 return card.valueRuns + error * SHARPNESS[difficulty].scoutingError * (Math.abs(card.valueRuns) + 5);
}

export interface Leanings {
 bias: Bias;
 /** The decade a nostalgic club favors. */
 decade: number | null;
 /** The club's own franchise, which a homer favors. */
 franchiseId: string;
}

/** Runs a club's bias adds to a card's believed value; zero for cards the bias ignores. */
export function biasBonus(leanings: Leanings, card: DraftCard, believed: number, difficulty: Difficulty): number {
 const favored = leanings.bias === 'gem-chaser' ? card.finish === 'gem' || card.finish === 'emboss'
  : leanings.bias === 'homer' ? card.franchiseId === leanings.franchiseId
  : leanings.bias === 'nostalgic' ? Math.floor(card.year / 10) * 10 === leanings.decade
  : false;
 return favored ? SHARPNESS[difficulty].biasStrength * (Math.abs(believed) + 5) : 0;
}
