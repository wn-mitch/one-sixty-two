import type { DraftBullpenSlot } from '../draft/rules.ts';
import type { DraftSlot } from '../draft/types.ts';
import type { MODEL_VERSION, Profile, ReliefAssignment, RULES_VERSION, SimulationData } from '../game/types.ts';
import type { ParkRef } from './park-types.ts';
import type { GameResult, TeamBox } from './types.ts';

/**
 * Draft Mode's league: eight clubs, four rival pairs, 162 matchdays played in eighteen nine-matchday
 * segments. Every third segment closes a 27-matchday chapter.
 */
export const LEAGUE_CLUBS = 8;
export const LEAGUE_SEGMENTS = 18;
export const SEGMENT_MATCHDAYS = 9;
export const LEAGUE_CHAPTERS = 6;
export const SEGMENTS_PER_CHAPTER = LEAGUE_SEGMENTS / LEAGUE_CHAPTERS;
export const CHAPTER_MATCHDAYS = SEGMENT_MATCHDAYS * SEGMENTS_PER_CHAPTER;
/** The engine's bound on a crowd's edge and volatility. */
export const MAX_CROWD_EDGE = 0.4;

/** One club's active roster and lineup for a segment. */
export interface LeagueClubInput {
 id: string; name: string; homeStadium: ParkRef;
 roster: { profile: Profile; slot: DraftSlot }[];
 battingOrder: string[]; starterOrder: string[];
 reliefRoles: ReliefAssignment<DraftBullpenSlot>[];
 /** Named relievers, by season id, trained to recover quickly. */
 quickRecovery: string[];
 /** Starters, by season id, ridden two innings past their usual workload this segment. */
 ridden: string[];
 /** Named relievers, by season id, who skip rest this segment. */
 tireless: string[];
 /** The franchise's exaggerated park condition at its home games, or null for the real park. */
 parkPackage: ParkPackage | null;
 /** The franchise's in-game crowd trigger at its home games, or null. */
 crowdTrigger: CrowdTrigger | null;
}

/** Draft Mode's exaggerated park conditions; both clubs play under them. */
export const PARK_PACKAGES = ['thinAir', 'heavyAir', 'tallLeftWall', 'shortRightField', 'windToRight'] as const;
export type ParkPackage = typeof PARK_PACKAGES[number];

/** Franchise crowds that react during a home game; hype leans the strike zone further toward the home side. */
export const CROWD_TRIGGERS = ['homeRunHappyHour', 'guardTheLead', 'winningUgly', 'beatTheTraffic', 'closingTime'] as const;
export type CrowdTrigger = typeof CROWD_TRIGGERS[number];

/** A named reliever's rest, carried from one segment into the next by season id. */
export interface RestState { seasonId: string; last: number; previous: number; restThrough: number }

/**
 * A club's home crowd for a segment: the strike zone's mean lean toward the home side (home batters
 * walk more and strike out less, visitors the reverse) and the spread of each game's lean around it.
 */
export interface Crowd { edge: number; volatility: number }

/** The rules a segment's games are played under; the commissioner's decree changes them. */
export interface GameRules {
 /** Regulation length; tied games continue an inning at a time. */
 innings: number;
 /** Outs that end a half inning. */
 outs: number;
 /** Every hit is a single that moves each runner one base, as are errors; nobody steals. */
 singlesOnly: boolean;
 /** A walk or hit batter takes second and every runner advances two bases. */
 freePassTwo: boolean;
 /** A double play ends the half inning. */
 doublePlayEnds: boolean;
 /** Every runner advances one base on a caught outfield fly that is not the last out. */
 everybodyTags: boolean;
}
export const STANDARD_RULES: Readonly<GameRules> = { innings: 9, outs: 3, singlesOnly: false, freePassTwo: false, doublePlayEnds: false, everybodyTags: false };

export interface LeagueSegmentInput {
 modelVersion: typeof MODEL_VERSION; rulesVersion: typeof RULES_VERSION; seed: number;
 clubs: LeagueClubInput[];
 /** Four disjoint pairs of club indexes. */
 rivals: [number, number][];
 /** 0-17. */
 segment: number;
 /** Each club's home crowd, by club index. */
 crowds: Crowd[];
 /** Each club's rest from the previous segment's result; empty for the first segment. */
 carry: RestState[][];
 /** The club whose games come back in full, as the challenge side. */
 detailClub: number;
 rules: GameRules;
 data: SimulationData;
}

export interface Fixture { home: number; away: number }
/** A compact league game by club index; `matchday` counts from 0 across the season. */
export interface LeagueGame { matchday: number; home: number; away: number; homeRuns: number; awayRuns: number }

export interface LeagueSegmentResult {
 segment: number;
 games: LeagueGame[];
 /** Each club's segment batting and pitching totals, by club index. */
 totals: TeamBox[];
 detailGames: GameResult[];
 carry: RestState[][];
}

export type LeagueWorkerRequest = { runId: number; input: LeagueSegmentInput };
export type LeagueWorkerResponse = { runId: number; type: 'progress'; completed: number } | { runId: number; type: 'result'; result: LeagueSegmentResult; schedule: Fixture[][] } | { runId: number; type: 'error'; message: string };
