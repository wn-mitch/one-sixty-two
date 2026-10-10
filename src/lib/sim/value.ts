import type { DefensiveEnvironment } from '../game/types.ts';
import { createDefensiveReference, expectedNeutralPlateAppearanceValue, type DefensiveReference } from './defense.ts';
import { stealSuccessProbability } from './defense-rules.ts';
import type { BatterLine, DefensiveRunComponents, PitcherLine } from './types.ts';

const TARGET_COUNT = 5;
const INFINITY_TARGET = 4;

export interface RunValueModel {
 readonly reference: DefensiveReference;
 readonly expectancy: Float64Array;
 readonly muPA: Float64Array;
 readonly muSteal: Float64Array;
}

const MODELS = new WeakMap<object, RunValueModel>();

export function createDefensiveRunComponents(): DefensiveRunComponents {
 return { hitPrevention: 0, errorAvoidance: 0, doublePlay: 0, outfieldThrowing: 0, catcherThrowing: 0 };
}

function targetIndex(runsNeeded: number): number {
 if (!Number.isFinite(runsNeeded) || runsNeeded > 4) return INFINITY_TARGET;
 return Math.max(0, Math.ceil(runsNeeded) - 1);
}

export function createRunValueModel(environment: DefensiveEnvironment): RunValueModel {
 const reference = createDefensiveReference(environment);
 const muPA = new Float64Array(24 * TARGET_COUNT);
 const muSteal = new Float64Array(24);
 for (let state = 0; state < 24; state++) {
  const before = reference.runExpectancy[state];
  for (let target = 0; target < TARGET_COUNT; target++) {
   const runsNeeded = target === INFINITY_TARGET ? Infinity : target + 1;
   muPA[state * TARGET_COUNT + target] = expectedNeutralPlateAppearanceValue(reference, state, runsNeeded) - before;
  }
  const outs = Math.floor(state / 8);
  const bases = state & 7;
  if ((bases & 1) !== 0 && (bases & 2) === 0) {
   const successBases = (bases & ~1) | 2;
   const caughtOuts = outs + 1;
   const success = stealSuccessProbability(environment.leagueStealSuccess, 0);
   const after = success * reference.runExpectancy[outs * 8 + successBases] +
    (1 - success) * (caughtOuts >= 3 ? 0 : reference.runExpectancy[caughtOuts * 8 + (bases & ~1)]);
   muSteal[state] = after - before;
  }
 }
 return { reference, expectancy: reference.runExpectancy, muPA, muSteal };
}

export function getRunValueModel(environment: DefensiveEnvironment): RunValueModel {
 const cached = MODELS.get(environment);
 if (cached) return cached;
 const created = createRunValueModel(environment);
 MODELS.set(environment, created);
 return created;
}

export function remainingRunExpectancy(model: RunValueModel, outs: number, bases: number, ended: boolean): number {
 if (ended || outs >= 3) return 0;
 return model.expectancy[outs * 8 + bases];
}

export function centeredPlateAppearanceValue(
 model: RunValueModel,
 outsBefore: number,
 basesBefore: number,
 runs: number,
 outsAfter: number,
 basesAfter: number,
 ended: boolean,
 runsNeeded: number
): number {
 const state = outsBefore * 8 + basesBefore;
 const before = model.expectancy[state];
 const after = remainingRunExpectancy(model, outsAfter, basesAfter, ended);
 return runs + after - before - model.muPA[state * TARGET_COUNT + targetIndex(runsNeeded)];
}

export function centeredStealValue(
 model: RunValueModel,
 outsBefore: number,
 basesBefore: number,
 outsAfter: number,
 basesAfter: number
): number {
 const state = outsBefore * 8 + basesBefore;
 const before = model.expectancy[state];
 const after = remainingRunExpectancy(model, outsAfter, basesAfter, false);
 return after - before - model.muSteal[state];
}

export function estimatedHitterWar(line: BatterLine): number {
 return (line.battingRuns + line.stealRuns + line.defensiveRuns + 20 * line.PA / 600) / 10;
}

export function estimatedPitcherWar(line: PitcherLine): number {
 return (line.pitchingRunsAboveNeutral + 20 * line.outs / 600) / 10;
}
