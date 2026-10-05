import { describe, expect, it } from 'vitest';
import { MODEL_VERSION, type Draft } from '../game/types.ts';
import { buildSchedule, prepareSeasonInput, simulateSeason } from './season.ts';
import { testSeason } from './test-fixtures.ts';

function draftInput() {
 const input = testSeason();
 const draft: Draft = { schemaVersion: 1, dataVersion: input.data.dataVersion, modelVersion: MODEL_VERSION, seed: input.seed,
  picks: input.roster.map(({ profile, slot }) => ({ seasonId: profile.seasonId, slot, franchiseId: profile.franchiseId, decade: 2020 })),
  battingOrder: [...input.battingOrder], starterOrder: [...input.starterOrder], currentRoll: null };
 return { input, draft, profiles: input.roster.map(pick => pick.profile) };
}

describe('challenge schedule', () => {
 it('plays five per opponent plus twelve distinct sixth games, with 81 at each venue', () => {
  const ids = testSeason().data.opponents.map(team => team.id);
  const schedule = buildSchedule(162, ids);
  expect(schedule).toHaveLength(162);
  expect(schedule.filter(game => game.isHome)).toHaveLength(81);
  const counts = ids.map(id => schedule.filter(game => game.opponentId === id).length);
  expect(counts.filter(count => count === 6)).toHaveLength(12);
  expect(counts.filter(count => count === 5)).toHaveLength(18);
  expect(schedule.every((game, index) => game.isHome === (index % 2 === 0))).toBe(true);
  expect(buildSchedule(162, [...ids].reverse())).toEqual(schedule);
  expect(buildSchedule(163, ids)).not.toEqual(schedule);
 });
 it('rejects incomplete or duplicate opposition', () => {
  expect(() => buildSchedule(162, Array<string>(30).fill('same'))).toThrow('thirty distinct');
 });
});

describe('season inputs', () => {
 it('prepares the exact drafted lineup without rearranging positions', () => {
  const { input, draft, profiles } = draftInput();
  draft.battingOrder.reverse();
  draft.starterOrder.reverse();
  const prepared = prepareSeasonInput(draft, profiles, input.data);
  expect(prepared.battingOrder).toEqual(draft.battingOrder);
  expect(prepared.starterOrder).toEqual(draft.starterOrder);
  expect(prepared.roster).toEqual(input.roster);
 });
 it('rejects unresolved rolls, mismatched versions, missing profiles and mismatched rolls', () => {
  const { input, draft, profiles } = draftInput();
  expect(() => prepareSeasonInput({ ...draft, currentRoll: { franchiseId: 'T', decade: 2020 } }, profiles, input.data)).toThrow('incomplete');
  expect(() => prepareSeasonInput({ ...draft, modelVersion: 'obsolete' }, profiles, input.data)).toThrow('incompatible');
  expect(() => prepareSeasonInput(draft, profiles.slice(1), input.data)).toThrow('Missing');
  draft.picks[0].franchiseId = 'other';
  expect(() => prepareSeasonInput(draft, profiles, input.data)).toThrow('mismatched');
 });
 it('rejects repeated players, illegal slots and malformed orders', () => {
  const { input, draft, profiles } = draftInput();
  profiles[1].playerId = profiles[0].playerId;
  expect(() => prepareSeasonInput(draft, profiles, input.data)).toThrow('distinct');
  profiles[1].playerId = 'different';
  profiles[1].eligibleSlots = ['DH'];
  expect(() => prepareSeasonInput(draft, profiles, input.data)).toThrow('eligibility');
  profiles[1].eligibleSlots = ['1B'];
  draft.battingOrder[0] = draft.battingOrder[1];
  expect(() => prepareSeasonInput(draft, profiles, input.data)).toThrow('lineup');
 });
});

describe('full seasons', () => {
 it('replays identical concrete boxes, aggregates all 162 games and preserves rotation/rest accounting', () => {
  const input = testSeason();
  const progress: number[] = [];
  const season = simulateSeason(input, game => progress.push(game.number));
  expect(simulateSeason(input)).toEqual(season);
  expect(progress).toEqual(Array.from({ length: 162 }, (_, index) => index + 1));
  expect(season.wins + season.losses).toBe(162);
  expect(season.games.every(game => game.home.runs !== game.away.runs)).toBe(true);
  expect(season.starterStarts).toEqual([54, 54, 54]);
  expect(season.pitching.slice(0, 3).map(line => line.starts)).toEqual([54, 54, 54]);
  expect(season.runsFor).toBe(season.games.reduce((sum, game) => sum + game.challengeRuns, 0));
  expect(season.runsAgainst).toBe(season.games.reduce((sum, game) => sum + game.opponentRuns, 0));
  expect(season.batting.reduce((sum, line) => sum + line.R, 0)).toBe(season.runsFor);
  expect(season.pitching.reduce((sum, line) => sum + line.R, 0)).toBe(season.runsAgainst);
  expect(season.firstLoss).toBe(season.games.find(game => !game.win)?.number ?? null);
  let streak = 0;
  let longest = 0;
  const rotations = new Map<string, number>();
  const closerAppearances: number[] = [];
  for (const game of season.games) {
   streak = game.win ? streak + 1 : 0;
   longest = Math.max(longest, streak);
   const box = game.isHome ? game.home : game.away;
   const opposition = game.isHome ? game.away : game.home;
   const prior = rotations.get(game.opponentId) ?? 0;
   expect(opposition.pitching.findIndex(line => line.starts === 1)).toBe(prior % 5);
   rotations.set(game.opponentId, prior + 1);
   expect(box.pitching[3].outs).toBeLessThanOrEqual(3);
   expect(opposition.pitching[5].outs).toBeLessThanOrEqual(3);
   if (box.pitching[3].appearances) closerAppearances.push(game.number);
   for (const team of [box, opposition]) {
    expect(team.innings.reduce<number>((sum, runs) => sum + (runs ?? 0), 0)).toBe(team.runs);
    expect(team.batting.reduce((sum, line) => sum + line.R, 0)).toBe(team.runs);
    for (const line of team.batting) expect(line.PA).toBe(line.AB + line.BB + line.HBP + line.SF);
   }
  }
  expect(season.longestWinningStreak).toBe(longest);
  for (const game of closerAppearances) expect(closerAppearances.includes(game - 1) && closerAppearances.includes(game - 2)).toBe(false);
  expect(season.pitching[4].displayName).toBe('Support bullpen');
 });
 it('respects the closer seasonal cap while support finishes every game', () => {
  const input = testSeason();
  input.roster[12].profile.pitching!.IPouts = 3;
  for (const opponent of input.data.opponents) opponent.closer.pitching!.IPouts = 3;
  const season = simulateSeason(input);
  expect(season.pitching[3].outs).toBeLessThanOrEqual(3);
  expect(season.pitching[4].outs).toBeGreaterThan(0);
  for (const opponent of input.data.opponents) {
   const outs = season.games.filter(game => game.opponentId === opponent.id).reduce((sum, game) => sum + (game.isHome ? game.away : game.home).pitching[5].outs, 0);
   expect(outs).toBeLessThanOrEqual(3);
  }
 });
});
