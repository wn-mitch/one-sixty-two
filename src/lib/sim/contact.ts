import { POSITIONS, type DefensiveEnvironment, type Rates } from '../game/types.ts';
import type { Bases } from './advancement.ts';
import {
 advancementAttemptProbability,
 advancementOutProbability,
 doublePlayParticipants,
 doublePlayProbability,
 fieldingErrorProbability,
 hitConversionProbability,
 responsibleOutfielder,
 responsiblePosition
} from './defense-rules.ts';
import type { TeamInput } from './types.ts';

export const CONTACT_UNIFORM_COUNT = 11;
export const CONTACT_RESPONSIBILITY = 0;
export const CONTACT_HIT_CONVERSION = 1;
export const CONTACT_ERROR = 2;
export const CONTACT_DOUBLE_PLAY = 3;
export const CONTACT_OUTFIELD = 4;
export const CONTACT_THIRD_ATTEMPT = 5;
export const CONTACT_THIRD_OUT = 6;
export const CONTACT_SECOND_ATTEMPT = 7;
export const CONTACT_SECOND_OUT = 8;
export const CONTACT_FIRST_ATTEMPT = 9;
export const CONTACT_FIRST_OUT = 10;

export interface PreparedDefense {
 hitterByPosition: Int8Array;
 hitPrevention: Float64Array;
 doublePlay: Float64Array;
 outfieldThrowing: Float64Array;
 errorAvoidance: Float64Array;
 catcherThrowing: Float64Array;
 errorBaseline: Float64Array;
}

export interface ContactResult {
 runners: Int16Array;
 pitchers: Int16Array;
 scoredRunners: Int16Array;
 scoredPitchers: Int16Array;
 caughtRunners: Int16Array;
 outsAfter: number;
 runs: number;
 caughtCount: number;
 scoreCount: number;
 creditedBases: number;
 fielder: number;
 thrower: number;
 error: boolean;
 doublePlay: boolean;
 sacrificeFly: boolean;
 caughtAdvancing: number;
 ended: boolean;
 winningAdvance: number;
}

export interface ContactOptions {
 hitPrevention: boolean;
 errorAvoidance: boolean;
 doublePlayPositions: Uint8Array;
 outfieldThrowing: boolean;
}

export function createPreparedDefense(team: TeamInput, environment: DefensiveEnvironment): PreparedDefense {
 const prepared: PreparedDefense = {
  hitterByPosition: new Int8Array(POSITIONS.length),
  hitPrevention: new Float64Array(POSITIONS.length),
  doublePlay: new Float64Array(POSITIONS.length),
  outfieldThrowing: new Float64Array(POSITIONS.length),
  errorAvoidance: new Float64Array(POSITIONS.length),
  catcherThrowing: new Float64Array(POSITIONS.length),
  errorBaseline: new Float64Array(POSITIONS.length)
 };
 for (let position = 0; position < POSITIONS.length; position++) {
  const name = POSITIONS[position];
  const hitter = team.defense[name];
  const skills = team.hitters[hitter].defense.positions[name];
  if (!skills) throw new Error(`Missing prepared defense for ${name}`);
  prepared.hitterByPosition[position] = hitter;
  prepared.hitPrevention[position] = skills.hitPrevention;
  prepared.doublePlay[position] = skills.doublePlay;
  prepared.outfieldThrowing[position] = skills.outfieldThrowing;
  prepared.errorAvoidance[position] = skills.errorAvoidance;
  prepared.catcherThrowing[position] = skills.catcherThrowing;
  prepared.errorBaseline[position] = environment.leagueErrorRates[name];
 }
 return prepared;
}

export function createContactResult(): ContactResult {
 return {
  runners: new Int16Array(3),
  pitchers: new Int16Array(3),
  scoredRunners: new Int16Array(4),
  scoredPitchers: new Int16Array(4),
  caughtRunners: new Int16Array(3),
  outsAfter: 0,
  runs: 0,
  caughtCount: 0,
  scoreCount: 0,
  creditedBases: 0,
  fielder: 0,
  thrower: 5,
  error: false,
  doublePlay: false,
  sacrificeFly: false,
  caughtAdvancing: -1,
  ended: false,
  winningAdvance: 0
 };
}

