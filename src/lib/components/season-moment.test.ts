import { describe, expect, it } from 'vitest';
import type { GameResult, SeasonMoment, TeamBox } from '../sim/types.ts';
import { createDefensiveRunComponents } from '../sim/value.ts';
import { formatSeasonMoment } from './season-moment.ts';

const baseMoment: SeasonMoment = {
 gameNumber: 42,
 opponentName: 'Test Rivals',
 isHome: true,
 inning: 9,
 half: 'bottom',
 outsBefore: 2,
 basesBefore: 7,
 challengeRunsBefore: 1,
 opponentRunsBefore: 3,
 challengeRunsAfter: 5,
 opponentRunsAfter: 3,
 batterName: 'Example Batter',
 batterSeasonId: 'batter-2000',
 pitcherName: 'Example Pitcher',
 pitcherSeasonId: 'pitcher-2000',
 challengeBatting: true,
 outcome: 'homeRun',
 runsScored: 4,
 winBefore: 0.08,
 winAfter: 0.92,
 swing: 0.84
};

function moment(overrides: Partial<SeasonMoment> = {}): SeasonMoment {
 return { ...baseMoment, ...overrides };
}

function neutralTeamBox(id: string, name: string, runs: number): TeamBox {
 return {
  id,
  name,
  runs,
  innings: [],
  batting: [],
  pitching: [],
  battingRuns: 0,
  stealRuns: 0,
  defensiveRuns: 0,
  defensiveComponents: createDefensiveRunComponents(),
  pitchingRunsAboveNeutral: 0
 };
}

function finalGame(overrides: Partial<GameResult> = {}): GameResult {
 return {
  number: 42,
  opponentId: 'TST',
  opponentName: 'Test Rivals',
  isHome: true,
  home: neutralTeamBox('challenge', 'Your club', 5),
  away: neutralTeamBox('TST', 'Test Rivals', 3),
  challengeRuns: 5,
  opponentRuns: 3,
  win: true,
  highlight: null,
  lowlight: null,
  ...overrides
 };
}

describe('season moment copy', () => {
 it('calls only a four-run home run a grand slam and reports a home walk-off', () => {
  const copy = formatSeasonMoment(moment(), finalGame());
  expect(copy.action).toContain('grand slam');
  expect(copy.action).toContain('walk-off');
 });

 it('labels a three-run homer without promoting it to a grand slam', () => {
  const copy = formatSeasonMoment(moment({
   half: 'top',
   basesBefore: 3,
   challengeRunsAfter: 4,
   outcome: 'homeRun',
   runsScored: 3
  }));
  expect(copy.action).toContain('three-run home run');
  expect(copy.action).not.toContain('grand slam');
  expect(copy.action).not.toContain('walk-off');
 });

 it('identifies an opponent-owned non-home-run road walk-off', () => {
  const copy = formatSeasonMoment(moment({
   isHome: false,
   inning: 10,
   challengeBatting: false,
   outcome: 'single',
   basesBefore: 2,
   runsScored: 1,
   challengeRunsBefore: 4,
   opponentRunsBefore: 4,
   challengeRunsAfter: 4,
   opponentRunsAfter: 5,
   winBefore: 0.62,
   winAfter: 0,
   swing: -0.62
  }));
  expect(copy.action).toContain('Opponent hitter Example Batter');
  expect(copy.action).toContain('walk-off');
 });

 it('never calls a visiting opponent play a walk-off', () => {
  const copy = formatSeasonMoment(moment({
   isHome: true,
   half: 'top',
   challengeBatting: false,
   outcome: 'double',
   runsScored: 2,
   challengeRunsBefore: 3,
   opponentRunsBefore: 2,
   challengeRunsAfter: 3,
   opponentRunsAfter: 4,
   winBefore: 0.75,
   winAfter: 0.25,
   swing: -0.5
  }));
  expect(copy.action).toContain('Opponent hitter Example Batter');
  expect(copy.action).toContain('doubled');
  expect(copy.action).not.toContain('walk-off');
 });
});
