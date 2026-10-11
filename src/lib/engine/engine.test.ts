import { describe, expect, it, vi } from 'vitest';
import { MODEL_VERSION, POSITIONS } from '../game/types.ts';
import { neutralDefensivePosition } from '../sim/defense.ts';
import { testDefenseEnvironment, testSeason } from '../sim/test-fixtures.ts';
import type { SeriesProgress } from '../sim/series-types.ts';
import type { GameResult } from '../sim/types.ts';
import { buildSchedule, createContactReference, simulateSeason, simulateSeries } from './node.ts';

// The engine prepares its reference tables and plays full seasons through wasm.
vi.setConfig({ testTimeout: 120_000 });

/** Batting, running, fielding, and pitching value must cancel within each game. */
function valueLedger(game: GameResult): number {
 let ledger = 0;
 for (const box of [game.home, game.away]) {
  for (const line of box.batting) ledger += line.battingRuns + line.stealRuns + line.defensiveRuns;
  for (const line of box.pitching) ledger += line.pitchingRunsAboveNeutral;
 }
 return ledger;
}

describe('wasm engine boundary', () => {
 it('reports each game in order and returns a complete, deterministic season', () => {
  const input = testSeason(162);
  const progress: number[] = [];
  const result = simulateSeason(input, game => progress.push(game));
  expect(progress).toEqual(Array.from({ length: 162 }, (_, index) => index + 1));
  expect(result.modelVersion).toBe(MODEL_VERSION);
  expect(result.wins + result.losses).toBe(162);
  expect(result.games.map(game => game.number)).toEqual(progress);
  expect(result.games.filter(game => game.isHome)).toHaveLength(81);
  expect(result.games.every(game => game.challengeRuns !== game.opponentRuns && game.win === game.challengeRuns > game.opponentRuns)).toBe(true);
  expect(result.runsFor).toBe(result.games.reduce((sum, game) => sum + game.challengeRuns, 0));
  for (const game of result.games) expect(Math.abs(valueLedger(game))).toBeLessThan(1e-9);
  expect(simulateSeason(testSeason(162))).toEqual(result);
  expect(simulateSeason(testSeason(163))).not.toEqual(result);
 });

 it('rejects invalid requests with the engine or contract error', () => {
  const input = testSeason(162);
  expect(() => simulateSeason({ ...input, homeStadium: { id: 'missing', version: 'v0' } })).toThrow(/stadium/i);
  expect(() => simulateSeason({ ...input, battingOrder: input.battingOrder.slice(1) })).toThrow();
  expect(() => buildSchedule(1, ['A', 'A', ...Array.from({ length: 28 }, (_, index) => `T${index}`)])).toThrow(/thirty distinct/);
 });

 it('plays a decided best-of-five with seeding from both regular seasons', () => {
  const steps: SeriesProgress[] = [];
  const result = simulateSeries({ teams: [
   { id: 'team-a', name: 'A', key: 'a', season: testSeason(162) },
   { id: 'team-b', name: 'B', key: 'b', season: testSeason(163) }
  ] }, progress => steps.push(progress));
  expect(Math.max(...Object.values(result.score))).toBe(3);
  expect(result.score[result.championId]).toBe(3);
  for (const teamId of ['team-a', 'team-b']) expect(steps.filter(step => step.stage === 'regular-season' && step.teamId === teamId)).toHaveLength(162);
  expect(steps.at(-1)?.stage).toBe('series');
 });

 it('values defense directionally and neutrally at zero skill', () => {
  const reference = createContactReference(testDefenseEnvironment());
  for (const position of POSITIONS) {
   const neutral = neutralDefensivePosition(position);
   expect(reference.expectedDefensiveRuns(position, neutral)).toBe(0);
   expect(reference.expectedDefensiveRuns(position, { ...neutral, hitPrevention: 1 })).toBeGreaterThan(reference.expectedDefensiveRuns(position, { ...neutral, hitPrevention: -1 }));
  }
  expect(() => reference.expectedDefensiveRuns('C', { ...neutralDefensivePosition('C'), hitPrevention: 2 })).toThrow(/skill/);
 });

 it('labels a failing matchup fit with its query', () => {
  const environment = testDefenseEnvironment();
  const reference = createContactReference(environment);
  const [fit] = reference.fitMatchups([{ battingRates: environment.leagueRates, bats: 'R', pitchingRates: environment.leagueRates, throws: 'R', speed: 0.5 }]);
  expect(fit.classes.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  const noContact = [0.5, 0, 0.5, 0, 0, 0, 0, 0] as typeof environment.leagueRates;
  expect(() => reference.fitMatchups([{ battingRates: noContact, bats: 'R', pitchingRates: environment.leagueRates, throws: 'R', speed: 0.5, label: 'probe-1999' }])).toThrow(/probe-1999/);
 });
});
