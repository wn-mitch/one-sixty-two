import { TRACE_AUTOMATIC_DOUBLE, TRACE_DEAD_BALL, TRACE_HOME_RUN, type FlightTrace } from './flight.ts';

/** Fixed starting coordinates (meters) in POSITIONS order: C, 1B, 2B, 3B, SS, LF, CF, RF. */
export const DEFENDER_START: readonly (readonly [number, number])[] = [
 [0, -1.5], [23, 26], [13, 38], [-23, 26], [-13, 38], [-55, 75], [0, 95], [55, 75]
];
/**
 * Declared fielding model constants, in POSITIONS order where per position. Reaction is the
 * read before movement (the outfield value folds in route reading, matching Statcast-style
 * jumps); reach probability is logistic in (ball time - arrival). Fitted by multinomial
 * log-loss to 2025 Statcast outcomes per 5 mph x 5 degree bin (neutral park, observed spray
 * mix, carry quadrature): 0.624 against 0.707 for the hand-set starting values.
 */
export const FIELDING_MODEL = {
 speedMps: [5.35, 5.35, 5.35, 5.35, 5.35, 8.08, 8.08, 8.08] as readonly number[],
 reactionS: [0.06, 0.06, 0.06, 0.06, 0.06, 1.09, 1.09, 1.09] as readonly number[],
 reachScaleS: 0.44,
 catchHeightM: 3,
 /** Infielders attack rolling balls only within this distance of home plate. */
 infieldAttemptRadiusM: 40.05,
 /** An infielder attacks the first point reached with at least this probability. */
 sureReach: 0.95,
 /** Gather-and-set time before a throw. */
 transferS: [0.87, 0.87, 0.87, 0.87, 0.87, 1.51, 1.51, 1.51] as readonly number[],
 throwMps: 30.26,
 /** The batter takes another base with logistic probability in (throw arrival - runner arrival). */
 advanceScaleS: 0.74
};
export const RUNNER_START_S = 0.25;
export const BASEPATH_M = 27.432;
const HALF_DIAGONAL = BASEPATH_M / Math.SQRT2;
/** First, second, and third base coordinates. */
export const BASES: readonly (readonly [number, number])[] = [[HALF_DIAGONAL, HALF_DIAGONAL], [0, 2 * HALF_DIAGONAL], [-HALF_DIAGONAL, HALF_DIAGONAL]];
const INFIELDERS = 5;

export const defenderSpeed = (position: number, hitPrevention: number): number => FIELDING_MODEL.speedMps[position] * (1 + 0.15 * hitPrevention);
export const defenderReaction = (position: number, hitPrevention: number): number => Math.max(0, FIELDING_MODEL.reactionS[position] - 0.08 * hitPrevention);
/** Outfielders use outfield throwing; infield and catcher throws on batted balls use the base speed. */
export const throwSpeed = (position: number, outfieldThrowing: number): number => FIELDING_MODEL.throwMps * (1 + 0.10 * (position >= 5 ? outfieldThrowing : 0));
/** Effective basepath speed (m/s); average runners (0.5) keep the 7 m/s used in the fielding fit. */
export const runnerSpeed = (speed: number): number => 6.5 + speed;
export const runnerArrival = (speed: number, bases: number): number => RUNNER_START_S + bases * BASEPATH_M / runnerSpeed(speed);
const reach = (ballTime: number, arrival: number): number => 1 / (1 + Math.exp(-(ballTime - arrival) / FIELDING_MODEL.reachScaleS));
const advance = (runner: number, thrown: number): number => 1 / (1 + Math.exp(-(thrown - runner) / FIELDING_MODEL.advanceScaleS));

/**
 * Per position and skill setting (0 = neutral, 1 = actual): best airborne point, best ground
 * point, and retrieval of a ball that gets past the infield. Built once per trace.
 */
export interface FieldingCandidates {
 airIndex: Int32Array; airProbability: Float64Array;
 groundIndex: Int32Array; groundProbability: Float64Array; groundPickup: Float64Array;
 retrievalTime: Float64Array; retrievalX: Float64Array; retrievalY: Float64Array;
}

export function createFieldingCandidates(): FieldingCandidates {
 return {
  airIndex: new Int32Array(16), airProbability: new Float64Array(16),
  groundIndex: new Int32Array(16), groundProbability: new Float64Array(16), groundPickup: new Float64Array(16),
  retrievalTime: new Float64Array(16), retrievalX: new Float64Array(16), retrievalY: new Float64Array(16)
 };
}

