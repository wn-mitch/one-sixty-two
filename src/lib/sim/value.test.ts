import { describe, expect, it } from 'vitest';
import type { Rates } from '../game/types.ts';
import { expectedNeutralPlateAppearanceValue } from './defense.ts';
import { createBox } from './game.ts';
import { testDefenseEnvironment, testTeam } from './test-fixtures.ts';
import { centeredPlateAppearanceValue, createRunValueModel, estimatedHitterWar, estimatedPitcherWar } from './value.ts';

describe('sim-war-v1 replacement accounting', () => {
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
 it('centers HR/SO events at every out count while preserving HR continuation and walkoff targets', () => {
  const environment = testDefenseEnvironment();
  const homeRunRates: Rates = [0, 0, 0.7, 0, 0, 0, 0.3, 0];
  environment.leagueRates = homeRunRates;
  environment.leagueStealAttempt = 0;
  environment.leagueDoublePlay = 0;
  for (const position of Object.keys(environment.leagueErrorRates) as (keyof typeof environment.leagueErrorRates)[]) {
   environment.leagueErrorRates[position] = 0;
  }
  const model = createRunValueModel(environment);
  const strikeoutRates: Rates = [0, 0, 1, 0, 0, 0, 0, 0];
  const noHomeRunModel = createRunValueModel({
   ...environment,
   leagueRates: strikeoutRates
  });

  for (let outs = 0; outs < 3; outs++) {
   const state = outs * 8;
   const expectedWithHomeRuns = expectedNeutralPlateAppearanceValue(model.reference, state, 4);
   const expectedWithoutHomeRuns = expectedNeutralPlateAppearanceValue(noHomeRunModel.reference, state, 4);
   const strikeoutAfter = outs === 2 ? 0 : model.expectancy[(outs + 1) * 8];
   expect(expectedWithHomeRuns).toBeCloseTo(
    0.3 * (1 + model.expectancy[state]) + 0.7 * strikeoutAfter,
    10
   );
   expect(expectedWithHomeRuns).toBeGreaterThan(expectedWithoutHomeRuns);
   for (const runsNeeded of [4, Infinity]) {
    const homeRun = centeredPlateAppearanceValue(model, outs, 0, 1, outs, 0, false, runsNeeded);
    const strikeout = centeredPlateAppearanceValue(model, outs, 0, 0, outs + 1, 0, outs === 2, runsNeeded);
    expect(0.3 * homeRun + 0.7 * strikeout, `${outs} outs, target ${runsNeeded}`).toBeCloseTo(0, 10);
   }

   const loadedState = outs * 8 + 7;
   const finiteHomeRun = centeredPlateAppearanceValue(model, outs, 7, 4, outs, 0, true, 4);
   const finiteStrikeout = centeredPlateAppearanceValue(model, outs, 7, 0, outs + 1, 7, outs === 2, 4);
   expect(0.3 * finiteHomeRun + 0.7 * finiteStrikeout, `${outs} outs, full-HR target 4`).toBeCloseTo(0, 10);

   const infiniteHomeRun = centeredPlateAppearanceValue(model, outs, 7, 4, outs, 0, false, Infinity);
   const infiniteStrikeout = centeredPlateAppearanceValue(model, outs, 7, 0, outs + 1, 7, outs === 2, Infinity);
   expect(0.3 * infiniteHomeRun + 0.7 * infiniteStrikeout, `${outs} outs, full-HR infinite target`).toBeCloseTo(0, 10);
   expect(infiniteHomeRun + model.expectancy[loadedState] + model.muPA[loadedState * 5 + 4])
    .toBeCloseTo(4 + model.expectancy[outs * 8], 10);
  }
 });
});
