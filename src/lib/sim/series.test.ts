import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createBox } from './game.ts';
import { stadiumRef } from './park.ts';
import { seedOrder, selectMvp, seriesSeed, simulateSeries } from './series.ts';
import { SERIES_HOME_SEEDS, type SeriesInput, type SeriesResult, type SeriesTeamId } from './series-types.ts';
import { accumulateBox, createDraftTeam } from './team.ts';
import { testSeason, testTeam } from './test-fixtures.ts';

// Each series recomputes two full regular seasons.
vi.setConfig({ testTimeout: 120_000 });

function input(order: 'ab' | 'ba' = 'ab'): SeriesInput {
 const strong = testSeason(901);
 const weak = testSeason(902);
 // A weaker lineup for the second source so seeding is decided by record, not the tie rule.
 for (const pick of weak.roster.slice(0, 9)) {
  pick.profile.battingRates = [0.05, 0.01, 0.3, 0.12, 0.03, 0.003, 0.012, 0.475];
  pick.profile.contact = { ...pick.profile.contact!, batting: [0.12 / 0.64, 0.03 / 0.64, 0.003 / 0.64, 0.012 / 0.64, 0.475 / 0.64] };
 }
 weak.homeStadium = stadiumRef(weak.data.stadiums[1]);
 const sources = [{ name: 'Strong club', key: 'key-strong', season: strong }, { name: 'Weak club', key: 'key-weak', season: weak }];
 const [a, b] = order === 'ab' ? sources : [sources[1], sources[0]];
 return { teams: [{ id: 'team-a', ...a }, { id: 'team-b', ...b }] };
}

let result: SeriesResult;
let swapped: SeriesResult;
const progress: string[] = [];
beforeAll(() => {
 result = simulateSeries(input('ab'), value => progress.push(value.stage === 'series' ? `series:${value.completed}` : `${value.teamId}:${value.completed}`));
 swapped = simulateSeries(input('ba'));
});

describe('best-of-five series', () => {
 it('seeds by recomputed record and hosts games 1, 2 and 5 at the higher seed', () => {
  const [a, b] = result.teams;
  expect(a.record.wins + a.record.losses).toBe(162);
  expect(a.record.wins).toBeGreaterThan(b.record.wins);
  expect(a.seed).toBe(1);
  for (const game of result.games) {
   const expectedHome: SeriesTeamId = SERIES_HOME_SEEDS[game.number - 1] === 1 ? 'team-a' : 'team-b';
   expect(game.homeTeamId).toBe(expectedHome);
   expect(game.stadium).toEqual(result.teams.find(team => team.id === expectedHome)!.homeStadium);
   expect(game.result.home.id).toBe(expectedHome);
  }
 });
 it('stops the moment a team wins three, with a consistent running score', () => {
  expect(result.games.length).toBeGreaterThanOrEqual(3);
  expect(result.games.length).toBeLessThanOrEqual(5);
  let wins: Record<SeriesTeamId, number> = { 'team-a': 0, 'team-b': 0 };
  result.games.forEach((game, index) => {
   wins = { ...wins, [game.winnerId]: wins[game.winnerId] + 1 };
   expect(game.score).toEqual(wins);
   expect(game.result.home.runs).not.toBe(game.result.away.runs);
   if (index < result.games.length - 1) expect(Math.max(wins['team-a'], wins['team-b'])).toBeLessThan(3);
  });
  expect(result.score[result.championId]).toBe(3);
  expect(result.games.map(game => game.day)).toEqual([1, 2, 4, 5, 7].slice(0, result.games.length));
 });
 it('totals only the played games, separately for each team', () => {
  for (const team of result.teams) {
   const runs = result.games.reduce((sum, game) => sum + (game.result.home.id === team.id ? game.result.home.runs : game.result.away.runs), 0);
   expect(team.totals.batting.reduce((sum, line) => sum + line.R, 0)).toBe(runs);
  }
 });
 it('reports regular-season then series progress', () => {
  expect(progress[0]).toBe('team-a:1');
  expect(progress).toContain('team-b:162');
  expect(progress.at(-1)).toBe(`series:${result.games.length}`);
 });
 it('awards MVPs from either team with explicit ownership and moments with explicit sides', () => {
  expect(result.mvp).not.toBeNull();
  expect(['team-a', 'team-b']).toContain(result.mvp!.teamId);
  expect(result.mvp!.runs).toBeCloseTo(result.mvp!.batting + result.mvp!.running + result.mvp!.defense + result.mvp!.pitching, 12);
  for (const game of result.games) {
   if (!game.highlight) continue;
   expect(game.highlight.battingTeamId).not.toBe(game.highlight.pitchingTeamId);
   expect(game.highlight.swing).toBeGreaterThan(0);
  }
 });
 it('is deterministic and keeps each source team\'s results when the links are swapped', () => {
  expect(simulateSeries(input('ab'))).toEqual(result);
  expect(swapped.seed).toBe(result.seed);
  expect(swapped.games.length).toBe(result.games.length);
  const relabel = (id: SeriesTeamId): SeriesTeamId => id === 'team-a' ? 'team-b' : 'team-a';
  swapped.games.forEach((game, index) => {
   const original = result.games[index];
   expect(relabel(game.winnerId)).toBe(original.winnerId);
   expect(game.result.home.runs).toBe(original.result.home.runs);
   expect(game.result.away.runs).toBe(original.result.away.runs);
  });
 });
});

