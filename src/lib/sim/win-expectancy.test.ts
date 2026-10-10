import { describe, expect, it } from 'vitest';
import { getPhysicalReference, INFINITY_TARGET } from './physical-expectation.ts';
import { testDefenseEnvironment } from './test-fixtures.ts';
import { neutralRunDistribution, WinExpectancyModel } from './win-expectancy.ts';

const environment = testDefenseEnvironment();
const rows = getPhysicalReference(environment).transitions[INFINITY_TARGET];

describe('neutral inning run distributions', () => {
 it('is a probability distribution whose mean is the inning run expectancy', () => {
  const distribution = neutralRunDistribution(rows);
  expect(distribution.reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1, 9);
  const mean = distribution.reduce((sum, probability, runs) => sum + runs * probability, 0);
  expect(mean).toBeCloseTo(getPhysicalReference(environment).runExpectancy[0], 3);
  expect(mean).toBeGreaterThan(0.3);
  expect(mean).toBeLessThan(0.8);
 });
 it('gives occupied bases more scoring than empty bases at the same outs', () => {
  const empty = neutralRunDistribution(rows, 0, 0);
  const loaded = neutralRunDistribution(rows, 0, 7);
  expect(loaded[0]).toBeLessThan(empty[0]);
 });
});

describe('neutral win expectancy', () => {
 const model = new WinExpectancyModel(environment);

 it('is symmetric at the start and values occupied bases without changing the score', () => {
  expect(model.homeWinProbability(1, 'top', 0, 0, 0, 0)).toBeCloseTo(0.5, 9);
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
