import { describe, expect, it } from 'vitest';
import type { Rates } from '../game/types.ts';
import { AVERAGE_RATES } from './fixtures.ts';
import { neutralRunDistribution, WinExpectancyModel } from './win-expectancy.ts';

describe('neutral inning run distributions', () => {
 it('matches the negative-binomial distribution for strikeout-or-homer plate appearances', () => {
  const rates: Rates = [0, 0, 0.5, 0, 0, 0, 0.5, 0];
  const distribution = neutralRunDistribution(rates);
  expect(distribution.reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1, 12);
  expect(distribution[0]).toBeCloseTo(0.125, 12);
  expect(distribution[1]).toBeCloseTo(0.1875, 12);
  expect(distribution[2]).toBeCloseTo(0.1875, 12);
  expect(distribution[3]).toBeCloseTo(0.15625, 12);
 });

 it('normalizes accepted roundoff above and below unit event-rate mass', () => {
  for (const delta of [-5e-9, 5e-9]) {
   const rates: Rates = [0, 0, 1 + delta, 0, 0, 0, 0, 0];
   expect(Array.from(neutralRunDistribution(rates))).toEqual([1]);
   const perturbed = [...AVERAGE_RATES] as Rates;
   perturbed[2] += delta;
   const distribution = neutralRunDistribution(perturbed);
   expect(distribution.reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1, 12);
   expect(new WinExpectancyModel(perturbed).homeWinProbability(1, 'top', 0, 0, 0, 0)).toBeCloseTo(0.5, 12);
  }
 });

 it('rejects a non-absorbing event model rather than inventing a distribution', () => {
  expect(() => neutralRunDistribution([0, 0, 0, 0, 0, 0, 1, 0])).toThrow('positive out rate');
 });
});

describe('neutral win expectancy', () => {
 const model = new WinExpectancyModel(AVERAGE_RATES);

 it('is symmetric at the start and values occupied bases without changing the score', () => {
  expect(model.homeWinProbability(1, 'top', 0, 0, 0, 0)).toBeCloseTo(0.5, 12);
  const empty = model.homeWinProbability(9, 'bottom', 0, 0, 3, 4);
  const loaded = model.homeWinProbability(9, 'bottom', 0, 7, 3, 4);
  expect(loaded).toBeGreaterThan(empty);
 });

 it('uses exact terminal values for skipped bottoms, walkoffs, and ending outs', () => {
  expect(model.homeWinProbability(9, 'top', 3, 0, 1, 0)).toBe(1);
  expect(model.homeWinProbability(9, 'bottom', 0, 0, 2, 1)).toBe(1);
  expect(model.homeWinProbability(9, 'bottom', 3, 0, 0, 1)).toBe(0);
  expect(model.homeWinProbability(10, 'bottom', 3, 0, 1, 1)).toBe(0.5);
 });
});
