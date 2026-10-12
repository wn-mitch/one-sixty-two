import { describe, expect, it, vi } from 'vitest';
import { MODEL_VERSION, POSITIONS } from '../game/types.ts';
import { neutralDefensivePosition } from '../sim/defense.ts';
import { testDefenseEnvironment, testSeason } from '../sim/test-fixtures.ts';
import type { SeriesProgress } from '../sim/series-types.ts';
import type { GameResult } from '../sim/types.ts';
import { buildSchedule, createContactReference, simulateSeason, simulateSeries } from './node.ts';
import { neutralPark } from '../sim/park.ts';
import type { Rates } from '../game/types.ts';

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

 it('plays contact out by park: the neutral park reproduces the linear weights and thin air favors power', () => {
  const environment = testDefenseEnvironment();
  const reference = createContactReference(environment);
  const league = environment.leagueRates;
  const power: Rates = [0.1, 0.01, 0.27, 0.11, 0.045, 0.002, 0.06, 0.403];
  const contact: Rates = [0.06, 0.01, 0.12, 0.2, 0.05, 0.006, 0.01, 0.544];
  const queries = [league, power, contact].map(battingRates => ({ battingRates, bats: '', pitchingRates: league, throws: '', speed: 0.5, unknownSide: true }));
  // At unknown side in the neutral park, park values equal the pricing path's fits and linear weights.
  const weights = reference.eventRunWeights();
  const [neutral, thin] = reference.parkRunValues([neutralPark(), { ...neutralPark(), id: 'thin-air', airDensityKgM3: 0.95 }].map(park => reference.parkBasis(park)), queries);
  expect(() => reference.parkRunValues([new Float64Array(5)], queries)).toThrow(/multiple/);
  reference.fitMatchups(queries).forEach((fit, index) => {
   const inPlay = fit.rates[3] + fit.rates[4] + fit.rates[5] + fit.rates[6] + fit.rates[7];
   let runs = (fit.rates[0] + fit.rates[1]) * weights.walk + fit.rates[2] * weights.strikeout;
   fit.classes.forEach((share, cls) => { runs += inPlay * share * weights.classes[cls]; });
   expect(neutral[index].runs).toBeCloseTo(runs, 9);
  });
  const gain = thin.map((value, index) => value.runs - neutral[index].runs);
  expect(gain[0]).toBeGreaterThan(0);
  expect(gain[1]).toBeGreaterThan(gain[2]);
  expect(thin[1].outs).toBeLessThan(neutral[1].outs);
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
