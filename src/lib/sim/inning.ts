import { POSITIONS, type DefensiveEnvironment } from '../game/types.ts';
import { createBases, force, type Bases } from './advancement.ts';
import {
 CONTACT_UNIFORMS,
 sampleContact,
 sampleNonContact,
 type ContactDraw,
 type PreparedMatchups
} from './contact-profile.ts';
import {
 DECISION_DOUBLE_PLAY,
 DECISION_ERROR,
 DECISION_FIRST_ATTEMPT,
 DECISION_FIRST_OUT,
 DECISION_SECOND_ATTEMPT,
 DECISION_SECOND_OUT,
 DECISION_THIRD_ATTEMPT,
 DECISION_THIRD_OUT,
 createContactOptions,
 createContactResult,
 createDecisions,
 createPreparedDefense,
 resolveContact,
 type ContactOptions,
 type ContactResult,
 type Decisions,
 type PreparedDefense
} from './contact.ts';
import { doublePlayParticipants, stealSuccessProbability } from './defense-rules.ts';
import {
 OUTCOME_FOUL,
 OUTCOME_GROUND_OUT,
 buildFieldingPlan,
 computeCandidates,
 createFieldingCandidates,
 createFieldingPlan,
 createPhysicalOutcomes,
 fieldingOutcomes,
 selectOutcome,
 type FieldingCandidates,
 type FieldingPlan,
 type PhysicalOutcomes
} from './fielding.ts';
import { TRACE_DEAD_BALL, createFlightTrace, traceFlight, type FlightTrace, type PreparedPark } from './flight.ts';
import type { DefensiveRunComponents, GameRandomStreams, SeasonMomentOutcome, TeamBox, TeamInput } from './types.ts';
import {
 centeredPlateAppearanceValue,
 centeredStealValue,
 getRunValueModel,
 remainingRunExpectancy,
 type RunValueModel
} from './value.ts';
import { beforePlateAppearance, type Workload } from './workload.ts';

/** Foul and dead balls resample contact for the same batter and pitcher at most this often. */
export const MAX_CONTACT_RETRIES = 100;

export interface InningEvent {
 outsBefore: number; outsAfter: number; basesBefore: number; basesAfter: number;
 offenseRunsBefore: number; defenseRunsBefore: number; offenseRunsAfter: number; defenseRunsAfter: number;
 batterName: string; batterSeasonId: string; pitcherName: string; pitcherSeasonId: string;
 outcome: SeasonMomentOutcome; runsScored: number;
}
export type InningObserver = (event: InningEvent) => void;
export interface InningContext {
 offense: TeamInput; defense: TeamInput; batting: TeamBox; pitching: TeamBox;
 bases: Bases; workload: Workload; matchups: PreparedMatchups; next: number; maxPA: number;
 prepared: PreparedDefense; values: RunValueModel; park: PreparedPark;
 trace: FlightTrace; candidates: FieldingCandidates; plan: FieldingPlan; outcomes: PhysicalOutcomes;
 draw: ContactDraw; uniforms: Float64Array; decisions: Decisions; reachUniform: number;
 reach: Uint8Array; throwing: Float64Array; zeros: Float64Array;
 contact: ContactResult; dpParticipants: Uint8Array; options: ContactOptions;
}

export function createInningContext(
 offense: TeamInput,
 defense: TeamInput,
 batting: TeamBox,
 pitching: TeamBox,
 workload: Workload,
 matchups: PreparedMatchups,
 environment: DefensiveEnvironment,
 park: PreparedPark,
 maxPA: number
): InningContext {
 if (matchups.batterCount !== offense.hitters.length || matchups.pitcherCount !== defense.pitchers.length) throw new Error('Invalid game matchup table');
 return {
  offense, defense, batting, pitching, workload, matchups, maxPA, park,
  bases: createBases(batting, pitching),
  next: 0,
  prepared: createPreparedDefense(defense, environment),
  values: getRunValueModel(environment),
  trace: createFlightTrace(), candidates: createFieldingCandidates(), plan: createFieldingPlan(), outcomes: createPhysicalOutcomes(),
  draw: { region: 0, speedMph: 0, launchDeg: 0, sprayDeg: 0, carry: 1 }, uniforms: new Float64Array(CONTACT_UNIFORMS),
  decisions: createDecisions(), reachUniform: 0,
  reach: new Uint8Array(POSITIONS.length), throwing: new Float64Array(POSITIONS.length), zeros: new Float64Array(POSITIONS.length),
  contact: createContactResult(),
  dpParticipants: new Uint8Array(3),
  options: createContactOptions()
 };
}