function fillCandidate(trace: FlightTrace, position: number, hitPrevention: number, candidates: FieldingCandidates, slot: number): void {
 const speed = defenderSpeed(position, hitPrevention);
 const reaction = defenderReaction(position, hitPrevention);
 const [sx, sy] = DEFENDER_START[position];
 const airborneEnd = trace.landing < 0 ? trace.count : trace.landing;
 let airIndex = -1, airProbability = 0;
 for (let index = 1; index < airborneEnd; index++) {
  const time = trace.t[index];
  if (time < reaction || trace.z[index] > FIELDING_MODEL.catchHeightM) continue;
  const probability = reach(time, reaction + Math.hypot(trace.x[index] - sx, trace.y[index] - sy) / speed);
  if (probability > airProbability) { airProbability = probability; airIndex = index; }
 }
 candidates.airIndex[slot] = airIndex;
 candidates.airProbability[slot] = airProbability;
 let groundIndex = -1, groundProbability = 0, groundPickup = 0;
 let retrievalTime = Infinity, retrievalX = 0, retrievalY = 0;
 if (trace.landing >= 0) {
  for (let index = trace.landing; index < trace.count; index++) {
   const time = trace.t[index];
   const arrival = reaction + Math.hypot(trace.x[index] - sx, trace.y[index] - sy) / speed;
   if (position < INFIELDERS && time >= reaction && groundProbability < FIELDING_MODEL.sureReach && Math.hypot(trace.x[index], trace.y[index]) <= FIELDING_MODEL.infieldAttemptRadiusM) {
    const probability = reach(time, arrival);
    if (probability > groundProbability) { groundProbability = probability; groundIndex = index; groundPickup = Math.max(time, arrival); }
   }
   if (retrievalTime === Infinity && arrival <= time) { retrievalTime = time; retrievalX = trace.x[index]; retrievalY = trace.y[index]; }
  }
  if (retrievalTime === Infinity) {
   const last = trace.count - 1;
   retrievalX = trace.x[last]; retrievalY = trace.y[last];
   retrievalTime = Math.max(trace.t[last], reaction + Math.hypot(retrievalX - sx, retrievalY - sy) / speed);
  }
 }
 candidates.groundIndex[slot] = groundIndex;
 candidates.groundProbability[slot] = groundProbability;
 candidates.groundPickup[slot] = groundPickup;
 candidates.retrievalTime[slot] = retrievalTime;
 candidates.retrievalX[slot] = retrievalX;
 candidates.retrievalY[slot] = retrievalY;
}

/** Slot `position` holds the neutral defender and slot `8 + position` the actual defender. */
export function computeCandidates(trace: FlightTrace, hitPrevention: ArrayLike<number>, candidates: FieldingCandidates): void {
 for (let position = 0; position < 8; position++) {
  fillCandidate(trace, position, 0, candidates, position);
  if (hitPrevention[position] === 0) copySlot(candidates, position, 8 + position);
  else fillCandidate(trace, position, hitPrevention[position], candidates, 8 + position);
 }
}

/** Refills only `position`'s actual slot for a different reach skill. */
export function fillActualCandidate(trace: FlightTrace, position: number, hitPrevention: number, candidates: FieldingCandidates): void {
 if (hitPrevention === 0) copySlot(candidates, position, 8 + position);
 else fillCandidate(trace, position, hitPrevention, candidates, 8 + position);
}

function copySlot(candidates: FieldingCandidates, from: number, to: number): void {
 candidates.airIndex[to] = candidates.airIndex[from];
 candidates.airProbability[to] = candidates.airProbability[from];
 candidates.groundIndex[to] = candidates.groundIndex[from];
 candidates.groundProbability[to] = candidates.groundProbability[from];
 candidates.groundPickup[to] = candidates.groundPickup[from];
 candidates.retrievalTime[to] = candidates.retrievalTime[from];
 candidates.retrievalX[to] = candidates.retrievalX[from];
 candidates.retrievalY[to] = candidates.retrievalY[from];
}

export const OUTCOME_CAUGHT = 0;
export const OUTCOME_GROUND_OUT = 1;
export const OUTCOME_INFIELD_HIT = 2;
export const OUTCOME_HIT = 3;
export const OUTCOME_HOME_RUN = 4;
export const OUTCOME_AUTOMATIC_DOUBLE = 5;
export const OUTCOME_FOUL = 6;

