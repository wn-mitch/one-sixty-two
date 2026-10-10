import { describe, expect, it } from 'vitest';
import { expectedNeutralPlateAppearanceValue } from './defense.ts';
import { createBox } from './game.ts';
import { testDefenseEnvironment, testTeam } from './test-fixtures.ts';
import { centeredPlateAppearanceValue, createRunValueModel, estimatedHitterWar, estimatedPitcherWar } from './value.ts';

describe('sim-war-v2 replacement accounting', () => {
 it('combines batting, running, defense and 20 replacement runs per 600 PA without clamping negatives', () => {
  const line = createBox(testTeam('hitter-war')).batting[0];
  Object.assign(line, { PA: 600, battingRuns: -30, stealRuns: -5, defensiveRuns: -6 });
  expect(estimatedHitterWar(line)).toBeCloseTo(-2.1, 12);

  line.PA = 300;
  expect(estimatedHitterWar(line)).toBeCloseTo(-3.1, 12);
 });

 it('uses 20 replacement runs per 600 pitching outs and preserves below-replacement value', () => {
  const line = createBox(testTeam('pitcher-war')).pitching[0];
  Object.assign(line, { outs: 600, pitchingRunsAboveNeutral: -25 });
  expect(estimatedPitcherWar(line)).toBeCloseTo(-0.5, 12);

  line.outs = 300;
  expect(estimatedPitcherWar(line)).toBeCloseTo(-1.5, 12);
 });
});

describe('neutral plate-appearance centering', () => {
 it('is Bellman-consistent and preserves home-run continuation from every out count', () => {
  const model = createRunValueModel(testDefenseEnvironment());
  for (let outs = 0; outs < 3; outs++) {
   for (const bases of [0, 7]) {
    const state = outs * 8 + bases;
    // Runs on the PA plus the next state's expectancy average to this state's expectancy.
    expect(expectedNeutralPlateAppearanceValue(model.reference, state, Infinity)).toBeCloseTo(model.expectancy[state], 9);
    // A four-run walkoff target ends the inning early, so it can only lower the continuation value.
    expect(expectedNeutralPlateAppearanceValue(model.reference, state, 4)).toBeLessThanOrEqual(model.expectancy[state] + 1e-12);
   }
   const homeRun = centeredPlateAppearanceValue(model, outs, 0, 1, outs, 0, false, Infinity);
   const strikeout = centeredPlateAppearanceValue(model, outs, 0, 0, outs + 1, 0, outs === 2, Infinity);
   expect(homeRun).toBeGreaterThan(0);
   expect(strikeout).toBeLessThan(0);
   const loadedState = outs * 8 + 7;
   const grandSlam = centeredPlateAppearanceValue(model, outs, 7, 4, outs, 0, false, Infinity);
   expect(grandSlam + model.expectancy[loadedState] + model.muPA[loadedState * 5 + 4]).toBeCloseTo(4 + model.expectancy[outs * 8], 10);
  }
 });
});
