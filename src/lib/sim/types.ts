import type { PreparedMatchups } from './contact-profile.ts';
import type { ParkRef, StadiumConfig } from './park-types.ts';
import {
 DEFENSE_METHOD_VERSION,
 MODEL_VERSION,
 RULES_VERSION,
 VALUATION_VERSION,
 type DefensiveEnvironment,
 type Position,
 type Profile,
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
 PA: number; AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SO: number; R: number; RBI: number; SB: number; CS: number; SF: number;
 battingRuns: number; stealRuns: number; defensiveRuns: number;
 defensiveComponents: DefensiveRunComponents; fieldingOuts: number; caughtAdvancing: number;
}
export interface PitcherLine {
 seasonId: string; playerId: string; displayName: string; role: 'starter' | 'closer' | 'support';
 outs: number; H: number; BB: number; HBP: number; SO: number; R: number; starts: number; appearances: number;
 BF: number; pitchingRunsAboveNeutral: number;
}
export interface TeamInput {
 id: string; name: string; hitters: Profile[]; defense: Record<Position, number>;
 pitchers: Profile[]; starterIndex: number; closerIndex: number; bullpenIndex: number;
 closerAvailable: boolean; closerOutsRemaining: number;
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
export interface SeasonMoment {
 gameNumber: number; opponentName: string; isHome: boolean;
 inning: number; half: 'top' | 'bottom'; outsBefore: number; basesBefore: number;
 challengeRunsBefore: number; opponentRunsBefore: number; challengeRunsAfter: number; opponentRunsAfter: number;
 batterName: string; batterSeasonId: string; pitcherName: string; pitcherSeasonId: string; challengeBatting: boolean;
 outcome: SeasonMomentOutcome; runsScored: number;
 winBefore: number; winAfter: number; swing: number;
}
/** Independent named streams: plate-appearance events, contact samples, fielding, and runner decisions. */
export interface GameRandomStreams { pa: () => number; contact: () => number; fielding: () => number; advancement: () => number }
export interface GameInput {
 number: number; opponentId: string; opponentName: string; challengeIsHome: boolean;
 home: TeamInput; away: TeamInput; defenseEnvironment: DefensiveEnvironment;
 /** The home team's venue; both clubs play in it. */
 stadium: StadiumConfig;
 /** Home hitters against away pitchers, and the reverse; built when omitted. */
 homeMatchups?: PreparedMatchups; awayMatchups?: PreparedMatchups;
 limits?: { maxPA?: number; maxInnings?: number };
}
export interface GameResult {
 number: number; opponentId: string; opponentName: string; isHome: boolean;
 stadium: ParkRef; stadiumName: string;
 home: TeamBox; away: TeamBox; challengeRuns: number; opponentRuns: number; win: boolean;
 highlight: SeasonMoment | null; lowlight: SeasonMoment | null;
}
export interface SeasonInput {
 schemaVersion: ReplaySchemaVersion; modelVersion: typeof MODEL_VERSION; rulesVersion: typeof RULES_VERSION;
 seed: number; homeStadium: ParkRef; roster: { profile: Profile; slot: Slot }[]; battingOrder: string[]; starterOrder: string[]; data: SimulationData;
}
export interface SeasonResult {
 modelVersion: typeof MODEL_VERSION; rulesVersion: typeof RULES_VERSION; dataVersion: string; seed: number;
 homeStadium: ParkRef;
 defenseMethodVersion: typeof DEFENSE_METHOD_VERSION; valuationVersion: typeof VALUATION_VERSION;
 wins: number; losses: number; firstLoss: number | null; longestWinningStreak: number; runsFor: number; runsAgainst: number;
 games: GameResult[]; batting: BatterLine[]; pitching: PitcherLine[]; starterStarts: number[];
 highlight: SeasonMoment | null; lowlight: SeasonMoment | null;
}
export interface ScheduleGame { opponentId: string; isHome: boolean }
export type WorkerRequest = { runId: number; input: SeasonInput };
export type WorkerResponse = { runId: number; type: 'progress'; completed: number } | { runId: number; type: 'result'; result: SeasonResult } | { runId: number; type: 'error'; message: string };
