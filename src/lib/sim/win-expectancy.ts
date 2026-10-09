import type { Rates } from '../game/types.ts';
import { validateRates } from './validation.ts';

const STATE_COUNT = 24;
const MASS_TOLERANCE = 1e-13;
const MAX_TRANSITIONS = 4096;

interface SignedDistribution {
 probabilities: Float64Array;
 upperTail: Float64Array;
 offset: number;
}


const OUT_TRANSITION = 64;

export function neutralTransition(mask: number, event: number): number {
 if (event <= 1) {
  if ((mask & 1) === 0) return mask | 1;
  if ((mask & 2) === 0) return (mask & 4) | 3;
  if ((mask & 4) === 0) return 7;
  return 7 | (1 << 3);
 }
 if (event === 2 || event === 7) return mask | OUT_TRANSITION;
 if (event === 3) return 1 | ((mask & 1) << 1) | ((((mask >> 1) & 1) + ((mask >> 2) & 1)) << 3);
 if (event === 4) return 2 | ((mask & 1) << 2) | ((((mask >> 1) & 1) + ((mask >> 2) & 1)) << 3);
 if (event === 5) return 4 | (((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1)) << 3);
 return ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + 1) << 3;
}

/**
 * Absorbing neutral half-inning Markov distribution. Future singles send runners
 * from second and third home, doubles score second and third while first takes
 * third, and outs do not advance runners. Steals, errors, double plays, and
 * sacrifice flies are intentionally omitted from future-state projections.
 */
export function neutralRunDistribution(rates: Rates, outs = 0, bases = 0): Float64Array {
 validateRates(rates);
 if (!Number.isInteger(outs) || outs < 0 || outs > 3 || !Number.isInteger(bases) || bases < 0 || bases > 7) throw new Error('Invalid neutral inning state');
 const totalRate = rates.reduce((sum, rate) => sum + rate, 0);
 const normalized = rates.map(rate => rate / totalRate);
 const outRate = rates[2] + rates[7];
 if (outRate <= 0) throw new Error('Neutral win model requires a positive out rate');
 if (outs === 3) return Float64Array.of(1);

 let active = new Map<number, number>([[outs * 8 + bases, 1]]);
 const completed: number[] = [];
 let activeMass = 1;
 for (let step = 0; step < MAX_TRANSITIONS && activeMass > MASS_TOLERANCE; step++) {
  const next = new Map<number, number>();
  for (const [key, stateProbability] of active) {
   const runs = Math.floor(key / STATE_COUNT);
   const state = key % STATE_COUNT;
   const stateOuts = Math.floor(state / 8);
   const stateBases = state % 8;
   for (let event = 0; event < rates.length; event++) {
    const probability = stateProbability * normalized[event];
    if (probability === 0) continue;
    const result = neutralTransition(stateBases, event);
    const resultRuns = (result >> 3) & 7;
    const resultOut = (result & OUT_TRANSITION) !== 0;
    const nextRuns = runs + resultRuns;
    if (resultOut && stateOuts === 2) completed[nextRuns] = (completed[nextRuns] ?? 0) + probability;
    else {
     const nextState = (stateOuts + (resultOut ? 1 : 0)) * 8 + (result & 7);
     const nextKey = nextRuns * STATE_COUNT + nextState;
     next.set(nextKey, (next.get(nextKey) ?? 0) + probability);
    }
   }
  }
  active = next;
  activeMass = 0;
  for (const probability of active.values()) activeMass += probability;
  if (!Number.isFinite(activeMass)) throw new Error('Neutral win model produced invalid probability mass');
 }
 if (activeMass > MASS_TOLERANCE) throw new Error('Neutral win model did not converge');
 const absorbed = completed.reduce((sum, value = 0) => sum + value, 0);
 if (!Number.isFinite(absorbed) || Math.abs(absorbed + activeMass - 1) > 1e-10 || absorbed <= 0) throw new Error('Neutral win model lost probability mass');
 const distribution = Float64Array.from(completed, value => (value ?? 0) / absorbed);
 const total = distribution.reduce((sum, probability) => sum + probability, 0);
 if (Math.abs(total - 1) > 1e-12) throw new Error('Invalid neutral run distribution');
 return distribution;
}