export function fillContactPacket(packet: Float64Array, random: () => number): void {
 if (packet.length !== CONTACT_UNIFORM_COUNT) throw new Error('Invalid contact packet');
 for (let index = 0; index < CONTACT_UNIFORM_COUNT; index++) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid contact random sample');
  packet[index] = value;
 }
}

function resetResult(result: ContactResult, bases: Pick<Bases, 'runners' | 'pitchers'>, outs: number, event: number): void {
 result.runners.set(bases.runners);
 result.caughtAdvancing = -1;
 result.pitchers.set(bases.pitchers);
 result.scoredRunners.fill(-1);
 result.scoredPitchers.fill(-1);
 result.caughtRunners.fill(-1);
 result.outsAfter = outs;
 result.runs = 0;
 result.scoreCount = 0;
 result.caughtCount = 0;
 result.creditedBases = event >= 3 && event <= 5 ? event - 2 : 0;
 result.error = false;
 result.doublePlay = false;
 result.sacrificeFly = false;
 result.ended = false;
 result.winningAdvance = 0;
}

function removeRunner(result: ContactResult, base: number): void {
 result.runners[base] = -1;
 result.pitchers[base] = -1;
}

function moveRunner(result: ContactResult, from: number, to: number): void {
 result.runners[to] = result.runners[from];
 result.pitchers[to] = result.pitchers[from];
 removeRunner(result, from);
}

function scoreRunner(result: ContactResult, base: number, advance: number, offenseRuns: number, target: number): boolean {
 result.scoredRunners[result.scoreCount] = result.runners[base];
 result.scoredPitchers[result.scoreCount] = result.pitchers[base];
 result.scoreCount++;
 result.runs++;
 removeRunner(result, base);
 if (offenseRuns + result.runs >= target) {
  result.ended = true;
  result.winningAdvance = advance;
  result.creditedBases = Math.min(result.creditedBases, advance);
 }
 return result.ended;
}

function attemptAdvance(
 result: ContactResult,
 from: number,
 heldBase: number,
 safeBase: number,
 baseline: number,
 arm: number,
 attemptUniform: number,
 outUniform: number,
 offenseRuns: number,
 target: number
): void {
 const runner = result.runners[from];
 if (runner < 0 || result.outsAfter >= 3 || result.ended) return;
 const attempt = advancementAttemptProbability(baseline, arm);
 if (attemptUniform >= attempt) {
  if (heldBase !== from) moveRunner(result, from, heldBase);
  return;
 }
 if (outUniform < advancementOutProbability(arm)) {
  removeRunner(result, from);
  result.outsAfter++;
  result.caughtAdvancing = runner;
  result.caughtRunners[result.caughtCount++] = runner;
  return;
 }
 if (safeBase < 0) scoreRunner(result, from, 3 - from, offenseRuns, target);
 else moveRunner(result, from, safeBase);
}

function forceOneBase(result: ContactResult, hitter: number, pitcher: number, offenseRuns: number, target: number): void {
 if (result.runners[0] >= 0) {
  if (result.runners[1] >= 0) {
   if (result.runners[2] >= 0 && scoreRunner(result, 2, 1, offenseRuns, target)) return;
   moveRunner(result, 1, 2);
  }
  moveRunner(result, 0, 1);
 }
 result.runners[0] = hitter;
 result.pitchers[0] = pitcher;
}

