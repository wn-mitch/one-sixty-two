import { describe, expect, it, vi } from 'vitest';
import { MODEL_VERSION, POSITIONS } from '../game/types.ts';
import { neutralDefensivePosition } from '../sim/defense.ts';
import { testDefenseEnvironment, testLeagueChapter, testSeason } from '../sim/test-fixtures.ts';
import type { LeagueChapterResult } from '../sim/league-types.ts';
import type { SeriesProgress } from '../sim/series-types.ts';
import type { GameResult } from '../sim/types.ts';
import { buildLeagueSchedule, buildSchedule, createContactReference, simulateLeagueChapter, simulateSeason, simulateSeries } from './node.ts';
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
  const observed = result.games.flatMap(game => [game.highlight, game.lowlight]).filter(moment => moment !== null);
  expect(observed.length).toBeGreaterThan(0);
  for (const moment of observed) {
   const play = moment.play!;
   expect(play).toBeDefined();
   expect(play.outsAfter).toBeGreaterThanOrEqual(moment.outsBefore);
   expect(play.outsAfter).toBeLessThanOrEqual(3);
   const nonContact = ['walk', 'hitByPitch', 'strikeout', 'stolenBase', 'caughtStealing'].includes(moment.outcome);
   expect(play.contact === null).toBe(nonContact);
   if (play.contact) {
    expect(Number.isFinite(play.contact.exitVelocityMph)).toBe(true);
    expect(Number.isFinite(play.contact.launchAngleDeg)).toBe(true);
    expect(Number.isFinite(play.contact.sprayAngleDeg)).toBe(true);
    if (play.contact.fielderName) {
     const game = result.games[moment.gameNumber - 1];
     const fielding = moment.half === 'top' ? game.home : game.away;
     expect(fielding.batting.some(line => line.displayName === play.contact!.fielderName && line.seasonId === play.contact!.fielderSeasonId)).toBe(true);
    }
   }
   expect(play.runners.filter(runner => runner.to === 4).length + (moment.outcome === 'homeRun' ? 1 : 0)).toBe(moment.runsScored);
   expect(play.runners.filter(runner => runner.to === 0).length).toBeLessThanOrEqual(play.outsAfter - moment.outsBefore);
   for (const runner of play.runners) {
    expect(moment.basesBefore & (1 << (runner.from - 1))).not.toBe(0);
    expect(runner.to).not.toBe(runner.from);
   }
  }
  expect(observed.some(moment => moment.play!.runners.some(runner => runner.to === 4))).toBe(true);
  expect(observed.some(moment => moment.play!.contact?.fielding === 'air')).toBe(true);
  for (const game of result.games) expect(Math.abs(valueLedger(game))).toBeLessThan(1e-9);
  expect(simulateSeason(testSeason(162))).toEqual(result);
  expect(simulateSeason(testSeason(163))).not.toEqual(result);
 });

 it('rejects invalid requests with the engine or contract error', () => {
  const input = testSeason(162);
  expect(() => simulateSeason({ ...input, homeStadium: { id: 'missing', version: 'v0' } })).toThrow(/stadium/i);
  expect(() => simulateSeason({ ...input, battingOrder: input.battingOrder.slice(1) })).toThrow();
  expect(() => buildSchedule(1, ['A', 'A', ...Array.from({ length: 28 }, (_, index) => `T${index}`)])).toThrow(/thirty distinct/);
  expect(() => simulateSeason({ ...input, reliefRoles: input.reliefRoles.slice(1) })).toThrow(/relief roles/i);
  expect(() => simulateSeason({ ...input, reliefRoles: input.reliefRoles.map(role => ({ ...role, secondary: role.primary })) })).toThrow(/relief roles|repeats/i);
 });

 it('deploys the bullpen by the requested relief roles', () => {
  const input = testSeason(162);
  const outs = (result: ReturnType<typeof simulateSeason>) => result.pitching.filter(line => line.role === 'closer' || line.role === 'reliever').map(line => line.outs);
  const defaults = outs(simulateSeason(input));
  // Every arm a stopper: no closer or setup man, so the named relievers pitch only in late jams.
  const stoppers = outs(simulateSeason({ ...input, reliefRoles: input.reliefRoles.map(role => ({ ...role, primary: 'stopper' as const, secondary: null })) }));
  expect(stoppers).not.toEqual(defaults);
  expect(stoppers.reduce((sum, value) => sum + value, 0)).toBeLessThan(defaults.reduce((sum, value) => sum + value, 0));
 });

 it('plays a league season chapter by chapter with rest carried between chapters', () => {
  const first = testLeagueChapter(162);
  const chapters: LeagueChapterResult[] = [];
  for (let chapter = 0; chapter < 6; chapter++) {
   chapters.push(simulateLeagueChapter({ ...first, chapter, carry: chapters.at(-1)?.carry ?? [] }));
  }
  const games = chapters.flatMap(result => result.games);
  expect(games).toHaveLength(648);
  const schedule = buildLeagueSchedule(162, first.rivals);
  expect(games.map(game => [game.matchday, game.home, game.away])).toEqual(schedule.flatMap((day, matchday) => day.map(fixture => [matchday, fixture.home, fixture.away])));
  for (let club = 0; club < 8; club++) {
   expect(games.filter(game => game.home === club || game.away === club)).toHaveLength(162);
   expect(chapters.reduce((sum, result) => sum + result.totals[club].runs, 0)).toBe(games.reduce((sum, game) => sum + (game.home === club ? game.homeRuns : game.away === club ? game.awayRuns : 0), 0));
  }
  // The detail club's games come back whole, from its side.
  const detail = chapters[2].detailGames;
  expect(detail).toHaveLength(27);
  expect(detail.every(game => (game.isHome ? game.home : game.away).id === 'club-0')).toBe(true);
  expect(detail.map(game => game.challengeRuns)).toEqual(chapters[2].games.filter(game => game.home === 0 || game.away === 0).map(game => game.home === 0 ? game.homeRuns : game.awayRuns));
  // Carried rest matters: the same chapter from fresh arms uses the bullpen differently, and repeats exactly.
  const second = { ...first, chapter: 1, carry: chapters[0].carry };
  expect(simulateLeagueChapter(second)).toEqual(chapters[1]);
  const fresh = chapters[0].carry.map(club => club.map(state => ({ ...state, last: -1, previous: -1, restThrough: -1 })));
  const outs = (result: LeagueChapterResult) => result.totals.map(box => box.pitching.map(line => line.outs));
  expect(outs(simulateLeagueChapter({ ...second, carry: fresh }))).not.toEqual(outs(chapters[1]));
  expect(() => simulateLeagueChapter({ ...first, chapter: 1 })).toThrow(/previous chapter/);
  // Draft legality lets a club hold two seasons of one player.
  const twice = structuredClone(first);
  twice.clubs[0].roster[1].profile.playerId = twice.clubs[0].roster[0].profile.playerId;
  expect(simulateLeagueChapter(twice).games).toHaveLength(108);
  expect(() => simulateLeagueChapter({ ...first, rivals: [[0, 1], [1, 2], [3, 4], [5, 6]] })).toThrow(/rival/i);
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