/** Expected future runs in each of the 24 transient base/out states. */
export function neutralRunExpectancy(rates: Rates): Float64Array {
 validateRates(rates);
 const expectancy = new Float64Array(STATE_COUNT);
 for (let state = 0; state < STATE_COUNT; state++) {
  const distribution = neutralRunDistribution(rates, Math.floor(state / 8), state & 7);
  let value = 0;
  for (let runs = 1; runs < distribution.length; runs++) value += runs * distribution[runs];
  expectancy[state] = value;
 }
 return expectancy;
}

/**
 * Expected visits to every transient state in a neutral half inning beginning
 * empty with no outs. These are the fundamental-matrix row used by defensive
 * reference valuation; runs do not affect state visitation.
 */
export function neutralStateVisits(rates: Rates): Float64Array {
 validateRates(rates);
 const totalRate = rates.reduce((sum, rate) => sum + rate, 0);
 const normalized = rates.map(rate => rate / totalRate);
 const active = new Float64Array(STATE_COUNT);
 const next = new Float64Array(STATE_COUNT);
 const visits = new Float64Array(STATE_COUNT);
 active[0] = 1;
 let activeMass = 1;
 for (let step = 0; step < MAX_TRANSITIONS && activeMass > MASS_TOLERANCE; step++) {
  next.fill(0);
  for (let state = 0; state < STATE_COUNT; state++) {
   const stateProbability = active[state];
   if (stateProbability === 0) continue;
   visits[state] += stateProbability;
   const outs = Math.floor(state / 8);
   const bases = state & 7;
   for (let event = 0; event < rates.length; event++) {
    const probability = stateProbability * normalized[event];
    if (probability === 0) continue;
    const result = neutralTransition(bases, event);
    const isOut = (result & OUT_TRANSITION) !== 0;
    if (!isOut || outs < 2) next[(outs + (isOut ? 1 : 0)) * 8 + (result & 7)] += probability;
   }
  }
  activeMass = 0;
  for (let state = 0; state < STATE_COUNT; state++) {
   active[state] = next[state];
   activeMass += next[state];
  }
 }
 if (activeMass > MASS_TOLERANCE || visits.some(value => !Number.isFinite(value))) throw new Error('Neutral state visits did not converge');
 return visits;
}

function convolve(left: Float64Array, right: Float64Array): Float64Array {
 const result = new Float64Array(left.length + right.length - 1);
 for (let a = 0; a < left.length; a++) for (let b = 0; b < right.length; b++) result[a + b] += left[a] * right[b];
 return result;
}
function signed(probabilities: Float64Array, offset: number): SignedDistribution {
 const total = probabilities.reduce((sum, probability) => sum + probability, 0);
 if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-10 || probabilities.some(probability => probability < 0 || !Number.isFinite(probability))) throw new Error('Neutral win model produced an invalid distribution');
 const upperTail = new Float64Array(probabilities.length + 1);
 for (let index = probabilities.length - 1; index >= 0; index--) upperTail[index] = upperTail[index + 1] + probabilities[index];
 return { probabilities, upperTail, offset };
}


function signedDifference(home: Float64Array, away: Float64Array): SignedDistribution {
 const offset = away.length - 1;
 const probabilities = new Float64Array(home.length + away.length - 1);
 for (let homeRuns = 0; homeRuns < home.length; homeRuns++) {
  for (let awayRuns = 0; awayRuns < away.length; awayRuns++) probabilities[homeRuns - awayRuns + offset] += home[homeRuns] * away[awayRuns];
 }
 return signed(probabilities, offset);
}

function convolveSigned(left: SignedDistribution, right: SignedDistribution): SignedDistribution {
 return signed(convolve(left.probabilities, right.probabilities), left.offset + right.offset);
}


function expectedWin(distribution: SignedDistribution, scoreDifference: number): number {
 const tieIndex = distribution.offset - scoreDifference;
 if (tieIndex < 0) return 1;
 if (tieIndex >= distribution.probabilities.length) return 0;
 return distribution.upperTail[tieIndex + 1] + 0.5 * distribution.probabilities[tieIndex];
}

