import { describe, expect, it } from 'vitest';
import type { GameResult, SeasonMoment, TeamBox } from '../sim/types.ts';
import { createDefensiveRunComponents } from '../sim/value.ts';
import { formatSeasonMoment, momentParticipant } from './season-moment.ts';
import { radioCall } from './season-call.ts';

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
  stadium: { id: 'TST-2025', version: 'synthetic' },
  stadiumName: 'Test Park',
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
 it('names both head-to-head teams instead of "your club" and "Opponent hitter"', () => {
  const labels = { challenge: 'Aces', opponent: 'Bombers' };
  const copy = formatSeasonMoment(moment({ challengeBatting: false, isHome: false, challengeRunsAfter: 1, opponentRunsAfter: 7 }), finalGame({ challengeRuns: 1, opponentRuns: 7, win: false }), labels);
  expect(copy.matchup).toBe('Game 42 · Aces at Bombers');
  expect(copy.action).toMatch(/^Bombers hitter Example Batter /);
  expect(copy.score).toBe('Before the play, Aces trailed 1–3; after it, Aces trailed 1–7.');
  expect(copy.final).toBe('Final: Aces 1–7 Bombers');
  expect(JSON.stringify(copy)).not.toMatch(/your club|Opponent hitter/);
 });
});

describe('radio calls', () => {
 it('calls each play from its own facts and ends a walk-off on the game', () => {
  const slam = formatSeasonMoment(moment());
  expect(slam.call).toMatch(/Batter/);
  expect(slam.call).toMatch(/grand slam!/);
  expect(slam.call).toMatch(/wins it|ballgame|walk-off|winning run|one is over/);
  const strikeout = formatSeasonMoment(moment({ outcome: 'strikeout', runsScored: 0, challengeRunsAfter: 1, inning: 5, half: 'top' }));
  expect(strikeout.call).toMatch(/Pitcher/);
  expect(strikeout.call).not.toMatch(/OVER/);
  const walk = formatSeasonMoment(moment({ outcome: 'walk', runsScored: 1, inning: 4, half: 'top', challengeRunsAfter: 2 }));
  expect(walk.call).toMatch(/run/);
 });

 it('draws the same call for the same moment and covers every outcome', () => {
  expect(formatSeasonMoment(moment()).call).toBe(formatSeasonMoment(moment()).call);
  const outcomes = ['walk', 'hitByPitch', 'strikeout', 'single', 'double', 'triple', 'homeRun', 'groundedIntoDoublePlay', 'sacrificeFly', 'out', 'reachedOnError', 'stolenBase', 'caughtStealing'] as const;
  for (const outcome of outcomes) expect(formatSeasonMoment(moment({ outcome, inning: 3, half: 'top' })).call.length).toBeGreaterThan(10);
 });

 it('retains the Castellanos interruption as an intentional Easter egg', () => {
  const call = formatSeasonMoment(moment({ batterName: 'Nick Castellanos', inning: 6, half: 'top' })).call;
  expect(call).toContain('take a moment');
  expect(call).toContain('deep left field by Castellanos');
  expect(formatSeasonMoment(moment({ batterName: 'Nick Castellanos', outcome: 'double' })).call).not.toContain('take a moment');
 });

 it('follows contact, the fielder, a tag-up and the actual score', () => {
  const play = { outsAfter: 1, contact: { exitVelocityMph: 91, launchAngleDeg: 33, sprayAngleDeg: 22, fair: true, fielding: 'air' as const, automaticDouble: false, fielderName: 'Test Fielder', fielderSeasonId: 'fielder-2000', fielderPosition: 'RF' }, runners: [{ name: 'Test Runner', seasonId: 'runner-2000', from: 3, to: 4 }] };
  const call = formatSeasonMoment(moment({ outcome: 'sacrificeFly', inning: 7, outsBefore: 0, basesBefore: 4, challengeRunsBefore: 2, challengeRunsAfter: 3, runsScored: 1, play })).call;
  expect(call).toContain('to right');
  expect(call).toContain('Test Fielder makes the catch');
  expect(call).toContain('Test Runner tags and scores');
  expect(call).toMatch(/tied at 3|ties it, 3–3|3–3 game|even at 3/);
 });

 it('keeps a runner thrown out in the story and does not award a phantom run', () => {
  const call = formatSeasonMoment(moment({ outcome: 'single', inning: 7, challengeRunsAfter: 1, runsScored: 0, play: { outsAfter: 3, contact: { exitVelocityMph: 99, launchAngleDeg: 8, sprayAngleDeg: -20, fair: true, fielding: 'hit' as const, automaticDouble: false, fielderName: 'Test Fielder', fielderSeasonId: 'fielder-2000', fielderPosition: 'LF' }, runners: [{ name: 'Test Runner', seasonId: 'runner-2000', from: 2, to: 0 }] } })).call;
  expect(call).toContain('left side');
  expect(call).toContain('Test Runner is out on the play');
  expect(call).toMatch(/inning|retires the side/);
  expect(call).not.toMatch(/scores|comes home|wins it/);
 });

 it('varies the wording by run seed while preserving names and measured direction', () => {
  const m = moment({ batterName: 'Vladimir Guerrero Jr.', play: { outsAfter: 2, contact: { exitVelocityMph: 105, launchAngleDeg: 29, sprayAngleDeg: 35, fair: true, fielding: 'hit' as const, automaticDouble: false, fielderName: null, fielderSeasonId: null, fielderPosition: null }, runners: [] } });
  const calls = Array.from({ length: 20 }, (_, seed) => formatSeasonMoment(m, undefined, undefined, seed).call);
  expect(new Set(calls).size).toBeGreaterThan(10);
  for (const call of calls) {
   expect(call).toContain('Vladimir Guerrero Jr.');
   expect(call).toContain('right-field line');
   expect(call).not.toContain('left');
  }
  expect(formatSeasonMoment(m, undefined, undefined, 7).call).toBe(calls[7]);
 });
});