/**
 * The runner-speed-independent part of fielding: one catch attempt by the best airborne
 * candidate, sequential infield ground attempts in ball-time order, then retrieval.
 */
export interface FieldingPlan {
 terminal: number;
 fair: boolean;
 airFielder: number; airProbability: number;
 groundCount: number; groundFielder: Int8Array; groundProbability: Float64Array; groundThrow: Float64Array;
 retriever: number;
 /** Throw arrival at first, second, and third after retrieval. */
 retrievalThrow: Float64Array;
}

export function createFieldingPlan(): FieldingPlan {
 return {
  terminal: 0, fair: true, airFielder: -1, airProbability: 0,
  groundCount: 0, groundFielder: new Int8Array(INFIELDERS), groundProbability: new Float64Array(INFIELDERS), groundThrow: new Float64Array(INFIELDERS),
  retriever: -1, retrievalThrow: new Float64Array(3)
 };
}

const groundTimes = new Float64Array(INFIELDERS);

/**
 * `reachEnabled[p]` selects position p's actual range; `outfieldThrowing` holds the arm
 * skills in force (zeros for the neutral throw).
 */
export function buildFieldingPlan(
 trace: FlightTrace,
 candidates: FieldingCandidates,
 reachEnabled: ArrayLike<number>,
 outfieldThrowing: ArrayLike<number>,
 plan: FieldingPlan
): void {
 plan.terminal = trace.end;
 plan.fair = trace.fair;
 plan.airFielder = -1;
 plan.airProbability = 0;
 for (let position = 0; position < 8; position++) {
  const slot = reachEnabled[position] ? 8 + position : position;
  if (candidates.airIndex[slot] >= 0 && candidates.airProbability[slot] > plan.airProbability) {
   plan.airProbability = candidates.airProbability[slot];
   plan.airFielder = position;
  }
 }
 plan.groundCount = 0;
 plan.retriever = -1;
 if (trace.landing < 0) return;
 for (let position = 0; position < INFIELDERS; position++) {
  const slot = reachEnabled[position] ? 8 + position : position;
  const index = candidates.groundIndex[slot];
  if (index < 0 || candidates.groundProbability[slot] <= 0) continue;
  const time = trace.t[index];
  let insert = plan.groundCount++;
  while (insert > 0 && groundTimes[insert - 1] > time) {
   groundTimes[insert] = groundTimes[insert - 1];
   plan.groundFielder[insert] = plan.groundFielder[insert - 1];
   plan.groundProbability[insert] = plan.groundProbability[insert - 1];
   plan.groundThrow[insert] = plan.groundThrow[insert - 1];
   insert--;
  }
  groundTimes[insert] = time;
  plan.groundFielder[insert] = position;
  plan.groundProbability[insert] = candidates.groundProbability[slot];
  plan.groundThrow[insert] = candidates.groundPickup[slot] + FIELDING_MODEL.transferS[position] +
   Math.hypot(trace.x[index] - BASES[0][0], trace.y[index] - BASES[0][1]) / throwSpeed(position, outfieldThrowing[position]);
 }
 let bestTime = Infinity;
 for (let position = 0; position < 8; position++) {
  const slot = reachEnabled[position] ? 8 + position : position;
  if (candidates.retrievalTime[slot] < bestTime) { bestTime = candidates.retrievalTime[slot]; plan.retriever = position; }
 }
 const slot = reachEnabled[plan.retriever] ? 8 + plan.retriever : plan.retriever;
 const speed = throwSpeed(plan.retriever, outfieldThrowing[plan.retriever]);
 for (let base = 0; base < 3; base++) {
  plan.retrievalThrow[base] = bestTime + FIELDING_MODEL.transferS[plan.retriever] +
   Math.hypot(candidates.retrievalX[slot] - BASES[base][0], candidates.retrievalY[slot] - BASES[base][1]) / speed;
 }
}

/** Mutually exclusive physical outcomes in sampling order. */
export interface PhysicalOutcomes {
 count: number; kind: Int8Array; fielder: Int8Array; bases: Int8Array; probability: Float64Array;
}

export function createPhysicalOutcomes(): PhysicalOutcomes {
 return { count: 0, kind: new Int8Array(12), fielder: new Int8Array(12), bases: new Int8Array(12), probability: new Float64Array(12) };
}