/** A deterministic, equal-strength win model built once and reused across games. */
export class WinExpectancyModel {
 readonly #rates: Rates;
 readonly #runDistributions = new Map<number, Float64Array>();
 readonly #futureDifferentials = new Map<number, SignedDistribution>();
 readonly #topRemainders = new Map<number, SignedDistribution>();
 readonly #bottomRemainders = new Map<number, SignedDistribution>();

 constructor(rates: Rates) {
  validateRates(rates);
  if (rates[2] + rates[7] <= 0) throw new Error('Neutral win model requires a positive out rate');
  this.#rates = [...rates] as Rates;
  this.#futureDifferentials.set(0, signed(Float64Array.of(1), 0));
 }

 runDistribution(outs: number, bases: number): Float64Array {
  if (!Number.isInteger(outs) || outs < 0 || outs > 3 || !Number.isInteger(bases) || bases < 0 || bases > 7) throw new Error('Invalid neutral inning state');
  const key = outs * 8 + bases;
  let distribution = this.#runDistributions.get(key);
  if (!distribution) {
   distribution = neutralRunDistribution(this.#rates, outs, bases);
   this.#runDistributions.set(key, distribution);
  }
  return distribution;
 }

 #futureDifferential(innings: number): SignedDistribution {
  const cached = this.#futureDifferentials.get(innings);
  if (cached) return cached;
  const full = this.runDistribution(0, 0);
  const one = signedDifference(full, full);
  const result = convolveSigned(this.#futureDifferential(innings - 1), one);
  this.#futureDifferentials.set(innings, result);
  return result;
 }

 #topRemainder(inning: number): SignedDistribution {
  const key = Math.min(inning, 9);
  const cached = this.#topRemainders.get(key);
  if (cached) return cached;
  const result = convolveSigned(signed(this.runDistribution(0, 0), 0), this.#futureDifferential(Math.max(0, 9 - key)));
  this.#topRemainders.set(key, result);
  return result;
 }

 #bottomRemainder(inning: number): SignedDistribution {
  const key = Math.min(inning, 9);
  const cached = this.#bottomRemainders.get(key);
  if (cached) return cached;
  const result = this.#futureDifferential(Math.max(0, 9 - key));
  this.#bottomRemainders.set(key, result);
  return result;
 }

 homeWinProbability(inning: number, half: 'top' | 'bottom', outs: number, bases: number, homeRuns: number, awayRuns: number): number {
  if (!Number.isInteger(inning) || inning < 1 || (half !== 'top' && half !== 'bottom') || !Number.isInteger(outs) || outs < 0 || outs > 3 || !Number.isInteger(bases) || bases < 0 || bases > 7 || !Number.isInteger(homeRuns) || homeRuns < 0 || !Number.isInteger(awayRuns) || awayRuns < 0) throw new Error('Invalid win expectancy state');
  const scoreDifference = homeRuns - awayRuns;
  if (half === 'bottom' && inning >= 9 && scoreDifference > 0) return 1;
  const current = this.runDistribution(outs, bases);
  let probability = 0;

  if (half === 'top') {
   const remainder = this.#topRemainder(inning);
   for (let awayAdditional = 0; awayAdditional < current.length; awayAdditional++) {
    const currentProbability = current[awayAdditional];
    if (inning >= 9 && scoreDifference - awayAdditional > 0) probability += currentProbability;
    else probability += currentProbability * expectedWin(remainder, scoreDifference - awayAdditional);
   }
  } else {
   const remainder = this.#bottomRemainder(inning);
   for (let homeAdditional = 0; homeAdditional < current.length; homeAdditional++) {
    const currentProbability = current[homeAdditional];
    probability += currentProbability * expectedWin(remainder, scoreDifference + homeAdditional);
   }
  }

  if (!Number.isFinite(probability) || probability < -1e-12 || probability > 1 + 1e-12) throw new Error('Neutral win model produced an invalid win probability');
  return Math.max(0, Math.min(1, probability));
 }
}
