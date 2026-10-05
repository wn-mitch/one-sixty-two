import type { BattingCounts, PitchingCounts, Rates } from '../game/types.ts';

export const HIT_INDICES = [3, 4, 5, 6] as const;

export function normalize(weights: readonly number[]): Rates {
 if (weights.length !== 8 || weights.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid event weights');
 const total = weights.reduce((sum, value) => sum + value, 0);
 if (total <= 0) throw new Error('Empty event distribution');
 return weights.map(value => value / total) as Rates;
}

export function battingEvents(counts: BattingCounts): Rates {
 const { PA, H, doubles, triples, HR, BB, HBP, SO } = counts;
 const singles = H - doubles - triples - HR;
 const events: Rates = [BB, HBP, SO, singles, doubles, triples, HR, PA - BB - HBP - SO - H];
 assertEvents(events, PA);
 return events;
}

export function pitchingEvents(counts: PitchingCounts, nonHomeRunHits: readonly number[]): Rates {
 const { BFP, H, HR, BB, HBP, SO } = counts;
 if (nonHomeRunHits.length !== 3 || nonHomeRunHits.some(value => value < 0 || !Number.isFinite(value)) || Math.abs(nonHomeRunHits.reduce((a, b) => a + b, 0) - 1) > 1e-9) throw new Error('Invalid non-home-run hit proportions');
 const hits = H - HR;
 const events: Rates = [BB, HBP, SO, hits * nonHomeRunHits[0], hits * nonHomeRunHits[1], hits * nonHomeRunHits[2], HR, BFP - BB - HBP - SO - H];
 assertEvents(events, BFP);
 return events;
}

export function assertEvents(events: readonly number[], denominator: number): void {
 if (!Number.isFinite(denominator) || denominator <= 0 || events.some(value => !Number.isFinite(value) || value < 0) || Math.abs(events.reduce((a, b) => a + b, 0) - denominator) > 1e-6) throw new Error('Invalid derived event counts');
}

/** A matching source-side prior, translated to the common batting environment. */
export function prepareRates(events: Rates, source: Rates, target: Rates, park = 1): Rates {
 if (!Number.isFinite(park) || park <= 0 || source.some(value => value <= 0) || target.some(value => value <= 0)) throw new Error('Invalid league rates or park factor');
 const denominator = events.reduce((a, b) => a + b, 0);
 assertEvents(events, denominator);
 const weights = events.map((value, index) => ((value + 100 * source[index]) / (denominator + 100)) / source[index] * target[index]);
 for (const index of HIT_INDICES) weights[index] /= park;
 return normalize(weights);
}

/** Neutral categorical matchup; gameplay adds platoon and home-park modifiers. */
export function matchupRates(batter: Rates, pitcher: Rates, league: Rates): Rates {
 if (league.some(value => value <= 0)) throw new Error('Invalid matchup league rates');
 return normalize(batter.map((value, index) => value * pitcher[index] / league[index]));
}
