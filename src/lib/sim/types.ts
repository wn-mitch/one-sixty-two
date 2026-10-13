import type { ParkRef } from './park-types.ts';
import {
 DEFENSE_METHOD_VERSION,
 MODEL_VERSION,
 RULES_VERSION,
 VALUATION_VERSION,
 type HitterSlot,
 type Position,
 type Profile,
 type ReliefAssignment,
 type ReplaySchemaVersion,
 type SimulationData,
 type Slot
} from '../game/types.ts';

export interface DefensiveRunComponents {
 hitPrevention: number;
 errorAvoidance: number;
 doublePlay: number;
 outfieldThrowing: number;
 catcherThrowing: number;
}
export interface BatterLine {
 seasonId: string; playerId: string; displayName: string;
 /** Fielded position, or DH for the hitter without one; `year` is the player's source season. */
 position: HitterSlot; year: number;
 PA: number; AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SO: number; R: number; RBI: number; SB: number; CS: number; SF: number;
 battingRuns: number; stealRuns: number; defensiveRuns: number;
 defensiveComponents: DefensiveRunComponents; fieldingOuts: number; caughtAdvancing: number;
 /** Home runs with the bases loaded, and game-ending home runs in the bottom of the 9th or later. */
 grandSlams: number; walkOffHomeRuns: number;
}
export interface PitcherLine {
 seasonId: string; playerId: string; displayName: string; year: number; role: 'starter' | 'closer' | 'reliever' | 'support';
 outs: number; H: number; BB: number; HBP: number; SO: number; R: number; starts: number; appearances: number;
 BF: number; pitchingRunsAboveNeutral: number;
 /** MLB saves and blown saves; an opportunity is either. */
 saves: number; blownSaves: number; saveOpportunities: number;
}
export interface TeamInput {
 id: string; name: string; hitters: Profile[]; defense: Record<Position, number>;
 pitchers: Profile[]; starterIndex: number; closerIndex: number;
 /** Named relievers in leverage order: the 8th, the 7th, then middle relief. */
 relievers: number[];
 /** The remainder arm for relief innings no available named pitcher takes. */
 bullpenIndex: number;
 /** Whether each pitcher may enter today, by pitcher index. */
 available: boolean[];
}
export interface TeamBox {
 id: string; name: string; runs: number; innings: (number | null)[];
 batting: BatterLine[]; pitching: PitcherLine[];
 battingRuns: number; stealRuns: number; defensiveRuns: number;
 defensiveComponents: DefensiveRunComponents; pitchingRunsAboveNeutral: number;
}
export type SeasonMomentOutcome =
 'walk' | 'hitByPitch' | 'strikeout' | 'single' | 'double' | 'triple' | 'homeRun' |
 'groundedIntoDoublePlay' | 'sacrificeFly' | 'out' | 'reachedOnError' | 'stolenBase' | 'caughtStealing';
/** Challenge-side win chance after one play; `half` counts half-innings from 0 (top of the 1st). */
export interface WinPoint { half: number; win: number }
export interface MomentContact {
 exitVelocityMph: number; launchAngleDeg: number; sprayAngleDeg: number;
 fair: boolean; fielding: 'air' | 'ground' | 'hit'; automaticDouble: boolean;
 fielderName: string | null; fielderSeasonId: string | null; fielderPosition: string | null;
}
export interface MomentPlay {
 outsAfter: number;
 contact: MomentContact | null;
 /** Runners already aboard: 0 = out, 1–3 = base, 4 = scored. */
 runners: { name: string; seasonId: string; from: number; to: number }[];
}
export interface SeasonMoment {
 /** Older saved results retain their summary even without observed play detail. */
 play?: MomentPlay;
 gameNumber: number; opponentName: string; isHome: boolean;
 inning: number; half: 'top' | 'bottom'; outsBefore: number; basesBefore: number;
 challengeRunsBefore: number; opponentRunsBefore: number; challengeRunsAfter: number; opponentRunsAfter: number;
 batterName: string; batterSeasonId: string; pitcherName: string; pitcherSeasonId: string; challengeBatting: boolean;
 outcome: SeasonMomentOutcome; runsScored: number;
 winBefore: number; winAfter: number; swing: number;
}
export interface GameResult {
 number: number; opponentId: string; opponentName: string; isHome: boolean;
 stadium: ParkRef; stadiumName: string;
 home: TeamBox; away: TeamBox; challengeRuns: number; opponentRuns: number; win: boolean;
 highlight: SeasonMoment | null; lowlight: SeasonMoment | null;
}
export interface SeasonInput {
 schemaVersion: ReplaySchemaVersion; modelVersion: typeof MODEL_VERSION; rulesVersion: typeof RULES_VERSION;
 seed: number; homeStadium: ParkRef; roster: { profile: Profile; slot: Slot }[]; battingOrder: string[]; starterOrder: string[];
 /** Roles for CL, then RP1 onward. */
 reliefRoles: ReliefAssignment[]; data: SimulationData;
}
export interface SeasonResult {
 modelVersion: typeof MODEL_VERSION; rulesVersion: typeof RULES_VERSION; dataVersion: string; seed: number;
 homeStadium: ParkRef;
 defenseMethodVersion: typeof DEFENSE_METHOD_VERSION; valuationVersion: typeof VALUATION_VERSION;
 wins: number; losses: number; firstLoss: number | null; longestWinningStreak: number; runsFor: number; runsAgainst: number;
 games: GameResult[]; batting: BatterLine[]; pitching: PitcherLine[]; starterStarts: number[];
 highlight: SeasonMoment | null; lowlight: SeasonMoment | null;
 /** Challenge-side win chance through the highlight's and lowlight's games; see `simulateGame`'s trace. */
 highlightTrace: WinPoint[] | null; lowlightTrace: WinPoint[] | null;
}
export interface ScheduleGame { opponentId: string; isHome: boolean }
export type WorkerRequest = { runId: number; input: SeasonInput };
export type WorkerResponse = { runId: number; type: 'progress'; completed: number } | { runId: number; type: 'result'; result: SeasonResult } | { runId: number; type: 'error'; message: string };