describe('series rules', () => {
 it('derives one seed from the unordered replay pair', () => {
  expect(seriesSeed('a', 'b')).toBe(seriesSeed('b', 'a'));
  expect(seriesSeed('a', 'b')).not.toBe(seriesSeed('a', 'c'));
 });
 it('breaks equal records by the smaller canonical key, and identical keys by Team A', () => {
  expect(seedOrder([{ id: 'team-a', key: 'z', wins: 90 }, { id: 'team-b', key: 'a', wins: 91 }])).toEqual(['team-b', 'team-a']);
  expect(seedOrder([{ id: 'team-a', key: 'z', wins: 90 }, { id: 'team-b', key: 'a', wins: 90 }])).toEqual(['team-b', 'team-a']);
  expect(seedOrder([{ id: 'team-a', key: 'same', wins: 90 }, { id: 'team-b', key: 'same', wins: 90 }])).toEqual(['team-a', 'team-b']);
 });
 it('picks the losing team\'s player when that player contributed most, using unrounded runs and the key tie rule', () => {
  const winner = createBox(testTeam('winner'));
  const loser = createBox(testTeam('loser'));
  Object.assign(winner.batting[0], { PA: 4, battingRuns: 1.004 });
  Object.assign(loser.batting[0], { PA: 4, battingRuns: 1.006 });
  expect(selectMvp([{ teamId: 'team-a', key: 'k1', box: winner }, { teamId: 'team-b', key: 'k2', box: loser }])).toMatchObject({ teamId: 'team-b', runs: 1.006 });
  loser.batting[0].battingRuns = 1.004;
  expect(selectMvp([{ teamId: 'team-a', key: 'k2', box: winner }, { teamId: 'team-b', key: 'k1', box: loser }])).toMatchObject({ teamId: 'team-b' });
 });
 it('excludes the composite support bullpen and non-participants', () => {
  const box = createBox(testTeam('pen'));
  Object.assign(box.pitching[2], { BF: 10, outs: 9, pitchingRunsAboveNeutral: 9 });
  Object.assign(box.batting[1], { PA: 1, battingRuns: 0.1 });
  box.batting[2].battingRuns = 5;
  expect(selectMvp([{ teamId: 'team-a', key: 'k', box }])).toMatchObject({ seasonId: box.batting[1].seasonId });
 });
 it('keeps overlapping seasons separate in team totals', () => {
  const season = testSeason(5);
  const a = createDraftTeam(season, 'team-a', 'A');
  const b = createDraftTeam(season, 'team-b', 'B');
  const totals = createBox(a);
  expect(() => accumulateBox(totals, createBox(b))).toThrow('different rosters');
 });
});