function resolveHit(
 result: ContactResult,
 basesTaken: number,
 hitter: number,
 pitcher: number,
 offense: readonly { speed: number }[],
 arm: number,
 packet: Float64Array,
 offenseRuns: number,
 target: number
): void {
 if (basesTaken === 3) {
  for (let base = 2; base >= 0; base--) if (result.runners[base] >= 0 && scoreRunner(result, base, 3 - base, offenseRuns, target)) return;
  result.runners[2] = hitter;
  result.pitchers[2] = pitcher;
  return;
 }
 if (basesTaken === 2) {
  for (let base = 2; base >= 1; base--) if (result.runners[base] >= 0 && scoreRunner(result, base, 3 - base, offenseRuns, target)) return;
  if (result.runners[0] >= 0) {
   const speed = offense[result.runners[0]].speed;
   attemptAdvance(result, 0, 2, -1, 0.35 + 0.40 * speed, arm, packet[CONTACT_FIRST_ATTEMPT], packet[CONTACT_FIRST_OUT], offenseRuns, target);
   if (result.outsAfter >= 3 || result.ended) return;
  }
  result.runners[1] = hitter;
  result.pitchers[1] = pitcher;
  return;
 }
 if (result.runners[2] >= 0 && scoreRunner(result, 2, 1, offenseRuns, target)) return;
 if (result.runners[1] >= 0) {
  const speed = offense[result.runners[1]].speed;
  attemptAdvance(result, 1, 2, -1, 0.45 + 0.40 * speed, arm, packet[CONTACT_SECOND_ATTEMPT], packet[CONTACT_SECOND_OUT], offenseRuns, target);
  if (result.outsAfter >= 3 || result.ended) return;
 }
 if (result.runners[0] >= 0) {
  if (result.runners[2] >= 0) moveRunner(result, 0, 1);
  else {
   const speed = offense[result.runners[0]].speed;
   attemptAdvance(result, 0, 1, 2, 0.15 + 0.35 * speed, arm, packet[CONTACT_FIRST_ATTEMPT], packet[CONTACT_FIRST_OUT], offenseRuns, target);
   if (result.outsAfter >= 3 || result.ended) return;
  }
 }
 result.runners[0] = hitter;
 result.pitchers[0] = pitcher;
}

function teamDoublePlaySkill(prepared: PreparedDefense, fielder: number, enabled: Uint8Array, participants: Uint8Array): number {
 const count = doublePlayParticipants(fielder, participants);
 let skill = 0;
 for (let index = 0; index < count; index++) {
  const position = participants[index];
  if (!enabled[position]) continue;
  let weight = 0;
  const pivot = fielder === 1 || fielder === 2 ? 4 : 2;
  if (position === fielder) weight += 0.4;
  if (position === pivot) weight += 0.4;
  if (position === 1) weight += 0.2;
  skill += weight * prepared.doublePlay[position];
 }
 return skill;
}

export function resolveContact(
 result: ContactResult,
 bases: Pick<Bases, 'runners' | 'pitchers'>,
 outs: number,
 event: number,
 rates: Rates | Float64Array,
 hitter: number,
 pitcher: number,
 offense: readonly { speed: number }[],
 batterDoublePlay: number,
 prepared: PreparedDefense,
 options: ContactOptions,
 packet: Float64Array,
 offenseRuns: number,
 target: number,
 participants: Uint8Array
): void {
 if (packet.length !== CONTACT_UNIFORM_COUNT || (event !== 3 && event !== 4 && event !== 5 && event !== 7)) throw new Error('Invalid contact resolution input');
 resetResult(result, bases, outs, event);
 const fielder = responsiblePosition(packet[CONTACT_RESPONSIBILITY]);
 const thrower = responsibleOutfielder(packet[CONTACT_OUTFIELD]);
 result.fielder = fielder;
 result.thrower = event === 7 && fielder >= 5 ? fielder : thrower;
 const hp = options.hitPrevention ? prepared.hitPrevention[fielder] : 0;
 const conversion = hitConversionProbability(rates, event, hp);
 if (event >= 3 && event <= 5) {
  if (conversion > 0 && packet[CONTACT_HIT_CONVERSION] < conversion) {
   result.creditedBases = 0;
   result.outsAfter++;
   return;
  }
  const arm = options.outfieldThrowing ? prepared.outfieldThrowing[thrower] : 0;
  resolveHit(result, event - 2, hitter, pitcher, offense, arm, packet, offenseRuns, target);
  return;
 }
 if (conversion > 0 && packet[CONTACT_HIT_CONVERSION] < conversion) {
  result.creditedBases = 1;
  result.thrower = thrower;
  const arm = options.outfieldThrowing ? prepared.outfieldThrowing[thrower] : 0;
  resolveHit(result, 1, hitter, pitcher, offense, arm, packet, offenseRuns, target);
  return;
 }
 const errorSkill = options.errorAvoidance ? prepared.errorAvoidance[fielder] : 0;
 const error = fieldingErrorProbability(prepared.errorBaseline[fielder], errorSkill);
 if (packet[CONTACT_ERROR] < error) {
  result.error = true;
  forceOneBase(result, hitter, pitcher, offenseRuns, target);
  return;
 }
 if (fielder >= 1 && fielder <= 4 && result.runners[0] >= 0 && outs < 2) {
  const teamSkill = teamDoublePlaySkill(prepared, fielder, options.doublePlayPositions, participants);
  if (packet[CONTACT_DOUBLE_PLAY] < doublePlayProbability(batterDoublePlay, teamSkill)) {
   result.doublePlay = true;
   removeRunner(result, 0);
   result.outsAfter += 2;
   return;
  }
 }
 result.outsAfter++;
 if (fielder >= 5 && result.runners[2] >= 0 && outs < 2) {
  const arm = options.outfieldThrowing ? prepared.outfieldThrowing[fielder] : 0;
  const attempt = advancementAttemptProbability(0.625, arm);
  if (packet[CONTACT_THIRD_ATTEMPT] < attempt) {
   const runner = result.runners[2];
   if (packet[CONTACT_THIRD_OUT] < advancementOutProbability(arm)) {
    removeRunner(result, 2);
    result.outsAfter++;
    result.caughtAdvancing = runner;
    result.caughtRunners[result.caughtCount++] = runner;
   } else {
    result.sacrificeFly = true;
    scoreRunner(result, 2, 1, offenseRuns, target);
   }
  }
 }
}

