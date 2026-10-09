import type { DefensiveSkills, Rates } from '../game/types.ts';

export const FIELD_WEIGHTS = [0.05, 0.10, 0.15, 0.10, 0.20, 0.13, 0.14, 0.13] as const;
export const OUTFIELD_WEIGHTS = [0.325, 0.35, 0.325] as const;
const FIELD_CUMULATIVE = [0.05, 0.15, 0.30, 0.40, 0.60, 0.73, 0.87, 1] as const;

export const clip = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

export function responsiblePosition(uniform: number): number {
 for (let index = 0; index < FIELD_CUMULATIVE.length; index++) {
  if (uniform < FIELD_CUMULATIVE[index]) return index;
 }
 return FIELD_CUMULATIVE.length - 1;
}

export function responsibleOutfielder(uniform: number): number {
 if (uniform < 0.325) return 5;
 if (uniform < 0.675) return 6;
 return 7;
}

export function hitConversionProbability(rates: Rates | Float64Array, event: number, hitPrevention: number): number {
 const hits = rates[3] + rates[4] + rates[5];
 const outs = rates[7];
 const contact = hits + outs;
 if (contact <= 0) return 0;
 const delta = clip(0.04 * hitPrevention, -outs / contact, hits / contact);
 if (event >= 3 && event <= 5 && delta > 0 && hits > 0) return delta * contact / hits;
 if (event === 7 && delta < 0 && outs > 0) return -delta * contact / outs;
 return 0;
}

export function fieldingErrorProbability(target: number, errorAvoidance: number): number {
 return clip(target - 0.02 * errorAvoidance, 0, 0.12);
}

export function doublePlayProbability(tendency: number, teamSkill: number): number {
 return clip(clip(tendency / 0.55, 0, 0.85) + 0.06 * teamSkill, 0, 0.85);
}

export function advancementAttemptProbability(baseline: number, arm: number): number {
 return clip(baseline - 0.05 * arm, 0.05, 0.95);
}

export function advancementOutProbability(arm: number): number {
 return clip(0.04 + 0.03 * arm, 0.01, 0.07);
}

export function stealSuccessProbability(baseline: number, catcherThrowing: number): number {
 return clip(baseline - 0.05 * catcherThrowing, 0.35, 0.95);
}

export function doublePlayParticipants(fielder: number, output: Uint8Array): number {
 if (fielder < 1 || fielder > 4) return 0;
 const pivot = fielder === 1 || fielder === 2 ? 4 : 2;
 let count = 0;
 output[count++] = fielder;
 if (pivot !== fielder) output[count++] = pivot;
 if (fielder !== 1) output[count++] = 1;
 for (let left = 0; left < count - 1; left++) for (let right = left + 1; right < count; right++) {
  if (output[left] > output[right]) {
   const value = output[left];
   output[left] = output[right];
   output[right] = value;
  }
 }
 return count;
}

export function teamDoublePlaySkill(fielder: number, target: number, skills: DefensiveSkills): number {
 if (fielder < 1 || fielder > 4) return 0;
 const pivot = fielder === 1 || fielder === 2 ? 4 : 2;
 let value = 0;
 if (fielder === target) value += 0.4 * skills.doublePlay;
 if (pivot === target) value += 0.4 * skills.doublePlay;
 if (target === 1) value += 0.2 * skills.doublePlay;
 return value;
}
