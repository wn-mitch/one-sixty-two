import { buildLeagueSchedule as wasmLeagueSchedule, buildSchedule as wasmSchedule, Engine } from './pkg/engine.js';
import type { SimulationData } from '../game/types.ts';
import type { SeriesInput, SeriesProgress, SeriesResult } from '../sim/series-types.ts';
import type { StadiumConfig } from '../sim/park-types.ts';
import type { GameResult, ScheduleGame, SeasonInput, SeasonResult, TeamInput } from '../sim/types.ts';
import type { Fixture, LeagueSegmentInput, LeagueSegmentResult } from '../sim/league-types.ts';
import { validateLeagueSegment, validateSeason } from '../sim/validation.ts';

/**
 * The Rust engine behind the TS data contract. Inputs are validated here, then cross the wasm
 * boundary as JSON; one prepared engine is kept per simulation data object. The wasm module must
 * be initialized first (`./node.ts` does so on import, `./browser.ts` through `loadEngine`).
 */
const ENGINES = new WeakMap<SimulationData, Engine>();

function engineFor(data: SimulationData): Engine {
 let engine = ENGINES.get(data);
 if (!engine) {
  engine = new Engine(JSON.stringify(data));
  ENGINES.set(data, engine);
 }
 return engine;
}

function seasonRequest(input: SeasonInput): Omit<SeasonInput, 'data'> {
 const { data: _data, ...request } = input;
 return request;
}

/** Plays one validated season; `onGame` receives each completed game number. */
export function simulateSeason(input: SeasonInput, onGame?: (gameNumber: number) => void): SeasonResult {
 validateSeason(input);
 return JSON.parse(engineFor(input.data).simulateSeason(JSON.stringify(seasonRequest(input)), (gameNumber: number) => onGame?.(gameNumber))) as SeasonResult;
}

/** Recomputes both regular seasons for seeding, then plays the best-of-five. */
export function simulateSeries(input: SeriesInput, onProgress?: (progress: SeriesProgress) => void): SeriesResult {
 const [first, second] = input.teams;
 for (const team of input.teams) validateSeason(team.season);
 if (second.season.data.dataVersion !== first.season.data.dataVersion || second.season.modelVersion !== first.season.modelVersion ||
  second.season.rulesVersion !== first.season.rulesVersion || second.season.schemaVersion !== first.season.schemaVersion) {
  throw new Error('Both replays must use the same game version');
 }
 const request = { teams: input.teams.map(team => ({ id: team.id, name: team.name, key: team.key, season: seasonRequest(team.season) })) };
 return JSON.parse(engineFor(first.season.data).simulateSeries(JSON.stringify(request), (progress: string) => onProgress?.(JSON.parse(progress) as SeriesProgress))) as SeriesResult;
}

/** One standalone game for calibration, drawing from the per-game streams for (`seed`, `game`). */
export interface ExhibitionInput {
 number: number; challengeIsHome: boolean; home: TeamInput; away: TeamInput;
 stadium: StadiumConfig; seed: number; game: number;
}

/** Plays one game outside the season schedule against `data`'s environment; skips win expectancy. */
export function simulateExhibition(data: SimulationData, input: ExhibitionInput): GameResult {
 return JSON.parse(engineFor(data).simulateExhibition(JSON.stringify(input))) as GameResult;
}

/** The engine's season schedule for `seed` against thirty distinct opponent ids. */
export function buildSchedule(seed: number, opponentIds: readonly string[]): ScheduleGame[] {
 if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Schedule requires a valid seed and thirty distinct opponents');
 return JSON.parse(wasmSchedule(seed, JSON.stringify(opponentIds))) as ScheduleGame[];
}

/** Plays one validated Draft Mode league segment; `onGame` receives the count of games played. */
export function simulateLeagueSegment(input: LeagueSegmentInput, onGame?: (completed: number) => void): LeagueSegmentResult {
 validateLeagueSegment(input);
 const { data, ...request } = input;
 return JSON.parse(engineFor(data).simulateLeagueSegment(JSON.stringify(request), (completed: number) => onGame?.(completed))) as LeagueSegmentResult;
}

/** The league's 162 matchdays of four fixtures for `seed` and four rival pairs of club indexes. */
export function buildLeagueSchedule(seed: number, rivals: readonly (readonly [number, number])[]): Fixture[][] {
 return JSON.parse(wasmLeagueSchedule(seed, JSON.stringify(rivals))) as Fixture[][];
}
