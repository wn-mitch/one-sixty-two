import { POSITIONS, type DefensiveEnvironment } from '../game/types.ts';
import { createBases, force, homeRun, type Bases } from './advancement.ts';
import {
 CONTACT_UNIFORM_COUNT,
 createContactResult,
 createPreparedDefense,
 fillContactPacket,
 matchupRatesAt,
 resolveContact,
 type ContactOptions,
 type ContactResult,
 type PreparedDefense
} from './contact.ts';
import { doublePlayParticipants, stealSuccessProbability } from './defense-rules.ts';
import { sampleEvent } from './matchup.ts';
import type { DefensiveRunComponents, SeasonMomentOutcome, TeamBox, TeamInput } from './types.ts';
import {
 centeredPlateAppearanceValue,
 centeredStealValue,
 getRunValueModel,
 remainingRunExpectancy,
 type RunValueModel
} from './value.ts';
import { beforePlateAppearance, type Workload } from './workload.ts';

export interface InningEvent {
 outsBefore: number; outsAfter: number; basesBefore: number; basesAfter: number;
 offenseRunsBefore: number; defenseRunsBefore: number; offenseRunsAfter: number; defenseRunsAfter: number;
 batterName: string; batterSeasonId: string; pitcherName: string; pitcherSeasonId: string;
 outcome: SeasonMomentOutcome; runsScored: number;
}
export type InningObserver = (event: InningEvent) => void;
export interface InningContext {
 offense: TeamInput; defense: TeamInput; batting: TeamBox; pitching: TeamBox;
 bases: Bases; workload: Workload; matchups: Float64Array; next: number; maxPA: number;
 prepared: PreparedDefense; values: RunValueModel;
 packet: Float64Array; matchupRates: Float64Array; neutralContact: ContactResult; actualContact: ContactResult;
 dpEnabled: Uint8Array; dpParticipants: Uint8Array; options: ContactOptions;
}


export function createInningContext(
 offense: TeamInput,
 defense: TeamInput,
 batting: TeamBox,
 pitching: TeamBox,
 workload: Workload,
 matchups: Float64Array,
 environment: DefensiveEnvironment,
 maxPA: number
): InningContext {
 const dpEnabled = new Uint8Array(POSITIONS.length);
 return {
  offense, defense, batting, pitching, workload, matchups, maxPA,
  bases: createBases(batting, pitching),
  next: 0,
  prepared: createPreparedDefense(defense, environment),
  values: getRunValueModel(environment),
  packet: new Float64Array(CONTACT_UNIFORM_COUNT),
  matchupRates: new Float64Array(8),
  neutralContact: createContactResult(),
  actualContact: createContactResult(),
  dpEnabled,
  dpParticipants: new Uint8Array(3),
  options: { hitPrevention: false, errorAvoidance: false, doublePlayPositions: dpEnabled, outfieldThrowing: false }
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

function resolveContactValue(
 context: InningContext,
 output: ContactResult,
 outs: number,
 event: number,
 hitter: number,
 pitcher: number,
 doublePlay: number,
 runsBefore: number,
 target: number
): number {
 resolveContact(
  output,
  context.bases,
  outs,
  event,
  context.matchupRates,
  hitter,
  pitcher,
  context.offense.hitters,
  doublePlay,
  context.prepared,
  context.options,
  context.packet,
  runsBefore,
  target,
  context.dpParticipants
 );
 return contactValue(context, output);
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

function resolveDefensiveContact(
 context: InningContext,
 outs: number,
 event: number,
 hitterIndex: number,
 pitcherIndex: number,
 doublePlay: number,
 runsBefore: number,
 target: number
): number {
 const options = context.options;
 context.dpEnabled.fill(0);
 options.hitPrevention = false;
 options.errorAvoidance = false;
 options.outfieldThrowing = false;
 let previous = resolveContactValue(context, context.neutralContact, outs, event, hitterIndex, pitcherIndex, doublePlay, runsBefore, target);
 const fielder = context.neutralContact.fielder;

 options.hitPrevention = true;
 let next = resolveContactValue(context, context.actualContact, outs, event, hitterIndex, pitcherIndex, doublePlay, runsBefore, target);
 addDefense(context, fielder, 'hitPrevention', previous - next);
 let defensiveRuns = previous - next;
 previous = next;

 options.errorAvoidance = true;
 next = resolveContactValue(context, context.neutralContact, outs, event, hitterIndex, pitcherIndex, doublePlay, runsBefore, target);
 addDefense(context, fielder, 'errorAvoidance', previous - next);
 defensiveRuns += previous - next;
 previous = next;

 const participantCount = doublePlayParticipants(fielder, context.dpParticipants);
 for (let index = 0; index < participantCount; index++) {
  const participant = context.dpParticipants[index];
  context.dpEnabled[participant] = 1;
  next = resolveContactValue(context, context.actualContact, outs, event, hitterIndex, pitcherIndex, doublePlay, runsBefore, target);
  addDefense(context, participant, 'doublePlay', previous - next);
  defensiveRuns += previous - next;
  previous = next;
 }

 options.outfieldThrowing = true;
 next = resolveContactValue(context, context.actualContact, outs, event, hitterIndex, pitcherIndex, doublePlay, runsBefore, target);
 addDefense(context, context.actualContact.thrower, 'outfieldThrowing', previous - next);
 defensiveRuns += previous - next;
 return defensiveRuns;
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

export function playHalf(context: InningContext, target: number, random: () => number, observer?: InningObserver): void {
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
   if (random() < runner.stealAttempt) {
    const outsBefore = outs;
    const basesBefore = basesMask(bases);
    const runsBefore = batting.runs;
    const stealOuts = recordSteal(context, outs, runnerIndex, stealPitcherIndex, random());
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
  const offset = (hitterIndex * defense.pitchers.length + activeIndex) * 8;
  const event = sampleEvent(context.matchups, offset, random());
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
  } else if (event === 6) {
   homeRun(bases, hitterIndex, activeIndex);
   hitter.AB++;
   hitter.H++;
   hitter.HR++;
   active.H++;
   hitter.RBI += batting.runs - runsBefore;
   outcome = 'homeRun';
  } else {
   fillContactPacket(context.packet, random);
   matchupRatesAt(context.matchups, offset, context.matchupRates);
   defensiveRuns = resolveDefensiveContact(context, outs, event, hitterIndex, activeIndex, profile.doublePlay, runsBefore, target);
   const result = context.actualContact;
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
    outcome = result.creditedBases === 1 ? 'single' : result.creditedBases === 2 ? 'double' : 'triple';
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