function basesMask(bases: Bases | ContactResult): number {
 return (bases.runners[0] !== -1 ? 1 : 0) | (bases.runners[1] !== -1 ? 2 : 0) | (bases.runners[2] !== -1 ? 4 : 0);
}

function observe(
 observer: InningObserver | undefined,
 context: InningContext,
 outsBefore: number,
 basesBefore: number,
 offenseRunsBefore: number,
 batterName: string,
 batterSeasonId: string,
 pitcherName: string,
 pitcherSeasonId: string,
 outcome: SeasonMomentOutcome,
 outsAfter: number
): void {
 if (!observer) return;
 observer({
  outsBefore, outsAfter, basesBefore, basesAfter: basesMask(context.bases),
  offenseRunsBefore, defenseRunsBefore: context.pitching.runs,
  offenseRunsAfter: context.batting.runs, defenseRunsAfter: context.pitching.runs,
  batterName, batterSeasonId, pitcherName, pitcherSeasonId, outcome,
  runsScored: context.batting.runs - offenseRunsBefore
 });
}

function addFieldingWorkload(context: InningContext, outs: number): void {
 if (outs <= 0) return;
 for (let position = 0; position < POSITIONS.length; position++) {
  context.pitching.batting[context.prepared.hitterByPosition[position]].fieldingOuts += outs;
 }
}

function addDefense(context: InningContext, position: number, component: keyof DefensiveRunComponents, value: number): void {
 if (value === 0) return;
 const line = context.pitching.batting[context.prepared.hitterByPosition[position]];
 line.defensiveRuns += value;
 line.defensiveComponents[component] += value;
 context.pitching.defensiveRuns += value;
 context.pitching.defensiveComponents[component] += value;
}

function recordPitchingValue(context: InningContext, pitcher: number, offense: number, defense: number): void {
 const pitching = -offense - defense;
 if (!Number.isFinite(pitching) || Math.abs(offense + pitching + defense) > 1e-10) throw new Error('Simulation value conservation failed');
 context.pitching.pitching[pitcher].pitchingRunsAboveNeutral += pitching;
 context.pitching.pitchingRunsAboveNeutral += pitching;
}

function contactValue(context: InningContext, result: ContactResult): number {
 return result.runs + remainingRunExpectancy(context.values, result.outsAfter, basesMask(result), result.ended);
}

/** Fielding plan for the current reach/arm switches, the shared reach uniform, then the legal adapter. */
function resolvePass(context: InningContext, outs: number, hitter: number, pitcher: number, doublePlay: number, runsBefore: number, target: number): number {
 buildFieldingPlan(context.trace, context.candidates, context.reach, context.throwing, context.plan);
 fieldingOutcomes(context.plan, context.offense.hitters[hitter].speed, context.outcomes);
 const selected = selectOutcome(context.outcomes, context.reachUniform);
 const kind = context.outcomes.kind[selected];
 if (kind === OUTCOME_FOUL) throw new Error('Foul contact reached legal resolution');
 resolveContact(context.contact, context.bases, outs, kind, context.outcomes.fielder[selected], context.outcomes.bases[selected],
  hitter, pitcher, context.offense.hitters, doublePlay, context.prepared, context.options, context.decisions, runsBefore, target, context.dpParticipants);
 return contactValue(context, context.contact);
}

function resetSwitches(context: InningContext): void {
 context.reach.fill(0);
 context.throwing.fill(0);
 context.options.errorPositions.fill(0);
 context.options.doublePlayPositions.fill(0);
 context.options.outfieldThrowing = false;
}

/**
 * Replays fielding on the same trace and uniforms, enabling skills incrementally in the order
 * hit prevention, errors, double-play participants, outfield throws. Within hit prevention and
 * errors, positions are enabled one at a time and each change is credited to that position.
 * The final pass is the actual defense and stays in `context.contact`.
 */