export function matchupRatesAt(table: Float64Array, offset: number, output: Float64Array): void {
 let previous = 0;
 for (let event = 0; event < 8; event++) {
  const cumulative = table[offset + event];
  output[event] = cumulative - previous;
  previous = cumulative;
 }
}

const ARM_NODES = [-1, -0.5, 0, 0.5, 1] as const;
const EXPECTATION_TARGETS = [1, 2, 3, 4, Infinity] as const;
const FIELD_SAMPLES = [0.025, 0.10, 0.225, 0.35, 0.50, 0.665, 0.80, 0.935] as const;
const OUTFIELD_SAMPLES = [0.16, 0.50, 0.84] as const;

/**
 * Exact coefficients come from replaying the live resolver at every finite
 * advancement outcome, avoiding a second transition implementation.
 */
export interface ContactExpectationKernel {
 readonly hitValues: Float64Array;
 readonly routineOutValues: Float64Array;
 readonly outfieldOutValues: Float64Array;
 readonly errorValues: Float64Array;
 readonly doublePlayValues: Float64Array;
}

function hitValueIndex(target: number, state: number, event: number, armNode: number): number {
 return (((target * 24 + state) * 3 + (event - 3)) * ARM_NODES.length) + armNode;
}

function outfieldValueIndex(target: number, state: number, armNode: number): number {
 return ((target * 24 + state) * ARM_NODES.length) + armNode;
}

function stateValue(expectancy: Float64Array, result: ContactResult): number {
 const bases = (result.runners[0] >= 0 ? 1 : 0) | (result.runners[1] >= 0 ? 2 : 0) | (result.runners[2] >= 0 ? 4 : 0);
 return result.runs + (result.ended || result.outsAfter >= 3 ? 0 : expectancy[result.outsAfter * 8 + bases]);
}

function choiceProbability(choice: number, attempt: number, thrownOut: number): number {
 if (choice === 0) return 1 - attempt;
 if (choice === 1) return attempt * thrownOut;
 return attempt * (1 - thrownOut);
}

function setAdvanceChoice(packet: Float64Array, attemptIndex: number, outIndex: number, choice: number, attempt: number, thrownOut: number): void {
 packet[attemptIndex] = choice === 0 ? (1 + attempt) / 2 : attempt / 2;
 packet[outIndex] = choice === 1 ? thrownOut / 2 : (1 + thrownOut) / 2;
}

function setState(base: Pick<Bases, 'runners' | 'pitchers'>, mask: number): void {
 for (let index = 0; index < 3; index++) {
  const occupied = (mask & (1 << index)) !== 0;
  base.runners[index] = occupied ? index + 1 : -1;
  base.pitchers[index] = occupied ? 0 : -1;
 }
}

