import { describe, expect, it } from 'vitest';
import type { GameResult, SeasonMoment } from '../sim/types.ts';
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

function finalGame(overrides: Partial<GameResult> = {}): GameResult {
 return {
  number: 42,
  opponentId: 'TST',
  opponentName: 'Test Rivals',
  isHome: true,
  home: { id: 'challenge', name: 'Your club', runs: 5, innings: [], batting: [], pitching: [] },
  away: { id: 'TST', name: 'Test Rivals', runs: 3, innings: [], batting: [], pitching: [] },
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
  expect(copy.matchup).toBe('Game 42 · vs. Test Rivals');
  expect(copy.situation).toBe('Bottom of the 9th · two outs · bases loaded');
  expect(copy.action).toContain('Example Batter hit a grand slam against Example Pitcher. It was a walk-off.');
  expect(copy.score).toBe('Before the play, your club trailed 1–3; after it, your club led 5–3.');
  expect(copy.winChance).toBe('8.0% → 92.0%');
  expect(copy.swing).toBe('+84.0 pp');
  expect(copy.final).toBe('Final: W, 5–3');
 });

 it('labels a three-run homer without promoting it to a grand slam', () => {
  const copy = formatSeasonMoment(moment({
   half: 'top',
   basesBefore: 3,
   challengeRunsAfter: 4,
   outcome: 'homeRun',
   runsScored: 3
  }));
  expect(copy.situation).toContain('Top of the 9th');
  expect(copy.action).toContain('hit a three-run home run');
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
  expect(copy.matchup).toBe('Game 42 · at Test Rivals');
  expect(copy.situation).toContain('Bottom of the 10th');
  expect(copy.action).toContain('Opponent hitter Example Batter singled, scoring one run against Example Pitcher. It was a walk-off.');
  expect(copy.score).toBe('Before the play, the score was tied 4–4; after it, your club trailed 4–5.');
  expect(copy.winChance).toBe('62.0% → 0.0%');
  expect(copy.swing).toBe('−62.0 pp');
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
  expect(copy.matchup).toContain('vs. Test Rivals');
  expect(copy.situation).toContain('Top of the 9th');
  expect(copy.action).toContain('Opponent hitter Example Batter doubled, scoring two runs');
  expect(copy.action).not.toContain('walk-off');
  expect(copy.swing).toBe('−50.0 pp');
 });
});