function resolveDefensiveContact(context: InningContext, outs: number, hitter: number, pitcher: number, doublePlay: number, runsBefore: number, target: number): number {
 const prepared = context.prepared;
 resetSwitches(context);
 let previous = resolvePass(context, outs, hitter, pitcher, doublePlay, runsBefore, target);
 let defensiveRuns = 0;
 const credit = (position: number, component: keyof DefensiveRunComponents, next: number) => {
  addDefense(context, position, component, previous - next);
  defensiveRuns += previous - next;
  previous = next;
 };
 for (let position = 0; position < POSITIONS.length; position++) {
  context.reach[position] = 1;
  if (prepared.hitPrevention[position] !== 0) credit(position, 'hitPrevention', resolvePass(context, outs, hitter, pitcher, doublePlay, runsBefore, target));
 }
 for (let position = 0; position < POSITIONS.length; position++) {
  context.options.errorPositions[position] = 1;
  if (prepared.errorAvoidance[position] !== 0) credit(position, 'errorAvoidance', resolvePass(context, outs, hitter, pitcher, doublePlay, runsBefore, target));
 }
 const fielder = context.contact.fielder;
 const grounded = context.outcomes.kind[selectOutcome(context.outcomes, context.reachUniform)] === OUTCOME_GROUND_OUT;
 const participantCount = grounded ? doublePlayParticipants(fielder, context.dpParticipants) : 0;
 for (let index = 0; index < participantCount; index++) {
  const participant = context.dpParticipants[index];
  context.options.doublePlayPositions[participant] = 1;
  credit(participant, 'doublePlay', resolvePass(context, outs, hitter, pitcher, doublePlay, runsBefore, target));
 }
 context.throwing.set(prepared.outfieldThrowing);
 context.options.outfieldThrowing = true;
 const next = resolvePass(context, outs, hitter, pitcher, doublePlay, runsBefore, target);
 if (next !== previous) credit(context.contact.thrower >= 0 ? context.contact.thrower : context.plan.retriever, 'outfieldThrowing', next);
 return defensiveRuns;
}

/** Foul-territory catches and dead-ball contact use the actual defense with no counterfactual credit. */
function resolveFoulCatch(context: InningContext, outs: number, hitter: number, pitcher: number, doublePlay: number, runsBefore: number, target: number): void {
 resetSwitches(context);
 context.reach.fill(1);
 context.options.errorPositions.fill(1);
 context.options.doublePlayPositions.fill(1);
 context.throwing.set(context.prepared.outfieldThrowing);
 context.options.outfieldThrowing = true;
 resolvePass(context, outs, hitter, pitcher, doublePlay, runsBefore, target);
}

function fillUniforms(output: Float64Array, offset: number, count: number, random: () => number): void {
 for (let index = offset; index < offset + count; index++) {
  const value = random();
  if (!(value >= 0 && value < 1)) throw new Error('Invalid random sample');
  output[index] = value;
 }
}

/**
 * Samples contact until a fair ball or a caught foul. Returns false only when the attempts are
 * exhausted; the caller fails explicitly.
 */
function sampleFairContact(context: InningContext, pair: number, hitter: number, streams: GameRandomStreams): boolean {
 const packet = context.decisions.packet;
 for (let attempt = 0; attempt < MAX_CONTACT_RETRIES; attempt++) {
  fillUniforms(context.uniforms, 0, CONTACT_UNIFORMS, streams.contact);
  sampleContact(context.matchups, pair, context.uniforms, context.draw);
  context.reachUniform = streams.fielding();
  if (!(context.reachUniform >= 0 && context.reachUniform < 1)) throw new Error('Invalid random sample');
  packet[DECISION_ERROR] = streams.fielding();
  packet[DECISION_DOUBLE_PLAY] = streams.fielding();
  for (const slot of [DECISION_THIRD_ATTEMPT, DECISION_THIRD_OUT, DECISION_SECOND_ATTEMPT, DECISION_SECOND_OUT, DECISION_FIRST_ATTEMPT, DECISION_FIRST_OUT]) packet[slot] = streams.advancement();
  traceFlight(context.draw, context.park, context.trace);
  computeCandidates(context.trace, context.prepared.hitPrevention, context.candidates);
  context.reach.fill(1);
  context.throwing.set(context.prepared.outfieldThrowing);
  buildFieldingPlan(context.trace, context.candidates, context.reach, context.throwing, context.plan);
  fieldingOutcomes(context.plan, context.offense.hitters[hitter].speed, context.outcomes);
  if (context.outcomes.kind[selectOutcome(context.outcomes, context.reachUniform)] !== OUTCOME_FOUL) return true;
 }
 return false;
}

