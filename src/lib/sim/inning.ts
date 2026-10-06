import { POSITIONS } from '../game/types.ts';
import { createBases, force, hit, tagUp, type Bases } from './advancement.ts';
import { sampleEvent } from './matchup.ts';
import type { SeasonMomentOutcome, TeamBox, TeamInput } from './types.ts';
import { beforePlateAppearance, clamp, type Workload } from './workload.ts';

const FIELD_CUMULATIVE = [0.05, 0.15, 0.30, 0.40, 0.60, 0.73, 0.87, 1];
export interface InningEvent {
 outsBefore: number; outsAfter: number; basesBefore: number; basesAfter: number;
 offenseRunsBefore: number; defenseRunsBefore: number; offenseRunsAfter: number; defenseRunsAfter: number;
 batterName: string; batterSeasonId: string; pitcherName: string;
 outcome: SeasonMomentOutcome; runsScored: number;
}
export type InningObserver = (event: InningEvent) => void;
export interface InningContext {
 offense: TeamInput; defense: TeamInput; batting: TeamBox; pitching: TeamBox;
 bases: Bases; workload: Workload; matchups: Float64Array; errors: Float64Array;
 next: number; leagueCatcherCS: number; maxPA: number;
}
export function createInningContext(offense: TeamInput, defense: TeamInput, batting: TeamBox, pitching: TeamBox, workload: Workload, matchups: Float64Array, leagueCatcherCS: number, maxPA: number): InningContext {
 return { offense, defense, batting, pitching, bases: createBases(batting, pitching), workload, matchups,
  errors: Float64Array.from(POSITIONS, position => defense.hitters[defense.defense[position]].errorRates[position]),
  next: 0, leagueCatcherCS, maxPA };
}
function basesMask(bases: Bases): number {
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
 outcome: SeasonMomentOutcome,
 outsAfter: number
): void {
 if (!observer) return;
 observer({
  outsBefore, outsAfter, basesBefore, basesAfter: basesMask(context.bases),
  offenseRunsBefore, defenseRunsBefore: context.pitching.runs,
  offenseRunsAfter: context.batting.runs, defenseRunsAfter: context.pitching.runs,
  batterName, batterSeasonId, pitcherName, outcome,
  runsScored: context.batting.runs - offenseRunsBefore
 });
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
 const catcher = defense.hitters[defense.defense.C];
 while (outs < 3 && !bases.ended) {
  beforePlateAppearance(defense, pitching.pitching, workload);
  const pitcherIndex = workload.current;
  const pitcher = pitching.pitching[pitcherIndex];
  pitcher.appearances = 1;
  if (bases.runners[0] !== -1 && bases.runners[1] === -1) {
   const runnerIndex = bases.runners[0];
   const runner = offense.hitters[runnerIndex];
   if (random() < runner.stealAttempt) {
    const outsBefore = outs;
    const basesBefore = basesMask(bases);
    const runsBefore = batting.runs;
    const success = clamp(runner.stealSuccess - 0.25 * (catcher.catcherCS - context.leagueCatcherCS), 0.35, 0.95);
    if (random() < success) {
     bases.runners[1] = runnerIndex;
     bases.pitchers[1] = bases.pitchers[0];
     batting.batting[runnerIndex].SB++;
    } else {
     batting.batting[runnerIndex].CS++;
     pitcher.outs++;
     outs++;
    }
    bases.runners[0] = -1;
    bases.pitchers[0] = -1;
    observe(observer, context, outsBefore, basesBefore, runsBefore, runner.displayName, runner.seasonId, defense.pitchers[pitcherIndex].displayName,
     outs === outsBefore ? 'stolenBase' : 'caughtStealing', outs);
    if (outs === 3) break;
    // A caught stealing can itself complete a starter's outs budget.
    beforePlateAppearance(defense, pitching.pitching, workload);
   }
  }
  if (++appearances > context.maxPA) throw new Error(`Simulation exceeded ${context.maxPA} plate appearances in a half inning`);
  const activeIndex = workload.current;
  const active = pitching.pitching[activeIndex];
  active.appearances = 1;
  const hitterIndex = context.next;
  const profile = offense.hitters[hitterIndex];
  const hitter = batting.batting[hitterIndex];
  context.next = (context.next + 1) % 9;
  const outsBefore = outs;
  const basesBefore = basesMask(bases);
  const event = sampleEvent(context.matchups, (hitterIndex * defense.pitchers.length + activeIndex) * 8, random());
  hitter.PA++;
  const runsBefore = batting.runs;
  let outcome: SeasonMomentOutcome;
  if (event === 0 || event === 1) {
   if (event === 0) { hitter.BB++; active.BB++; outcome = 'walk'; }
   else { hitter.HBP++; active.HBP++; outcome = 'hitByPitch'; }
   force(bases, hitterIndex, activeIndex);
   hitter.RBI += batting.runs - runsBefore;
  } else if (event >= 3 && event <= 6) {
   const credited = hit(bases, event - 2, hitterIndex, activeIndex, offense.hitters, random);
   hitter.AB++;
   hitter.H++;
   active.H++;
   if (credited === 2) hitter.doubles++;
   else if (credited === 3) hitter.triples++;
   else if (credited === 4) hitter.HR++;
   outcome = credited === 1 ? 'single' : credited === 2 ? 'double' : credited === 3 ? 'triple' : 'homeRun';
   hitter.RBI += batting.runs - runsBefore;
  } else if (event === 2) {
   hitter.AB++;
   hitter.SO++;
   active.SO++;
   active.outs++;
   outs++;
   outcome = 'strikeout';
  } else {
   const selection = random();
   let fielder = 0;
   while (selection >= FIELD_CUMULATIVE[fielder]) fielder++;
   if (random() < context.errors[fielder]) {
    hitter.AB++;
    force(bases, hitterIndex, activeIndex);
    outcome = 'reachedOnError';
   } else if (bases.runners[0] !== -1 && outs < 2 && random() < profile.doublePlay) {
    hitter.AB++;
    bases.runners[0] = -1;
    bases.pitchers[0] = -1;
    active.outs += 2;
    outs += 2;
    outcome = 'groundedIntoDoublePlay';
   } else {
    if (bases.runners[2] !== -1 && outs < 2 && random() < 0.25) {
     tagUp(bases);
     hitter.SF++;
     hitter.RBI++;
     outcome = 'sacrificeFly';
    } else {
     hitter.AB++;
     outcome = 'out';
    }
    active.outs++;
    outs++;
   }
  }
  observe(observer, context, outsBefore, basesBefore, runsBefore, profile.displayName, profile.seasonId, defense.pitchers[activeIndex].displayName, outcome, outs);
 }
}
