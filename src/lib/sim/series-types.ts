import type { ParkRef } from './park-types.ts';
import type { GameResult, SeasonInput, SeasonMoment, TeamBox, WinPoint } from './types.ts';

export const SERIES_RULES_VERSION = 'h2h-bo5-v1' as const;
export const SERIES_SEED_POLICY = 'replay-pair-v1' as const;
export const MVP_VERSION = 'realized-runs-v1' as const;
export const SUPERLATIVES_VERSION = 'realized-runs-awards-v1' as const;
export type SeriesTeamId = 'team-a' | 'team-b';
export const SERIES_TEAM_IDS: readonly SeriesTeamId[] = ['team-a', 'team-b'];
/** Home team by seed for games 1-5 (MLB 2-2-1), and the calendar day of each game. */
export const SERIES_HOME_SEEDS = [1, 1, 2, 2, 1] as const;
export const SERIES_DAYS = [1, 2, 4, 5, 7] as const;
export const SERIES_TIE_RULE = 'Equal regular-season records: the replay whose canonical link sorts first takes seed 1; identical replays give it to Team A.';
export const MVP_TIE_RULE = 'Equal unrounded run values: the replay whose canonical link sorts first, then the season identifier.';

/** One validated source team; `key` is `JSON.stringify(replayInput(draft))`. */
export interface SeriesTeamInput { id: SeriesTeamId; name: string; key: string; season: SeasonInput }
export interface SeriesInput { teams: readonly [SeriesTeamInput, SeriesTeamInput] }

export type SeriesProgress =
 | { stage: 'regular-season'; teamId: SeriesTeamId; completed: number }
 | { stage: 'series'; completed: number };

export interface SeriesAward {
 teamId: SeriesTeamId; seasonId: string; displayName: string;
 /** battingRuns + stealRuns + defensiveRuns + pitchingRunsAboveNeutral, unrounded. */
 runs: number;
 batting: number; running: number; defense: number; pitching: number;
}

/**
 * Series awards beside the MVP, each ranked by one realized-runs component with the MVP's tie rule:
 * Top bat (batting), Ace (pitching), Glove (defense), Wheels (baserunning), and LVP (lowest total).
 */
export type SeriesSuperlativeKind = 'top-bat' | 'ace' | 'glove' | 'wheels' | 'lvp';
export const SUPERLATIVE_KINDS: readonly SeriesSuperlativeKind[] = ['top-bat', 'ace', 'glove', 'wheels', 'lvp'];
/** Glove and Wheels are only awarded when the leader's component reaches this many runs. */
export const SUPERLATIVE_MIN_RUNS = 0.05;
export interface SeriesSuperlative { kind: SeriesSuperlativeKind; award: SeriesAward }

/** A game swing with explicit ownership; swings are from Team A's perspective. */
export interface SeriesMoment extends SeasonMoment {
 perspectiveTeamId: 'team-a';
 battingTeamId: SeriesTeamId;
 pitchingTeamId: SeriesTeamId;
}

export interface SeriesGame {
 number: number; day: number;
 homeTeamId: SeriesTeamId; awayTeamId: SeriesTeamId; winnerId: SeriesTeamId;
 stadium: ParkRef; stadiumName: string;
 /** Series wins after this game. */
 score: Record<SeriesTeamId, number>;
 result: GameResult;
 mvp: SeriesAward | null;
 highlight: SeriesMoment | null; lowlight: SeriesMoment | null;
 /** Team A's win chance through the game; see `simulateGame`'s trace. */
 winTrace: WinPoint[];
}

export interface SeriesTeamResult {
 id: SeriesTeamId; name: string; key: string;
 record: { wins: number; losses: number };
 seed: 1 | 2;
 homeStadium: ParkRef; homeStadiumName: string;
 /** Totals over the played series games only. */
 totals: TeamBox;
}

export interface SeriesResult {
 seriesRulesVersion: typeof SERIES_RULES_VERSION;
 seedPolicy: typeof SERIES_SEED_POLICY;
 mvpVersion: typeof MVP_VERSION;
 superlativesVersion: typeof SUPERLATIVES_VERSION;
 dataVersion: string;
 seed: number;
 teams: [SeriesTeamResult, SeriesTeamResult];
 games: SeriesGame[];
 championId: SeriesTeamId;
 score: Record<SeriesTeamId, number>;
 mvp: SeriesAward | null;
 /** In SUPERLATIVE_KINDS order; a kind with no eligible player, or a Glove/Wheels leader under SUPERLATIVE_MIN_RUNS, is omitted. */
 superlatives: SeriesSuperlative[];
 highlight: SeriesMoment | null;
 lowlight: SeriesMoment | null;
}

export type SeriesWorkerRequest = { runId: number; input: SeriesInput };
export type SeriesWorkerResponse =
 | { runId: number; type: 'progress'; progress: SeriesProgress }
 | { runId: number; type: 'result'; result: SeriesResult }
 | { runId: number; type: 'error'; message: string };
