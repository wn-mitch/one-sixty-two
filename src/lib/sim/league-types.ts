import type { DraftBullpenSlot } from '../draft/rules.ts';
import type { DraftSlot } from '../draft/types.ts';
import type { MODEL_VERSION, Profile, ReliefAssignment, RULES_VERSION, SimulationData } from '../game/types.ts';
import type { ParkRef } from './park-types.ts';
import type { GameResult, TeamBox } from './types.ts';

/** Draft Mode's league: eight clubs, four rival pairs, 162 matchdays in six 27-matchday chapters. */
export const LEAGUE_CLUBS = 8;
export const LEAGUE_CHAPTERS = 6;
export const CHAPTER_MATCHDAYS = 27;

/** One club's active roster and lineup for a chapter. */
export interface LeagueClubInput {
 id: string; name: string; homeStadium: ParkRef;
 roster: { profile: Profile; slot: DraftSlot }[];
 battingOrder: string[]; starterOrder: string[];
 reliefRoles: ReliefAssignment<DraftBullpenSlot>[];
}

/** A named reliever's rest, carried from one chapter into the next by season id. */
export interface RestState { seasonId: string; last: number; previous: number; restThrough: number }

export interface LeagueChapterInput {
 modelVersion: typeof MODEL_VERSION; rulesVersion: typeof RULES_VERSION; seed: number;
 clubs: LeagueClubInput[];
 /** Four disjoint pairs of club indexes. */
 rivals: [number, number][];
 /** 0-5. */
 chapter: number;
 /** Each club's rest from the previous chapter's result; empty for the first chapter. */
 carry: RestState[][];
 /** The club whose games come back in full, as the challenge side. */
 detailClub: number;
 data: SimulationData;
}

export interface Fixture { home: number; away: number }
/** A compact league game by club index; `matchday` counts from 0 across the season. */
export interface LeagueGame { matchday: number; home: number; away: number; homeRuns: number; awayRuns: number }

export interface LeagueChapterResult {
 chapter: number;
 games: LeagueGame[];
 /** Each club's chapter batting and pitching totals, by club index. */
 totals: TeamBox[];
 detailGames: GameResult[];
 carry: RestState[][];
}

export type LeagueWorkerRequest = { runId: number; input: LeagueChapterInput };
export type LeagueWorkerResponse = { runId: number; type: 'progress'; completed: number } | { runId: number; type: 'result'; result: LeagueChapterResult } | { runId: number; type: 'error'; message: string };
