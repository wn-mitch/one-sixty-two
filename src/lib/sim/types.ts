import type { Position, Profile, Rates, SimulationData, Slot } from '../game/types.ts';
export interface BatterLine {
 seasonId: string; playerId: string; displayName: string;
 PA: number; AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SO: number; R: number; RBI: number; SB: number; CS: number; SF: number;
}
export interface PitcherLine {
 seasonId: string; playerId: string; displayName: string; role: 'starter' | 'closer' | 'support';
 outs: number; H: number; BB: number; HBP: number; SO: number; R: number; starts: number; appearances: number;
}
export interface TeamInput {
 id: string; name: string; hitters: Profile[]; defense: Record<Position, number>;
 pitchers: Profile[]; starterIndex: number; closerIndex: number; bullpenIndex: number;
 closerAvailable: boolean; closerOutsRemaining: number;
}
export interface TeamBox { id: string; name: string; runs: number; innings: (number | null)[]; batting: BatterLine[]; pitching: PitcherLine[] }
export interface GameInput {
 number: number; opponentId: string; opponentName: string; challengeIsHome: boolean;
 home: TeamInput; away: TeamInput; leagueRates: Rates; leagueCatcherCS: number; park: number;
 homeMatchups?: Float64Array; awayMatchups?: Float64Array;
 limits?: { maxPA?: number; maxInnings?: number };
}
export interface GameResult {
 number: number; opponentId: string; opponentName: string; isHome: boolean;
 home: TeamBox; away: TeamBox; challengeRuns: number; opponentRuns: number; win: boolean;
}
export interface SeasonInput {
 seed: number; roster: { profile: Profile; slot: Slot }[]; battingOrder: string[]; starterOrder: string[]; data: SimulationData;
}
export interface SeasonResult {
 modelVersion: string; dataVersion: string; seed: number;
 wins: number; losses: number; firstLoss: number | null; longestWinningStreak: number; runsFor: number; runsAgainst: number;
 games: GameResult[]; batting: BatterLine[]; pitching: PitcherLine[]; starterStarts: number[];
}
export interface ScheduleGame { opponentId: string; isHome: boolean }
export type WorkerRequest = { runId: number; input: SeasonInput };
export type WorkerResponse = { runId: number; type: 'progress'; completed: number } | { runId: number; type: 'result'; result: SeasonResult } | { runId: number; type: 'error'; message: string };