function commitContact(context: InningContext, result: ContactResult): void {
 context.bases.runners.set(result.runners);
 context.bases.pitchers.set(result.pitchers);
 for (let index = 0; index < result.scoreCount; index++) {
  context.batting.runs++;
  context.batting.batting[result.scoredRunners[index]].R++;
  context.pitching.pitching[result.scoredPitchers[index]].R++;
 }
 context.bases.ended = result.ended;
 context.bases.winningAdvance = result.winningAdvance;
}

function recordSteal(
 context: InningContext,
 outs: number,
 runnerIndex: number,
 pitcherIndex: number,
 successUniform: number
): number {
 const basesBefore = basesMask(context.bases);
 const catcherSkill = context.prepared.catcherThrowing[0];
 const runnerSuccess = context.offense.hitters[runnerIndex].stealSuccess;
 const neutralSuccess = successUniform < stealSuccessProbability(runnerSuccess, 0);
 const actualSuccess = successUniform < stealSuccessProbability(runnerSuccess, catcherSkill);
 const neutralOuts = outs + (neutralSuccess ? 0 : 1);
 const neutralBases = neutralSuccess ? ((basesBefore & ~1) | 2) : (basesBefore & ~1);
 if (actualSuccess) {
  context.bases.runners[1] = runnerIndex;
  context.bases.pitchers[1] = context.bases.pitchers[0];
  context.batting.batting[runnerIndex].SB++;
 } else {
  context.batting.batting[runnerIndex].CS++;
  context.pitching.pitching[pitcherIndex].outs++;
  outs++;
 }
 context.bases.runners[0] = -1;
 context.bases.pitchers[0] = -1;
 const actualBases = basesMask(context.bases);
 const neutralValue = remainingRunExpectancy(context.values, neutralOuts, neutralBases, false);
 const actualValue = remainingRunExpectancy(context.values, outs, actualBases, false);
 const defensiveRuns = neutralValue - actualValue;
 addDefense(context, 0, 'catcherThrowing', defensiveRuns);
 const offensiveRuns = centeredStealValue(context.values, outs - (actualSuccess ? 0 : 1), basesBefore, outs, actualBases);
 context.batting.batting[runnerIndex].stealRuns += offensiveRuns;
 context.batting.stealRuns += offensiveRuns;
 recordPitchingValue(context, pitcherIndex, offensiveRuns, defensiveRuns);
 if (!actualSuccess) addFieldingWorkload(context, 1);
 return outs;
}

