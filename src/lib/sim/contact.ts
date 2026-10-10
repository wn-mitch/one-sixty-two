import { POSITIONS, type DefensiveEnvironment } from '../game/types.ts';
import type { Bases } from './advancement.ts';
import {
 advancementAttemptProbability,
 advancementOutProbability,
 doublePlayParticipants,
 doublePlayProbability,
 fieldingErrorProbability
} from './defense-rules.ts';
import {
 OUTCOME_AUTOMATIC_DOUBLE,
 OUTCOME_CAUGHT,
 OUTCOME_GROUND_OUT,
 OUTCOME_HIT,
 OUTCOME_HOME_RUN,
 OUTCOME_INFIELD_HIT
} from './fielding.ts';
import type { TeamInput } from './types.ts';

/** Legal decision slots; error and double play come from the fielding stream, the rest from advancement. */
export const DECISION_ERROR = 0;
export const DECISION_DOUBLE_PLAY = 1;
export const DECISION_THIRD_ATTEMPT = 2;
export const DECISION_THIRD_OUT = 3;
export const DECISION_SECOND_ATTEMPT = 4;
export const DECISION_SECOND_OUT = 5;
export const DECISION_FIRST_ATTEMPT = 6;
export const DECISION_FIRST_OUT = 7;
export const DECISION_COUNT = 8;
const MAX_DECISIONS = 8;

/**
 * Live play compares a packet uniform with each probability. Enumeration replays the same
 * adapter with scripted choices and records each decision's probability.
 */
export interface Decisions {
 enumerate: boolean;
 packet: Float64Array;
 script: Uint8Array; scriptLength: number;
 taken: number; probabilities: Float64Array; choices: Uint8Array;
}

export function createDecisions(): Decisions {
 return {
  enumerate: false, packet: new Float64Array(DECISION_COUNT),
  script: new Uint8Array(MAX_DECISIONS), scriptLength: 0,
  taken: 0, probabilities: new Float64Array(MAX_DECISIONS), choices: new Uint8Array(MAX_DECISIONS)
 };
}

function decide(decisions: Decisions, slot: number, probability: number): boolean {
 if (!decisions.enumerate) return decisions.packet[slot] < probability;
 const index = decisions.taken++;
 if (index >= MAX_DECISIONS) throw new Error('Too many legal decisions in one play');
 const choice = index < decisions.scriptLength ? decisions.script[index] === 1 : false;
 decisions.probabilities[index] = probability;
 decisions.choices[index] = choice ? 1 : 0;
 return choice;
}

/** Visits every decision path of `run` with its probability; zero-probability branches are skipped. */
export function enumerateDecisions(decisions: Decisions, run: () => void, visit: (probability: number) => void): void {
 const explore = (prefix: Uint8Array, length: number): void => {
  decisions.enumerate = true;
  decisions.script.set(prefix.subarray(0, length));
  decisions.scriptLength = length;
  decisions.taken = 0;
  run();
  const taken = decisions.taken;
  const probabilities = decisions.probabilities.slice(0, taken);
  const choices = decisions.choices.slice(0, taken);
  let probability = 1;
  for (let index = 0; index < taken; index++) probability *= choices[index] ? probabilities[index] : 1 - probabilities[index];
  if (probability > 0) visit(probability);
  for (let index = length; index < taken; index++) {
   if (probabilities[index] <= 0) continue;
   let prefixProbability = 1;
   for (let earlier = 0; earlier < index; earlier++) prefixProbability *= choices[earlier] ? probabilities[earlier] : 1 - probabilities[earlier];
   if (prefixProbability <= 0) continue;
   const next = new Uint8Array(MAX_DECISIONS);
   next.set(choices.subarray(0, index));
   next[index] = 1;
   explore(next, index + 1);
  }
 };
 try { explore(new Uint8Array(MAX_DECISIONS), 0); }
 finally { decisions.enumerate = false; }
}

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

/** Per-position error and double-play enablement plus the outfield-arm switch. */
export interface ContactOptions {
 errorPositions: Uint8Array;
 doublePlayPositions: Uint8Array;
 outfieldThrowing: boolean;
}

export function createContactOptions(): ContactOptions {
 return { errorPositions: new Uint8Array(POSITIONS.length), doublePlayPositions: new Uint8Array(POSITIONS.length), outfieldThrowing: false };
}