function expectedHitKernelValue(
 result: ContactResult,
 base: Pick<Bases, 'runners' | 'pitchers'>,
 profiles: readonly { speed: number }[],
 prepared: PreparedDefense,
 options: ContactOptions,
 participants: Uint8Array,
 packet: Float64Array,
 rates: Rates,
 expectancy: Float64Array,
 state: number,
 event: number,
 arm: number,
 target: number
): number {
 const outs = Math.floor(state / 8);
 const mask = state & 7;
 prepared.outfieldThrowing[5] = arm;
 packet[CONTACT_RESPONSIBILITY] = FIELD_SAMPLES[0];
 packet[CONTACT_OUTFIELD] = OUTFIELD_SAMPLES[0];
 options.outfieldThrowing = true;
 let expected = 0;
 const secondAttempt = advancementAttemptProbability(0.65, arm);
 const firstAttempt = advancementAttemptProbability(event === 3 ? 0.325 : 0.55, arm);
 const thrownOut = advancementOutProbability(arm);
 const secondChoices = event === 3 ? 3 : 1;
 const firstChoices = event === 5 ? 1 : 3;
 for (let second = 0; second < secondChoices; second++) for (let first = 0; first < firstChoices; first++) {
  const secondWeight = event === 3 ? choiceProbability(second, secondAttempt, thrownOut) : 1;
  const firstWeight = event === 5 ? 1 : choiceProbability(first, firstAttempt, thrownOut);
  const weight = secondWeight * firstWeight;
  if (weight === 0) continue;
  packet.fill(0.99, CONTACT_THIRD_ATTEMPT);
  if (event === 3) setAdvanceChoice(packet, CONTACT_SECOND_ATTEMPT, CONTACT_SECOND_OUT, second, secondAttempt, thrownOut);
  if (event !== 5) setAdvanceChoice(packet, CONTACT_FIRST_ATTEMPT, CONTACT_FIRST_OUT, first, firstAttempt, thrownOut);
  setState(base, mask);
  resolveContact(result, base, outs, event, rates, 0, 0, profiles, 0, prepared, options, packet, 0, target, participants);
  expected += weight * stateValue(expectancy, result);
 }
 prepared.outfieldThrowing[5] = 0;
 return expected;
}

function expectedOutfieldOutKernelValue(
 result: ContactResult,
 base: Pick<Bases, 'runners' | 'pitchers'>,
 profiles: readonly { speed: number }[],
 prepared: PreparedDefense,
 options: ContactOptions,
 participants: Uint8Array,
 packet: Float64Array,
 rates: Rates,
 expectancy: Float64Array,
 state: number,
 arm: number,
 target: number
): number {
 const outs = Math.floor(state / 8);
 const mask = state & 7;
 prepared.outfieldThrowing[5] = arm;
 options.outfieldThrowing = true;
 packet[CONTACT_RESPONSIBILITY] = FIELD_SAMPLES[5];
 packet[CONTACT_OUTFIELD] = OUTFIELD_SAMPLES[0];
 packet[CONTACT_ERROR] = 0.99;
 packet[CONTACT_DOUBLE_PLAY] = 0.99;
 const attempt = advancementAttemptProbability(0.625, arm);
 const thrownOut = advancementOutProbability(arm);
 let expected = 0;
 for (let choice = 0; choice < 3; choice++) {
  const weight = choiceProbability(choice, attempt, thrownOut);
  if (weight === 0) continue;
  setAdvanceChoice(packet, CONTACT_THIRD_ATTEMPT, CONTACT_THIRD_OUT, choice, attempt, thrownOut);
  setState(base, mask);
  resolveContact(result, base, outs, 7, rates, 0, 0, profiles, 0, prepared, options, packet, 0, target, participants);
  expected += weight * stateValue(expectancy, result);
 }
 prepared.outfieldThrowing[5] = 0;
 return expected;
}

