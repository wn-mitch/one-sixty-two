import { describe, expect, it } from 'vitest';
import { POSITIONS, type DefensiveSkillName, type Position } from '../game/types.ts';
import {
 createDefensiveReference,
 expectedDefensiveRuns,
 neutralDefensivePosition
} from './defense.ts';
import {
 advancementAttemptProbability,
 advancementOutProbability,
 doublePlayParticipants,
 doublePlayProbability,
 fieldingErrorProbability,
 hitConversionProbability,
 responsibleOutfielder,
 responsiblePosition,
 stealSuccessProbability
} from './defense-rules.ts';
import { AVERAGE_RATES } from './fixtures.ts';
import { testDefenseEnvironment } from './test-fixtures.ts';

const APPLICABLE_SKILLS: { position: Position; skill: DefensiveSkillName }[] = [
 ...POSITIONS.flatMap(position => [
  { position, skill: 'hitPrevention' as const },
  { position, skill: 'errorAvoidance' as const }
 ]),
 ...(['1B', '2B', '3B', 'SS'] as const).map(position => ({ position, skill: 'doublePlay' as const })),
 ...(['LF', 'CF', 'RF'] as const).map(position => ({ position, skill: 'outfieldThrowing' as const })),
 { position: 'C', skill: 'catcherThrowing' }
];

describe('defensive contact probabilities', () => {
 it('preserves non-contact categories and converts only the intended contact side', () => {
  for (const event of [0, 1, 2, 6]) {
   expect(hitConversionProbability(AVERAGE_RATES, event, 1)).toBe(0);
   expect(hitConversionProbability(AVERAGE_RATES, event, -1)).toBe(0);
  }
  for (const event of [3, 4, 5]) {
   expect(hitConversionProbability(AVERAGE_RATES, event, 1)).toBeGreaterThan(0);
   expect(hitConversionProbability(AVERAGE_RATES, event, -1)).toBe(0);
  }
  expect(hitConversionProbability(AVERAGE_RATES, 7, 1)).toBe(0);
  expect(hitConversionProbability(AVERAGE_RATES, 7, -1)).toBeGreaterThan(0);
  expect(hitConversionProbability(Float64Array.of(0, 0, 0, 0, 0, 0, 0, 1), 3, 1)).toBe(0);
  expect(hitConversionProbability(Float64Array.of(0, 0, 0, 1, 0, 0, 0, 0), 7, -1)).toBe(0);
 });

 it('uses the specified responsibility intervals at every exact boundary', () => {
  expect([0, 0.049999, 0.05, 0.149999, 0.15, 0.299999, 0.30, 0.399999, 0.40, 0.599999, 0.60, 0.729999, 0.73, 0.869999, 0.87, 0.999999]
   .map(responsiblePosition)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  expect([0, 0.324999, 0.325, 0.674999, 0.675, 0.999999].map(responsibleOutfielder)).toEqual([5, 5, 6, 6, 7, 7]);
 });

 it('bounds errors, double plays, throwing attempts, throwing outs and steals', () => {
  expect(fieldingErrorProbability(0.01, 1)).toBe(0);
  expect(fieldingErrorProbability(0.11, -1)).toBe(0.12);
  expect(doublePlayProbability(0.55, 1)).toBeCloseTo(0.85, 12);
  expect(doublePlayProbability(0, -1)).toBe(0);
  expect(advancementAttemptProbability(0.02, 1)).toBe(0.05);
  expect(advancementAttemptProbability(0.98, -1)).toBe(0.95);
  expect(advancementOutProbability(-1)).toBeCloseTo(0.01, 12);
  expect(advancementOutProbability(1)).toBe(0.07);
  expect(stealSuccessProbability(0.36, 1)).toBe(0.35);
  expect(stealSuccessProbability(0.94, -1)).toBe(0.95);
 });

 it('returns each distinct DP participant in canonical position order', () => {
  const output = new Uint8Array(3);
  expect(doublePlayParticipants(POSITIONS.indexOf('1B'), output)).toBe(2);
  expect([...output.slice(0, 2)]).toEqual([POSITIONS.indexOf('1B'), POSITIONS.indexOf('SS')]);
  expect(doublePlayParticipants(POSITIONS.indexOf('2B'), output)).toBe(3);
  expect([...output]).toEqual([POSITIONS.indexOf('1B'), POSITIONS.indexOf('2B'), POSITIONS.indexOf('SS')]);
  expect(doublePlayParticipants(POSITIONS.indexOf('3B'), output)).toBe(3);
  expect([...output]).toEqual([POSITIONS.indexOf('1B'), POSITIONS.indexOf('2B'), POSITIONS.indexOf('3B')]);
  expect(doublePlayParticipants(POSITIONS.indexOf('SS'), output)).toBe(3);
  expect([...output]).toEqual([POSITIONS.indexOf('1B'), POSITIONS.indexOf('2B'), POSITIONS.indexOf('SS')]);
  expect(doublePlayParticipants(POSITIONS.indexOf('CF'), output)).toBe(0);
 });
});

describe('defensive reference valuation', () => {
 it('is deterministic, neutral at zero and directionally values every applicable isolated skill', () => {
  const reference = createDefensiveReference(testDefenseEnvironment());
  for (const { position, skill } of APPLICABLE_SKILLS) {
   const neutral = neutralDefensivePosition(position);
   const positive = neutralDefensivePosition(position);
   const negative = neutralDefensivePosition(position);
   positive[skill] = 1;
   negative[skill] = -1;
   expect(expectedDefensiveRuns(reference, position, neutral)).toBeCloseTo(0, 12);
   const positiveRuns = expectedDefensiveRuns(reference, position, positive);
   const negativeRuns = expectedDefensiveRuns(reference, position, negative);
   expect(positiveRuns, `${position} ${skill} positive`).toBeGreaterThan(negativeRuns);
   expect(expectedDefensiveRuns(reference, position, positive)).toBe(positiveRuns);
  }
 });

 it('rejects invalid environments and out-of-bounds skills instead of silently neutralizing them', () => {
  expect(() => createDefensiveReference({ ...testDefenseEnvironment(), leagueStealSuccess: Number.NaN })).toThrow('environment');
  const reference = createDefensiveReference(testDefenseEnvironment());
  const invalid = neutralDefensivePosition('SS');
  invalid.hitPrevention = 1.01;
  expect(() => expectedDefensiveRuns(reference, 'SS', invalid)).toThrow('skill');
  const nonfinite = neutralDefensivePosition('SS');
  nonfinite.errorAvoidance = Number.NaN;
  expect(() => expectedDefensiveRuns(reference, 'SS', nonfinite)).toThrow('skill');
 });
});