export function createPreparedDefense(team: TeamInput, environment: DefensiveEnvironment): PreparedDefense {
 const prepared = createNeutralDefense(environment);
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
 }
 return prepared;
}

/** Zero-skill defenders with the league position error baselines. */
export function createNeutralDefense(environment: DefensiveEnvironment): PreparedDefense {
 const prepared: PreparedDefense = {
  hitterByPosition: new Int8Array(POSITIONS.length),
  hitPrevention: new Float64Array(POSITIONS.length),
  doublePlay: new Float64Array(POSITIONS.length),
  outfieldThrowing: new Float64Array(POSITIONS.length),
  errorAvoidance: new Float64Array(POSITIONS.length),
  catcherThrowing: new Float64Array(POSITIONS.length),
  errorBaseline: new Float64Array(POSITIONS.length)
 };
 for (let position = 0; position < POSITIONS.length; position++) prepared.errorBaseline[position] = environment.leagueErrorRates[POSITIONS[position]];
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
  fielder: -1,
  thrower: -1,
  error: false,
  doublePlay: false,
  sacrificeFly: false,
  caughtAdvancing: -1,
  ended: false,
  winningAdvance: 0
 };
}

function resetResult(result: ContactResult, bases: Pick<Bases, 'runners' | 'pitchers'>, outs: number, credited: number): void {
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
 result.creditedBases = credited;
 result.fielder = -1;
 result.thrower = -1;
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

/** Scores a runner; a non-home-run walkoff truncates credited bases to the winning advance. */
function scoreRunner(result: ContactResult, base: number, advance: number, offenseRuns: number, target: number, stop = true): boolean {
 result.scoredRunners[result.scoreCount] = result.runners[base];
 result.scoredPitchers[result.scoreCount] = result.pitchers[base];
 result.scoreCount++;
 result.runs++;
 removeRunner(result, base);
 if (stop && offenseRuns + result.runs >= target) {
  result.ended = true;
  result.winningAdvance = advance;
  result.creditedBases = Math.min(result.creditedBases, advance);
 }
 return result.ended;
}

function attemptAdvance(
 result: ContactResult,
 decisions: Decisions,
 from: number,
 heldBase: number,
 safeBase: number,
 baseline: number,
 arm: number,
 attemptSlot: number,
 outSlot: number,
 offenseRuns: number,
 target: number
): void {
 const runner = result.runners[from];
 if (runner < 0 || result.outsAfter >= 3 || result.ended) return;
 if (!decide(decisions, attemptSlot, advancementAttemptProbability(baseline, arm))) {
  if (heldBase !== from) moveRunner(result, from, heldBase);
  return;
 }
 if (decide(decisions, outSlot, advancementOutProbability(arm))) {
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

/** Lead runners move first; trailing runners on singles and doubles may try for an extra base. */
function resolveHit(
 result: ContactResult,
 decisions: Decisions,
 basesTaken: number,
 hitter: number,
 pitcher: number,
 offense: readonly { speed: number }[],
 arm: number,
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
   attemptAdvance(result, decisions, 0, 2, -1, 0.35 + 0.40 * speed, arm, DECISION_FIRST_ATTEMPT, DECISION_FIRST_OUT, offenseRuns, target);
   if (result.outsAfter >= 3 || result.ended) return;
  }
  result.runners[1] = hitter;
  result.pitchers[1] = pitcher;
  return;
 }
 if (result.runners[2] >= 0 && scoreRunner(result, 2, 1, offenseRuns, target)) return;
 if (result.runners[1] >= 0) {
  const speed = offense[result.runners[1]].speed;
  attemptAdvance(result, decisions, 1, 2, -1, 0.45 + 0.40 * speed, arm, DECISION_SECOND_ATTEMPT, DECISION_SECOND_OUT, offenseRuns, target);
  if (result.outsAfter >= 3 || result.ended) return;
 }
 if (result.runners[0] >= 0) {
  if (result.runners[2] >= 0) moveRunner(result, 0, 1);
  else {
   const speed = offense[result.runners[0]].speed;
   attemptAdvance(result, decisions, 0, 1, 2, 0.15 + 0.35 * speed, arm, DECISION_FIRST_ATTEMPT, DECISION_FIRST_OUT, offenseRuns, target);
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

/** Fielded balls: an error puts the batter on first; otherwise the play is an out. */
function fieldingError(result: ContactResult, decisions: Decisions, prepared: PreparedDefense, options: ContactOptions, fielder: number, hitter: number, pitcher: number, offenseRuns: number, target: number): boolean {
 const skill = options.errorPositions[fielder] ? prepared.errorAvoidance[fielder] : 0;
 if (!decide(decisions, DECISION_ERROR, fieldingErrorProbability(prepared.errorBaseline[fielder], skill))) return false;
 result.error = true;
 forceOneBase(result, hitter, pitcher, offenseRuns, target);
 return true;
}

/**
 * Converts one physical fielding outcome into the legal base/out/score transition. Geometry
 * chooses the fielder, retriever, and batter bases; this adapter applies errors, double plays,
 * tag-ups, runner advancement, and walkoff stopping.
 */
export function resolveContact(
 result: ContactResult,
 bases: Pick<Bases, 'runners' | 'pitchers'>,
 outs: number,
 kind: number,
 fielder: number,
 basesTaken: number,
 hitter: number,
 pitcher: number,
 offense: readonly { speed: number }[],
 batterDoublePlay: number,
 prepared: PreparedDefense,
 options: ContactOptions,
 decisions: Decisions,
 offenseRuns: number,
 target: number,
 participants: Uint8Array
): void {
 resetResult(result, bases, outs, kind === OUTCOME_HOME_RUN ? 4 : kind === OUTCOME_HIT || kind === OUTCOME_INFIELD_HIT || kind === OUTCOME_AUTOMATIC_DOUBLE ? basesTaken : 0);
 result.fielder = fielder;
 if (kind === OUTCOME_HOME_RUN) {
  for (let base = 2; base >= 0; base--) if (result.runners[base] >= 0) scoreRunner(result, base, 3 - base, offenseRuns, target, false);
  result.scoredRunners[result.scoreCount] = hitter;
  result.scoredPitchers[result.scoreCount] = pitcher;
  result.scoreCount++;
  result.runs++;
  if (offenseRuns + result.runs >= target) { result.ended = true; result.winningAdvance = 4; }
  return;
 }
 if (kind === OUTCOME_AUTOMATIC_DOUBLE) {
  for (let base = 2; base >= 1; base--) if (result.runners[base] >= 0 && scoreRunner(result, base, 2, offenseRuns, target)) return;
  if (result.runners[0] >= 0) moveRunner(result, 0, 2);
  result.runners[1] = hitter;
  result.pitchers[1] = pitcher;
  return;
 }
 if (kind === OUTCOME_HIT) {
  result.thrower = fielder;
  const arm = options.outfieldThrowing && fielder >= 5 ? prepared.outfieldThrowing[fielder] : 0;
  resolveHit(result, decisions, basesTaken, hitter, pitcher, offense, arm, offenseRuns, target);
  return;
 }
 if (kind === OUTCOME_INFIELD_HIT) {
  forceOneBase(result, hitter, pitcher, offenseRuns, target);
  return;
 }
 if (kind !== OUTCOME_CAUGHT && kind !== OUTCOME_GROUND_OUT) throw new Error('Invalid physical contact outcome');
 if (fieldingError(result, decisions, prepared, options, fielder, hitter, pitcher, offenseRuns, target)) return;
 if (kind === OUTCOME_GROUND_OUT && fielder >= 1 && fielder <= 4 && result.runners[0] >= 0 && outs < 2) {
  const teamSkill = teamDoublePlaySkill(prepared, fielder, options.doublePlayPositions, participants);
  if (decide(decisions, DECISION_DOUBLE_PLAY, doublePlayProbability(batterDoublePlay, teamSkill))) {
   result.doublePlay = true;
   removeRunner(result, 0);
   result.outsAfter += 2;
   return;
  }
 }
 result.outsAfter++;
 if (kind === OUTCOME_CAUGHT && fielder >= 5 && result.runners[2] >= 0 && outs < 2) {
  result.thrower = fielder;
  const arm = options.outfieldThrowing ? prepared.outfieldThrowing[fielder] : 0;
  if (decide(decisions, DECISION_THIRD_ATTEMPT, advancementAttemptProbability(0.625, arm))) {
   const runner = result.runners[2];
   if (decide(decisions, DECISION_THIRD_OUT, advancementOutProbability(arm))) {
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