export function playHalf(context: InningContext, target: number, streams: GameRandomStreams, observer?: InningObserver): void {
 const { bases, offense, defense, batting, pitching, workload } = context;
 bases.runners.fill(-1);
 bases.pitchers.fill(-1);
 bases.target = target;
 bases.ended = false;
 bases.winningAdvance = 0;
 let outs = 0;
 let appearances = 0;
 while (outs < 3 && !bases.ended) {
  beforePlateAppearance(defense, pitching.pitching, workload);
  const stealPitcherIndex = workload.current;
  const stealPitcher = pitching.pitching[stealPitcherIndex];
  stealPitcher.appearances = 1;
  if (bases.runners[0] !== -1 && bases.runners[1] === -1) {
   const runnerIndex = bases.runners[0];
   const runner = offense.hitters[runnerIndex];
   if (streams.advancement() < runner.stealAttempt) {
    const outsBefore = outs;
    const basesBefore = basesMask(bases);
    const runsBefore = batting.runs;
    const stealOuts = recordSteal(context, outs, runnerIndex, stealPitcherIndex, streams.advancement());
    const outcome: SeasonMomentOutcome = stealOuts === outsBefore ? 'stolenBase' : 'caughtStealing';
    outs = stealOuts;
    observe(observer, context, outsBefore, basesBefore, runsBefore, runner.displayName, runner.seasonId,
     defense.pitchers[stealPitcherIndex].displayName, defense.pitchers[stealPitcherIndex].seasonId, outcome, outs);
    if (outs === 3) break;
    beforePlateAppearance(defense, pitching.pitching, workload);
   }
  }
  if (++appearances > context.maxPA) throw new Error(`Simulation exceeded ${context.maxPA} plate appearances in a half inning`);
  const activeIndex = workload.current;
  const activeProfile = defense.pitchers[activeIndex];
  const active = pitching.pitching[activeIndex];
  active.appearances = 1;
  active.BF++;
  const hitterIndex = context.next;
  const profile = offense.hitters[hitterIndex];
  const hitter = batting.batting[hitterIndex];
  context.next = (context.next + 1) % 9;
  const outsBefore = outs;
  const basesBefore = basesMask(bases);
  const pair = hitterIndex * defense.pitchers.length + activeIndex;
  const event = sampleNonContact(context.matchups, pair, streams.pa());
  hitter.PA++;
  const runsBefore = batting.runs;
  const runsNeeded = target === Infinity ? Infinity : target - runsBefore;
  let outcome: SeasonMomentOutcome;
  let defensiveRuns = 0;
  if (event === 0 || event === 1) {
   if (event === 0) { hitter.BB++; active.BB++; outcome = 'walk'; }
   else { hitter.HBP++; active.HBP++; outcome = 'hitByPitch'; }
   force(bases, hitterIndex, activeIndex);
   hitter.RBI += batting.runs - runsBefore;
  } else if (event === 2) {
   hitter.AB++;
   hitter.SO++;
   active.SO++;
   active.outs++;
   outs++;
   addFieldingWorkload(context, 1);
   outcome = 'strikeout';
  } else {
   if (!sampleFairContact(context, pair, hitterIndex, streams)) throw new Error(`Contact exceeded ${MAX_CONTACT_RETRIES} foul or dead-ball retries`);
   if (!context.trace.fair || context.trace.end === TRACE_DEAD_BALL) resolveFoulCatch(context, outs, hitterIndex, activeIndex, profile.doublePlay, runsBefore, target);
   else defensiveRuns = resolveDefensiveContact(context, outs, hitterIndex, activeIndex, profile.doublePlay, runsBefore, target);
   const result = context.contact;
   commitContact(context, result);
   const outsAdded = result.outsAfter - outs;
   outs = result.outsAfter;
   active.outs += outsAdded;
   addFieldingWorkload(context, outsAdded);
   hitter.AB += result.sacrificeFly ? 0 : 1;
   if (result.creditedBases > 0) {
    hitter.H++;
    active.H++;
    if (result.creditedBases === 2) hitter.doubles++;
    else if (result.creditedBases === 3) hitter.triples++;
    else if (result.creditedBases === 4) hitter.HR++;
    outcome = result.creditedBases === 1 ? 'single' : result.creditedBases === 2 ? 'double' : result.creditedBases === 3 ? 'triple' : 'homeRun';
    hitter.RBI += batting.runs - runsBefore;
   } else if (result.error) {
    outcome = 'reachedOnError';
   } else if (result.doublePlay) {
    outcome = 'groundedIntoDoublePlay';
   } else if (result.sacrificeFly) {
    hitter.SF++;
    hitter.RBI++;
    outcome = 'sacrificeFly';
   } else {
    outcome = 'out';
   }
   for (let index = 0; index < result.caughtCount; index++) batting.batting[result.caughtRunners[index]].caughtAdvancing++;
  }
  const runsScored = batting.runs - runsBefore;
  const afterBases = basesMask(bases);
  const offensiveRuns = centeredPlateAppearanceValue(context.values, outsBefore, basesBefore, runsScored, outs, afterBases, bases.ended, runsNeeded);
  hitter.battingRuns += offensiveRuns;
  batting.battingRuns += offensiveRuns;
  recordPitchingValue(context, activeIndex, offensiveRuns, defensiveRuns);
  observe(observer, context, outsBefore, basesBefore, runsBefore, profile.displayName, profile.seasonId,
   activeProfile.displayName, activeProfile.seasonId, outcome, outs);
 }
}