export function createContactExpectationKernel(rates: Rates, expectancy: Float64Array): ContactExpectationKernel {
 const hitValues = new Float64Array(EXPECTATION_TARGETS.length * 24 * 3 * ARM_NODES.length);
 const routineOutValues = new Float64Array(EXPECTATION_TARGETS.length * 24);
 const outfieldOutValues = new Float64Array(EXPECTATION_TARGETS.length * 24 * ARM_NODES.length);
 const errorValues = new Float64Array(EXPECTATION_TARGETS.length * 24);
 const doublePlayValues = new Float64Array(EXPECTATION_TARGETS.length * 24);
 const prepared: PreparedDefense = {
  hitterByPosition: new Int8Array(8), hitPrevention: new Float64Array(8), doublePlay: new Float64Array(8),
  outfieldThrowing: new Float64Array(8), errorAvoidance: new Float64Array(8), catcherThrowing: new Float64Array(8), errorBaseline: new Float64Array(8)
 };
 const enabled = new Uint8Array(8);
 const options: ContactOptions = { hitPrevention: false, errorAvoidance: false, doublePlayPositions: enabled, outfieldThrowing: false };
 const participants = new Uint8Array(3);
 const packet = new Float64Array(CONTACT_UNIFORM_COUNT).fill(0.99);
 const result = createContactResult();
 const base = { runners: new Int16Array(3), pitchers: new Int16Array(3) };
 const profiles = Array.from({ length: 4 }, () => ({ speed: 0.5 }));
 for (let targetIndex = 0; targetIndex < EXPECTATION_TARGETS.length; targetIndex++) {
  const target = EXPECTATION_TARGETS[targetIndex];
  for (let state = 0; state < 24; state++) {
   const outs = Math.floor(state / 8);
   const mask = state & 7;
   for (let event = 3; event <= 5; event++) for (let armNode = 0; armNode < ARM_NODES.length; armNode++) {
    hitValues[hitValueIndex(targetIndex, state, event, armNode)] = expectedHitKernelValue(result, base, profiles, prepared, options, participants, packet, rates, expectancy, state, event, ARM_NODES[armNode], target);
   }
   packet.fill(0.99);
   packet[CONTACT_RESPONSIBILITY] = FIELD_SAMPLES[0];
   setState(base, mask);
   resolveContact(result, base, outs, 7, rates, 0, 0, profiles, 0, prepared, options, packet, 0, target, participants);
   routineOutValues[targetIndex * 24 + state] = stateValue(expectancy, result);

   prepared.errorBaseline[0] = 0.12;
   packet[CONTACT_ERROR] = 0;
   setState(base, mask);
   resolveContact(result, base, outs, 7, rates, 0, 0, profiles, 0, prepared, options, packet, 0, target, participants);
   errorValues[targetIndex * 24 + state] = stateValue(expectancy, result);
   prepared.errorBaseline[0] = 0;

   enabled.fill(1);
   packet.fill(0.99);
   packet[CONTACT_RESPONSIBILITY] = FIELD_SAMPLES[1];
   packet[CONTACT_DOUBLE_PLAY] = 0;
   setState(base, mask);
   resolveContact(result, base, outs, 7, rates, 0, 0, profiles, 0.55, prepared, options, packet, 0, target, participants);
   doublePlayValues[targetIndex * 24 + state] = stateValue(expectancy, result);
   enabled.fill(0);

   for (let armNode = 0; armNode < ARM_NODES.length; armNode++) {
    outfieldOutValues[outfieldValueIndex(targetIndex, state, armNode)] = expectedOutfieldOutKernelValue(result, base, profiles, prepared, options, participants, packet, rates, expectancy, state, ARM_NODES[armNode], target);
   }
  }
 }
 return { hitValues, routineOutValues, outfieldOutValues, errorValues, doublePlayValues };
}

function interpolateArm(values: Float64Array, offset: number, arm: number): number {
 if (arm <= -1) return values[offset];
 if (arm === -0.5) return values[offset + 1];
 if (arm === 0) return values[offset + 2];
 if (arm === 0.5) return values[offset + 3];
 if (arm >= 1) return values[offset + 4];
 let result = 0;
 for (let node = 0; node < ARM_NODES.length; node++) {
  let weight = 1;
  for (let other = 0; other < ARM_NODES.length; other++) if (other !== node) weight *= (arm - ARM_NODES[other]) / (ARM_NODES[node] - ARM_NODES[other]);
  result += weight * values[offset + node];
 }
 return result;
}

export function contactKernelHitValue(kernel: ContactExpectationKernel, target: number, state: number, event: number, arm: number): number {
 return interpolateArm(kernel.hitValues, hitValueIndex(target, state, event, 0), arm);
}

export function contactKernelOutValue(kernel: ContactExpectationKernel, target: number, state: number, outfield: boolean, arm: number): number {
 if (!outfield) return kernel.routineOutValues[target * 24 + state];
 return interpolateArm(kernel.outfieldOutValues, outfieldValueIndex(target, state, 0), arm);
}

export function contactKernelErrorValue(kernel: ContactExpectationKernel, target: number, state: number): number {
 return kernel.errorValues[target * 24 + state];
}

export function contactKernelDoublePlayValue(kernel: ContactExpectationKernel, target: number, state: number): number {
 return kernel.doublePlayValues[target * 24 + state];
}