function add(outcomes: PhysicalOutcomes, kind: number, fielder: number, bases: number, probability: number): void {
 if (probability <= 0) return;
 const index = outcomes.count++;
 outcomes.kind[index] = kind;
 outcomes.fielder[index] = fielder;
 outcomes.bases[index] = bases;
 outcomes.probability[index] = probability;
}

/** Expands a plan into outcome probabilities for a batter with the given speed skill. */
export function fieldingOutcomes(plan: FieldingPlan, batterSpeed: number, outcomes: PhysicalOutcomes): void {
 outcomes.count = 0;
 let remaining = 1;
 if (plan.airFielder >= 0) {
  add(outcomes, OUTCOME_CAUGHT, plan.airFielder, 0, plan.airProbability);
  remaining -= plan.airProbability;
 }
 if (plan.terminal === TRACE_HOME_RUN) return add(outcomes, OUTCOME_HOME_RUN, -1, 4, remaining);
 if (plan.terminal === TRACE_AUTOMATIC_DOUBLE) return add(outcomes, OUTCOME_AUTOMATIC_DOUBLE, -1, 2, remaining);
 if (plan.terminal === TRACE_DEAD_BALL || !plan.fair) return add(outcomes, OUTCOME_FOUL, -1, 0, remaining);
 const toFirst = runnerArrival(batterSpeed, 1);
 for (let index = 0; index < plan.groundCount; index++) {
  const probability = remaining * plan.groundProbability[index];
  add(outcomes, plan.groundThrow[index] < toFirst ? OUTCOME_GROUND_OUT : OUTCOME_INFIELD_HIT, plan.groundFielder[index], plan.groundThrow[index] < toFirst ? 0 : 1, probability);
  remaining -= probability;
 }
 // P(reach base b) is logistic in the throw margin; reaching third requires reaching second.
 const second = advance(runnerArrival(batterSpeed, 2), plan.retrievalThrow[1]);
 const third = Math.min(second, advance(runnerArrival(batterSpeed, 3), plan.retrievalThrow[2]));
 add(outcomes, OUTCOME_HIT, plan.retriever, 1, remaining * (1 - second));
 add(outcomes, OUTCOME_HIT, plan.retriever, 2, remaining * (second - third));
 add(outcomes, OUTCOME_HIT, plan.retriever, 3, remaining * third);
}

/** The shared fielding uniform walks the outcomes in order. */
export function selectOutcome(outcomes: PhysicalOutcomes, uniform: number): number {
 if (!(uniform >= 0 && uniform < 1) || outcomes.count === 0) throw new Error('Invalid fielding selection');
 let cumulative = 0;
 for (let index = 0; index < outcomes.count; index++) {
  cumulative += outcomes.probability[index];
  if (uniform < cumulative) return index;
 }
 return outcomes.count - 1;
}

/**
 * Dense index for aggregated physical outcomes: caught (8 fielders), ground out (5),
 * infield hit (5), hit by retriever and bases (8 x 3), home run, automatic double.
 */
export const PHYSICAL_CLASS_COUNT = 44;
export function physicalClass(kind: number, fielder: number, bases: number): number {
 if (kind === OUTCOME_CAUGHT) return fielder;
 if (kind === OUTCOME_GROUND_OUT) return 8 + fielder;
 if (kind === OUTCOME_INFIELD_HIT) return 13 + fielder;
 if (kind === OUTCOME_HIT) return 18 + fielder * 3 + bases - 1;
 if (kind === OUTCOME_HOME_RUN) return 42;
 if (kind === OUTCOME_AUTOMATIC_DOUBLE) return 43;
 throw new Error('Foul outcomes have no physical class');
}
export function classKind(index: number): { kind: number; fielder: number; bases: number } {
 if (index < 8) return { kind: OUTCOME_CAUGHT, fielder: index, bases: 0 };
 if (index < 13) return { kind: OUTCOME_GROUND_OUT, fielder: index - 8, bases: 0 };
 if (index < 18) return { kind: OUTCOME_INFIELD_HIT, fielder: index - 13, bases: 1 };
 if (index < 42) return { kind: OUTCOME_HIT, fielder: Math.floor((index - 18) / 3), bases: (index - 18) % 3 + 1 };
 if (index === 42) return { kind: OUTCOME_HOME_RUN, fielder: -1, bases: 4 };
 if (index === 43) return { kind: OUTCOME_AUTOMATIC_DOUBLE, fielder: -1, bases: 2 };
 throw new Error('Invalid physical class');
}
