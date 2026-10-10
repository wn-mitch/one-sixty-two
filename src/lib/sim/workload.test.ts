import { describe, expect, it } from 'vitest';
import { createBox, simulateGame } from './game.ts';
import { beginHalf, closerBudget, closerReady, createWorkload, recordCloser, starterBudget } from './workload.ts';
import { PA, eventStreams, testGame, testTeam } from './test-fixtures.ts';

const E = { SO: PA.SO, HR: 'HR' as const };

describe('pitching workload', () => {
 it('rounds and bounds starter outs per start', () => {
  const pitcher = testTeam('workload').pitchers[0];
  pitcher.pitching!.IPouts = 100;
  expect(starterBudget(pitcher)).toBe(12);
  pitcher.pitching!.IPouts = 556;
  expect(starterBudget(pitcher)).toBe(19);
  pitcher.pitching!.IPouts = 900;
  expect(starterBudget(pitcher)).toBe(24);
 });
 it('replaces a six-run starter at the next inning boundary', () => {
  const game = simulateGame(testGame(), eventStreams([...Array<number | 'HR'>(6).fill(E.HR)]));
  expect(game.home.pitching[0]).toMatchObject({ R: 6, outs: 3, starts: 1 });
  expect(game.home.pitching[2]).toMatchObject({ outs: 24, appearances: 1, starts: 0 });
 });
 it('uses the closer for exactly one half inning then returns to support', () => {
  const game = simulateGame(testGame(), eventStreams([...Array<number | 'HR'>(48).fill(E.SO), E.HR, E.SO, E.SO, E.SO,
   E.HR, E.SO, E.SO, E.SO, E.SO, E.SO, E.SO, E.HR]));
  expect(game.home.pitching[1]).toMatchObject({ outs: 3, R: 1, appearances: 1, starts: 0 });
  expect(game.away.pitching[1]).toMatchObject({ outs: 3, R: 1, appearances: 1, starts: 0 });
  expect(game.home.pitching[2].outs).toBe(9);
  expect(game.home.innings).toHaveLength(10);
 });
 it('uses support when fewer than three closer outs remain', () => {
  const input = testGame();
  input.home.closerOutsRemaining = 2;
  const game = simulateGame(input, eventStreams([...Array<number | 'HR'>(48).fill(E.SO), E.HR]));
  expect(game.home.pitching[1]).toMatchObject({ outs: 0, appearances: 0 });
  expect(game.home.pitching[2].outs).toBe(9);
 });
 it('uses support when the closer is resting', () => {
  const input = testGame();
  input.home.closerAvailable = false;
  const game = simulateGame(input, eventStreams([...Array<number | 'HR'>(48).fill(E.SO), E.HR]));
  expect(game.home.pitching[1].appearances).toBe(0);
 });
 it('does not insert a closer mid-inning or in an ineligible score', () => {
  const team = testTeam('workload');
  const box = createBox(team);
  const workload = createWorkload(team);
  box.pitching[0].outs = workload.budget;
  beginHalf(team, box.pitching, workload, 8, 0);
  expect(workload.current).toBe(team.bullpenIndex);
  beginHalf(team, box.pitching, workload, 9, -1);
  expect(workload.current).toBe(team.bullpenIndex);
  beginHalf(team, box.pitching, workload, 9, 4);
  expect(workload.current).toBe(team.bullpenIndex);
  beginHalf(team, box.pitching, workload, 10, 3);
  expect(workload.current).toBe(team.closerIndex);
  beginHalf(team, box.pitching, workload, 11, 0);
  expect(workload.current).toBe(team.bullpenIndex);
 });
 it('counts zero-out appearances and rests only after both previous challenge games', () => {
  const usage = { outs: 0, last: -1, previous: -1 };
  recordCloser(usage, 4, 0, true);
  recordCloser(usage, 5, 0, true);
  expect(closerReady(usage, 6, 30)).toBe(false);
  expect(closerReady(usage, 7, 30)).toBe(true);
  const opponent = { outs: 0, last: -1, previous: -1 };
  recordCloser(opponent, 4, 3, true);
  recordCloser(opponent, 12, 3, true);
  expect(closerReady(opponent, 13, 30)).toBe(true);
 });
 it('scales and floors the closer cap to 162 games', () => {
  const profile = testTeam('workload').pitchers[1];
  profile.pitching!.IPouts = 61;
  profile.teamGames = 154;
  expect(closerBudget(profile)).toBe(64);
  expect(closerReady({ outs: 62, last: -1, previous: -1 }, 10, 64)).toBe(false);
 });
});
