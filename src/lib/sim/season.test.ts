import { describe, expect, it, vi } from 'vitest';

// Full 162-game seasons run here; parallel suites can slow each one well past the default.
vi.setConfig({ testTimeout: 60_000 });
import { MODEL_VERSION, RULES_VERSION, type Draft, type Rates } from '../game/types.ts';
import { buildSchedule, prepareSeasonInput, simulateSeason } from './season.ts';
import { contactRecord } from './contact-profile.ts';
import { testSeason } from './test-fixtures.ts';
import { validateSeason } from './validation.ts';
import type { SeasonInput } from './types.ts';

function draftInput() {
 const input = testSeason();
 const draft: Draft = { schemaVersion: 5, dataVersion: input.data.dataVersion, modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, seed: input.seed, homeStadium: input.homeStadium,
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
  expect(prepared.schemaVersion).toBe(5);
  expect(prepared.homeStadium).toEqual(input.homeStadium);
  expect(prepared.modelVersion).toBe(MODEL_VERSION);
  expect(prepared.battingOrder).toEqual(draft.battingOrder);
  expect(prepared.starterOrder).toEqual(draft.starterOrder);
  expect(prepared.roster).toEqual(input.roster);
 });
 it('rejects unresolved rolls, mismatched versions, missing profiles and mismatched rolls', () => {
  const { input, draft, profiles } = draftInput();
  expect(() => prepareSeasonInput({ ...draft, currentRoll: { franchiseId: 'T', decade: 2020 } }, profiles, input.data)).toThrow('incomplete');
  const incompatibleDraft = { ...draft, modelVersion: 'obsolete' } as unknown as Draft;
  expect(() => prepareSeasonInput(incompatibleDraft, profiles, input.data)).toThrow('incompatible');
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
 it('enforces the current schema, model, roster, era and batting-order contracts', () => {
  const current = testSeason();
  current.roster[0].profile.year = 1950;
  expect(() => validateSeason(current)).not.toThrow();
  current.roster[0].profile.year = 1949;
  expect(() => validateSeason(current)).toThrow('eligibility');

  const incompatibleSchema = { ...testSeason(), schemaVersion: 3 } as unknown as SeasonInput;
  expect(() => validateSeason(incompatibleSchema)).toThrow('incompatible');
  const incompatibleModel = { ...testSeason(), modelVersion: 'pa-v2' } as unknown as SeasonInput;
  expect(() => validateSeason(incompatibleModel)).toThrow('incompatible');

  const bullpenId = current.roster.find(pick => pick.slot === 'BP')!.profile.seasonId;
  current.roster[0].profile.year = 1950;
  current.battingOrder[0] = bullpenId;
  expect(() => validateSeason(current)).toThrow('lineup');

  const missingDefense = testSeason();
  const catcher = missingDefense.roster.find(pick => pick.slot === 'C')!.profile;
  delete catcher.defense.positions.C;
  expect(() => validateSeason(missingDefense)).toThrow('defensive');

  const incompatibleMethods = testSeason();
  incompatibleMethods.data.defenseMethodVersion = 'defense-v0' as never;
  expect(() => validateSeason(incompatibleMethods)).toThrow('compatible simulation data');
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
   expect(box.pitching.reduce((sum, line) => sum + line.BF, 0)).toBe(opposition.batting.reduce((sum, line) => sum + line.PA, 0));
   expect(opposition.pitching.reduce((sum, line) => sum + line.BF, 0)).toBe(box.batting.reduce((sum, line) => sum + line.PA, 0));
   for (const team of [box, opposition]) {
    expect(team.innings.reduce<number>((sum, runs) => sum + (runs ?? 0), 0)).toBe(team.runs);
    expect(team.batting.reduce((sum, line) => sum + line.R, 0)).toBe(team.runs);
    expect(team.battingRuns).toBeCloseTo(team.batting.reduce((sum, line) => sum + line.battingRuns, 0), 10);
    expect(team.stealRuns).toBeCloseTo(team.batting.reduce((sum, line) => sum + line.stealRuns, 0), 10);
    expect(team.defensiveRuns).toBeCloseTo(team.batting.reduce((sum, line) => sum + line.defensiveRuns, 0), 10);
    expect(team.pitchingRunsAboveNeutral).toBeCloseTo(team.pitching.reduce((sum, line) => sum + line.pitchingRunsAboveNeutral, 0), 10);
    for (const skill of ['hitPrevention', 'errorAvoidance', 'doublePlay', 'outfieldThrowing', 'catcherThrowing'] as const) {
     expect(team.defensiveComponents[skill]).toBeCloseTo(team.batting.reduce((sum, line) => sum + line.defensiveComponents[skill], 0), 10);
    }
    for (const line of team.batting) {
     expect(line.PA).toBe(line.AB + line.BB + line.HBP + line.SF);
     expect(line.defensiveRuns).toBeCloseTo(Object.values(line.defensiveComponents).reduce((sum, value) => sum + value, 0), 10);
    }
   }
   const gameLedger = box.battingRuns + box.stealRuns + box.defensiveRuns + box.pitchingRunsAboveNeutral
    + opposition.battingRuns + opposition.stealRuns + opposition.defensiveRuns + opposition.pitchingRunsAboveNeutral;
   expect(gameLedger).toBeCloseTo(0, 9);
  }
  for (const line of season.batting) {
   const gameLines = season.games.map(game => (game.isHome ? game.home : game.away).batting.find(candidate => candidate.seasonId === line.seasonId)!);
   expect(line.fieldingOuts).toBe(gameLines.reduce((sum, candidate) => sum + candidate.fieldingOuts, 0));
   expect(line.caughtAdvancing).toBe(gameLines.reduce((sum, candidate) => sum + candidate.caughtAdvancing, 0));
   expect(line.battingRuns).toBeCloseTo(gameLines.reduce((sum, candidate) => sum + candidate.battingRuns, 0), 10);
   expect(line.stealRuns).toBeCloseTo(gameLines.reduce((sum, candidate) => sum + candidate.stealRuns, 0), 10);
   expect(line.defensiveRuns).toBeCloseTo(gameLines.reduce((sum, candidate) => sum + candidate.defensiveRuns, 0), 10);
  }
  for (const line of season.pitching) {
   const gameLines = season.games.flatMap(game => {
    const candidate = (game.isHome ? game.home : game.away).pitching.find(entry => entry.seasonId === line.seasonId);
    return candidate ? [candidate] : [];
   });
   expect(line.BF).toBe(gameLines.reduce((sum, candidate) => sum + candidate.BF, 0));
   expect(line.pitchingRunsAboveNeutral).toBeCloseTo(gameLines.reduce((sum, candidate) => sum + candidate.pitchingRunsAboveNeutral, 0), 10);
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
  const strongRates: Rates = [0.02, 0, 0.45, 0.1, 0.02, 0, 0.005, 0.405];
  const weakRates: Rates = [0.15, 0.02, 0.1, 0.22, 0.08, 0.01, 0.07, 0.35];
  const strongSupport = strongInput.roster.find(pick => pick.slot === 'BP')!.profile;
  const weakSupport = weakInput.roster.find(pick => pick.slot === 'BP')!.profile;
  strongSupport.displayName = 'Strong drafted bullpen';
  strongSupport.pitchingRates = strongRates;
  strongSupport.contact = contactRecord(strongSupport);
  weakSupport.displayName = 'Weak drafted bullpen';
  weakSupport.pitchingRates = weakRates;
  weakSupport.contact = contactRecord(weakSupport);
  strongInput.roster.find(pick => pick.slot === 'CL')!.profile.pitching!.IPouts = 0;
  weakInput.roster.find(pick => pick.slot === 'CL')!.profile.pitching!.IPouts = 0;

  const strong = simulateSeason(strongInput);
  const weak = simulateSeason(weakInput);
  expect(strong.modelVersion).toBe(MODEL_VERSION);
  expect(strong).toMatchObject({ defenseMethodVersion: 'defense-v2', valuationVersion: 'sim-war-v2' });
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
});
