import { describe, expect, it } from 'vitest';
import { MODEL_VERSION, type Draft, type Rates } from '../game/types.ts';
import { buildSchedule, prepareSeasonInput, simulateSeason } from './season.ts';
import { testLegacySeason, testSeason } from './test-fixtures.ts';
import { validateSeason } from './validation.ts';

function draftInput() {
 const input = testSeason();
 const draft: Draft = { schemaVersion: 3, dataVersion: input.data.dataVersion, modelVersion: MODEL_VERSION, seed: input.seed,
  picks: input.roster.map(({ profile, slot }) => ({ seasonId: profile.seasonId, slot, franchiseId: profile.franchiseId, decade: 2020 })),
  battingOrder: [...input.battingOrder], starterOrder: [...input.starterOrder], actions: [], currentRoll: null };
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
  expect(prepared.schemaVersion).toBe(3);
  expect(prepared.modelVersion).toBe(MODEL_VERSION);
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
 it('applies each replay schema policy to model, roster, era and batting order', () => {
  for (const schemaVersion of [1, 2] as const) {
   const input = testLegacySeason(162, schemaVersion);
   const draft: Draft = {
    schemaVersion, dataVersion: input.data.dataVersion, modelVersion: 'pa-v1', seed: input.seed,
    picks: input.roster.map(({ profile, slot }) => ({ seasonId: profile.seasonId, slot, franchiseId: profile.franchiseId, decade: 2020 })),
    battingOrder: [...input.battingOrder], starterOrder: [...input.starterOrder], currentRoll: null
   };
   const prepared = prepareSeasonInput(draft, input.roster.map(pick => pick.profile), input.data);
   expect(prepared.schemaVersion).toBe(schemaVersion);
   expect(prepared.modelVersion).toBe('pa-v1');
   expect(prepared.roster).toHaveLength(13);
  }

  const repeatedFranchise = testLegacySeason(162, 1);
  repeatedFranchise.roster[1].profile.franchiseId = repeatedFranchise.roster[0].profile.franchiseId;
  expect(() => validateSeason(repeatedFranchise)).not.toThrow();
  const uniqueFranchises = testLegacySeason(162, 2);
  uniqueFranchises.roster[1].profile.franchiseId = uniqueFranchises.roster[0].profile.franchiseId;
  expect(() => validateSeason(uniqueFranchises)).toThrow('distinct franchises');

  const current = testSeason();
  current.roster[0].profile.year = 1950;
  expect(() => validateSeason(current)).not.toThrow();
  current.roster[0].profile.year = 1949;
  expect(() => validateSeason(current)).toThrow('eligibility');

  const legacy = testLegacySeason();
  legacy.roster[0].profile.year = 1960;
  expect(() => validateSeason(legacy)).toThrow('eligibility');

  const bullpenId = current.roster.find(pick => pick.slot === 'BP')!.profile.seasonId;
  current.roster[0].profile.year = 1950;
  current.battingOrder[0] = bullpenId;
  expect(() => validateSeason(current)).toThrow('lineup');
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
  const expectedHighlight = season.games.reduce((best, game) =>
   game.highlight && (!best || game.highlight.swing > best.swing) ? game.highlight : best, null as typeof season.highlight);
  const expectedLowlight = season.games.reduce((best, game) =>
   game.lowlight && (!best || game.lowlight.swing < best.swing) ? game.lowlight : best, null as typeof season.lowlight);
  expect(season.highlight).toEqual(expectedHighlight);
  expect(season.lowlight).toEqual(expectedLowlight);
  expect(season.highlight!.swing).toBeGreaterThan(0);
  expect(season.lowlight!.swing).toBeLessThan(0);
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
  expect(season.pitching[4].displayName).toBe('Synthetic Club bullpen remainder');
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
 it('uses the drafted bullpen rates and identity for current seasons', () => {
  const strongInput = testSeason(914);
  const weakInput = testSeason(914);
  const strongRates: Rates = [0, 0, 1, 0, 0, 0, 0, 0];
  const weakRates: Rates = [0, 0, 0.4, 0, 0, 0, 0.5, 0.1];
  const strongSupport = strongInput.roster.find(pick => pick.slot === 'BP')!.profile;
  const weakSupport = weakInput.roster.find(pick => pick.slot === 'BP')!.profile;
  strongSupport.displayName = 'Strong drafted bullpen';
  strongSupport.pitchingRates = strongRates;
  weakSupport.displayName = 'Weak drafted bullpen';
  weakSupport.pitchingRates = weakRates;
  strongInput.roster.find(pick => pick.slot === 'CL')!.profile.pitching!.IPouts = 0;
  weakInput.roster.find(pick => pick.slot === 'CL')!.profile.pitching!.IPouts = 0;

  const strong = simulateSeason(strongInput);
  const weak = simulateSeason(weakInput);
  expect(strong.modelVersion).toBe(MODEL_VERSION);
  expect(strong.pitching[4]).toMatchObject({
   seasonId: strongSupport.seasonId,
   playerId: strongSupport.playerId,
   displayName: 'Strong drafted bullpen',
   role: 'support'
  });
  expect(weak.pitching[4]).toMatchObject({
   seasonId: weakSupport.seasonId,
   playerId: weakSupport.playerId,
   displayName: 'Weak drafted bullpen',
   role: 'support'
  });
  expect(strong.pitching[4].outs).toBeGreaterThan(0);
  expect(weak.pitching[4].outs).toBeGreaterThan(0);
  expect(weak.pitching[4].R).toBeGreaterThan(strong.pitching[4].R);
  expect(weak.runsAgainst).toBeGreaterThan(strong.runsAgainst);
 });
 it('keeps legacy support on the shared simulation-data bullpen and pa-v1 model', () => {
  const input = testLegacySeason(317, 2);
  input.data.bullpen.displayName = 'Legacy league relief pool';
  const result = simulateSeason(input);
  expect(result.modelVersion).toBe('pa-v1');
  expect(result.pitching[4]).toMatchObject({
   seasonId: input.data.bullpen.seasonId,
   playerId: input.data.bullpen.playerId,
   displayName: 'Legacy league relief pool',
   role: 'support'
  });
  expect(result.pitching[4].outs).toBeGreaterThan(0);
 });
});