describe('turning-point attribution', () => {
 it('names and shows the fielder on an error instead of blaming the pitcher', () => {
  const m = moment({ outcome: 'reachedOnError', challengeBatting: false, half: 'top', runsScored: 1, play: { outsAfter: 2, contact: { exitVelocityMph: 84, launchAngleDeg: 5, sprayAngleDeg: -18, fair: true, fielding: 'ground', automaticDouble: false, fielderName: 'Test Fielder', fielderSeasonId: 'fielder-2000', fielderPosition: 'SS' }, runners: [] } });
  expect(momentParticipant(m)).toBe('fielder-2000');
  expect(formatSeasonMoment(m).action).toContain('error by Test Fielder');
  expect(formatSeasonMoment(m).call).toContain('error by Test Fielder');
  expect(momentParticipant({ ...m, play: undefined })).toBeNull();
 });
 it('shows the runner thrown out, while keeping strikeouts attributed to the pitcher', () => {
  expect(momentParticipant(moment({ outcome: 'single', play: { outsAfter: 3, contact: null, runners: [{ name: 'Test Runner', seasonId: 'runner-2000', from: 2, to: 0 }] } }))).toBe('runner-2000');
  expect(momentParticipant(moment({ outcome: 'strikeout', challengeBatting: false }))).toBe('pitcher-2000');
  // An opponent's steal belongs to their runner, not to the pitcher who allowed it.
  expect(momentParticipant(moment({ outcome: 'stolenBase', challengeBatting: false }))).toBe('batter-2000');
 });
 it('reads scores that start with a vowel sound with "an" in every call variant', () => {
  // Tied at 8 and ahead 8–3 or 11–3: each seed can pick a different phrasing, so sweep enough to hit them all.
  const scores = [{ before: 7, after: 8, against: 8 }, { before: 3, after: 8, against: 3 }, { before: 3, after: 11, against: 3 }];
  const calls = scores.flatMap(({ before, after, against }) => Array.from({ length: 200 }, (_, seed) => radioCall(moment({
   outcome: 'single', challengeBatting: true, runsScored: after - before, challengeRunsBefore: before, challengeRunsAfter: after,
   opponentRunsBefore: against, opponentRunsAfter: against
  }), false, seed)));
  expect(calls.some(call => /\ban 8–8 game\b/.test(call))).toBe(true);
  expect(calls.some(call => /\bAn 8–3 lead\b/.test(call))).toBe(true);
  expect(calls.some(call => /\bAn 11–3 lead\b/.test(call))).toBe(true);
  expect(calls.filter(call => /\b[Aa] (8|11|18)\b/.test(call))).toEqual([]);
 });
});
