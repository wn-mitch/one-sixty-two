import { describe, expect, it } from 'vitest';
import { simulateGame } from './game.ts';
import { playHalf, type InningEvent } from './inning.ts';
import { neutralDefensivePosition } from './defense.ts';
import { OUTCOME_CAUGHT, OUTCOME_GROUND_OUT, OUTCOME_HIT, OUTCOME_HOME_RUN } from './fielding.ts';
import {
 PA,
 contactStreams,
 findContact,
 scriptedStreams,
 testDefenseEnvironment,
 testGame,
 testHalf,
 testTeam,
 type ContactScript
} from './test-fixtures.ts';

const half = testHalf;

// Every synthetic batter and pitcher shares one rate vector and speed, so one search serves every pair.
const probe = half();
const find = (want: Parameters<typeof findContact>[3], fielding?: Parameters<typeof findContact>[4]) => findContact(probe.context, 0, 0, want, fielding);
const SINGLE = find((kind, _fielder, bases) => kind === OUTCOME_HIT && bases === 1);
const DOUBLE = find((kind, _fielder, bases) => kind === OUTCOME_HIT && bases === 2);
const TRIPLE = find((kind, _fielder, bases) => kind === OUTCOME_HIT && bases === 3);
const HOME_RUN = find(kind => kind === OUTCOME_HOME_RUN);
const SHORTSTOP_GROUNDER = find((kind, fielder) => kind === OUTCOME_GROUND_OUT && fielder === 4);
const SHORTSTOP_ERROR = find((kind, fielder) => kind === OUTCOME_GROUND_OUT && fielder === 4, { error: 0 });
const SHORTSTOP_DOUBLE_PLAY = find((kind, fielder) => kind === OUTCOME_GROUND_OUT && fielder === 4, { doublePlay: 0 });
// Between the neutral (.145) and full-skill (.205) double-play probability for a .08 tendency.
const SKILL_DOUBLE_PLAY = find((kind, fielder) => kind === OUTCOME_GROUND_OUT && fielder === 4, { doublePlay: 0.17 });
const DEEP_FLY = find((kind, fielder, _bases, draw) => kind === OUTCOME_CAUGHT && fielder === 6 && draw.speedMph > 95 && draw.launchDeg > 30);
const NO_ADVANCE = Array<number>(6).fill(0.99);

function runHalf(game: ReturnType<typeof half>, pa: number[], scripts: ContactScript[], extra = {}, target = Infinity, events?: InningEvent[]) {
 playHalf(game.context, target, contactStreams(pa, scripts, extra), events ? event => events.push(event) : undefined);
}

describe('batted-ball fixtures', () => {
 it('reach every requested legal result through real flight and fielding', () => {
  expect(HOME_RUN.draw.speedMph).toBeGreaterThan(90);
  expect(DEEP_FLY.fielder).toBe(6);
  expect([SINGLE.bases, DOUBLE.bases, TRIPLE.bases]).toEqual([1, 2, 3]);
 });
});

describe('plate appearance scoring', () => {
 it('credits every assigned defender with workload on strikeouts', () => {
  const game = half();
  runHalf(game, [PA.SO, PA.SO, PA.SO], []);
  expect(game.pitching.batting.map(line => line.fieldingOuts)).toEqual([...Array(8).fill(3), 0]);
 });
 it('forces a bases-loaded walk, without an AB or hit', () => {
  const game = half();
  runHalf(game, [PA.BB, PA.BB, PA.BB, PA.BB], []);
  expect(game.batting.runs).toBe(1);
  expect(game.batting.batting[3]).toMatchObject({ PA: 1, AB: 0, BB: 1, H: 0, RBI: 1 });
  expect(game.pitching.pitching[0]).toMatchObject({ BB: 4, R: 1, outs: 3 });
 });
 it('scores a forced HBP with no AB and credits its RBI', () => {
  const game = half();
  runHalf(game, [PA.BB, PA.BB, PA.BB, PA.HBP], []);
  expect(game.batting.batting[3]).toMatchObject({ HBP: 1, AB: 0, RBI: 1 });
  expect(game.pitching.pitching[0].HBP).toBe(1);
 });
 it('scores every runner on a home run and credits the batter with all RBI', () => {
  const game = half();
  runHalf(game, [PA.BB, PA.BB, PA.BB, PA.contact], [HOME_RUN]);
  expect(game.batting.runs).toBe(4);
  expect(game.batting.batting[3]).toMatchObject({ H: 1, HR: 1, RBI: 4, R: 1 });
 });
 it('charges inherited runners to the replaced starter', () => {
  const game = half();
  game.workload.budget = 12;
  game.pitching.pitching[0].outs = 11;
  // Two steal checks with a runner on first, then [3rd, 3rd out, 2nd, 2nd out, 1st, 1st out].
  runHalf(game, [PA.BB, PA.SO, PA.contact], [DOUBLE], { advancement: [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.99] });
  expect(game.pitching.pitching[0]).toMatchObject({ R: 1, outs: 12, BB: 1 });
  expect(game.pitching.pitching[2]).toMatchObject({ R: 0, H: 1 });
 });
 it('ends a half on caught stealing before another PA and observes the third-out event', () => {
  const game = half();
  const events: InningEvent[] = [];
  game.offense.hitters[0].stealAttempt = 0.25;
  runHalf(game, [PA.BB, PA.SO, PA.SO], [], { advancement: [0.99, 0.99, 0, 0.99] }, Infinity, events);
  expect(game.batting.batting.reduce((sum, line) => sum + line.PA, 0)).toBe(3);
  expect(game.batting.batting[0].CS).toBe(1);
  expect(game.pitching.pitching[0]).toMatchObject({ outs: 3, SO: 2 });
  expect(events.at(-1)).toMatchObject({ outcome: 'caughtStealing', outsBefore: 2, outsAfter: 3, basesBefore: 1, basesAfter: 0, runsScored: 0 });
 });
 it('records a successful steal from its own pre-event state without using a PA', () => {
  const game = half();
  const events: InningEvent[] = [];
  game.offense.hitters[0].stealAttempt = 0.25;
  runHalf(game, [PA.BB, PA.SO, PA.SO, PA.SO], [], { advancement: [0, 0] }, Infinity, events);
  expect(game.batting.batting[0]).toMatchObject({ SB: 1, CS: 0 });
  expect(events[1]).toMatchObject({
   outcome: 'stolenBase', outsBefore: 0, outsAfter: 0, basesBefore: 1, basesAfter: 2,
   batterName: game.offense.hitters[0].displayName, batterSeasonId: game.offense.hitters[0].seasonId
  });
 });
 it('does not attempt a double play with two outs', () => {
  const game = half();
  runHalf(game, [PA.BB, PA.SO, PA.SO, PA.contact], [SHORTSTOP_DOUBLE_PLAY]);
  expect(game.pitching.pitching[0].outs).toBe(3);
  expect(game.batting.batting[3]).toMatchObject({ AB: 1, H: 0 });
 });
 it('ends a one-out half with a double play and conserves run value', () => {
  const game = half();
  game.context.prepared.doublePlay.fill(1);
  runHalf(game, [PA.BB, PA.SO, PA.contact], [SKILL_DOUBLE_PLAY]);
  expect(game.pitching.pitching[0].outs).toBe(3);
  expect(game.batting.batting[2]).toMatchObject({ AB: 1, RBI: 0 });
  expect(game.pitching.defensiveComponents.doublePlay).toBeGreaterThan(0);
  expect(game.batting.battingRuns + game.pitching.defensiveRuns + game.pitching.pitchingRunsAboveNeutral).toBeCloseTo(0, 10);
 });
 it('records an error as AB but neither hit nor RBI', () => {
  const game = half();
  game.context.prepared.errorBaseline.fill(0.12);
  runHalf(game, [PA.BB, PA.BB, PA.BB, PA.contact], [SHORTSTOP_ERROR]);
  expect(game.batting.runs).toBeGreaterThanOrEqual(1);
  expect(game.batting.batting[3]).toMatchObject({ AB: 1, H: 0, RBI: 0 });
  expect(game.pitching.pitching[0].H).toBe(0);
 });
 it('maps positional error reliability to the assigned defensive hitter', () => {
  const offense = testTeam('offense');
  const defense = testTeam('defense');
  [defense.defense.C, defense.defense.SS] = [defense.defense.SS, defense.defense.C];
  defense.hitters[defense.defense.C].defense.positions.C = { ...neutralDefensivePosition('C'), errorAvoidance: -1 };
  defense.hitters[defense.defense.SS].defense.positions.SS = { ...neutralDefensivePosition('SS'), errorAvoidance: 1 };
  const game = half(offense, defense);
  expect(game.context.prepared.hitterByPosition[0]).toBe(defense.defense.C);
  expect(game.context.prepared.errorAvoidance[0]).toBe(-1);
  expect(game.context.prepared.errorAvoidance[4]).toBe(1);
 });
 it('credits a tag-up sacrifice fly and RBI without an AB', () => {
  const game = half();
  runHalf(game, [PA.contact, PA.contact], [TRIPLE, DEEP_FLY], { advancement: [...NO_ADVANCE, 0, 0.99, 0.99, 0.99, 0.99, 0.99] });
  expect(game.batting.batting[1]).toMatchObject({ PA: 1, SF: 1, AB: 0, RBI: 1 });
  expect(game.batting.batting[0].R).toBe(1);
 });
 it('observes a non-home-run walkoff by its credited hit result', () => {
  const game = half();
  const events: InningEvent[] = [];
  runHalf(game, [PA.contact, PA.contact], [TRIPLE, TRIPLE], {}, 1, events);
  expect(events[1]).toMatchObject({ outcome: 'single', outsBefore: 0, basesBefore: 4, offenseRunsBefore: 0, offenseRunsAfter: 1, runsScored: 1 });
 });
 it('credits reach changes to the defender whose range changed the result', () => {
  const quick = half();
  quick.context.prepared.hitPrevention[6] = 1;
  runHalf(quick, [PA.contact], [DEEP_FLY]);
  const others = quick.pitching.batting.filter((_, index) => index !== quick.context.prepared.hitterByPosition[6]);
  expect(others.every(line => line.defensiveComponents.hitPrevention === 0)).toBe(true);
  expect(quick.batting.battingRuns + quick.pitching.defensiveRuns + quick.pitching.pitchingRunsAboveNeutral).toBeCloseTo(0, 10);
 });
});

const OUTS_BEFORE_BOTTOM_NINTH = 51;
const strikeouts = (count: number) => Array<number>(count).fill(PA.SO);

describe('complete games', () => {
 it('omits the bottom ninth when home already leads', () => {
  const game = simulateGame(testGame(), contactStreams([PA.SO, PA.SO, PA.SO, PA.contact], [HOME_RUN]));
  expect(game.home.innings).toEqual([1, 0, 0, 0, 0, 0, 0, 0, null]);
  expect(game.away.pitching.reduce((sum, line) => sum + line.outs, 0)).toBe(24);
 });
 it('truncates a triple to a single when third scores the non-HR winning run', () => {
  const game = simulateGame(testGame(), contactStreams([...strikeouts(OUTS_BEFORE_BOTTOM_NINTH), PA.contact, PA.contact], [TRIPLE, TRIPLE]));
  expect(game.home.runs).toBe(1);
  expect(game.home.batting[7]).toMatchObject({ H: 1, triples: 0, doubles: 0, RBI: 1 });
  expect(game.home.batting[6]).toMatchObject({ triples: 1, R: 1 });
 });
 it('credits a walk-off triple as a double when second supplies the winner', () => {
  const game = simulateGame(testGame(), contactStreams([...strikeouts(OUTS_BEFORE_BOTTOM_NINTH), PA.contact, PA.contact], [DOUBLE, TRIPLE]));
  expect(game.home.batting[7]).toMatchObject({ H: 1, doubles: 1, triples: 0 });
  expect(game.home.runs).toBe(1);
 });
 it('stops a bases-loaded non-HR walkoff after the first winning runner', () => {
  const game = simulateGame(testGame(), contactStreams([...strikeouts(OUTS_BEFORE_BOTTOM_NINTH), PA.BB, PA.BB, PA.BB, PA.contact], [TRIPLE]));
  expect(game.home.runs).toBe(1);
  expect(game.home.batting[0]).toMatchObject({ H: 1, triples: 0, RBI: 1 });
 });
 it('counts every run of a walk-off home run', () => {
  const game = simulateGame(testGame(), contactStreams([...strikeouts(OUTS_BEFORE_BOTTOM_NINTH), PA.BB, PA.BB, PA.BB, PA.contact], [HOME_RUN]));
  expect(game.home.runs).toBe(4);
  expect(game.home.batting[0]).toMatchObject({ HR: 1, RBI: 4, R: 1 });
 });
 it('records the bottom-ninth grand slam as the terminal highlight, and its mirror as a lowlight', () => {
  const pa = [PA.contact, PA.contact, PA.contact, ...strikeouts(OUTS_BEFORE_BOTTOM_NINTH), PA.BB, PA.BB, PA.BB, PA.contact];
  const scripts = [HOME_RUN, HOME_RUN, HOME_RUN, HOME_RUN];
  const input = testGame();
  input.number = 81;
  input.opponentName = 'Test Visitors';
  const game = simulateGame(input, contactStreams(pa, scripts));
  expect(game).toMatchObject({ challengeRuns: 4, opponentRuns: 3, win: true });
  expect(game.highlight).toMatchObject({
   gameNumber: 81, opponentName: 'Test Visitors', isHome: true, inning: 9, half: 'bottom', outsBefore: 0, basesBefore: 7,
   challengeRunsBefore: 0, opponentRunsBefore: 3, challengeRunsAfter: 4, opponentRunsAfter: 3,
   batterSeasonId: input.home.hitters[0].seasonId, pitcherSeasonId: input.away.pitchers[input.away.closerIndex].seasonId,
   challengeBatting: true, outcome: 'homeRun', runsScored: 4, winAfter: 1
  });
  expect(game.highlight!.swing).toBeGreaterThan(0.5);
  const away = testGame();
  away.challengeIsHome = false;
  const mirrored = simulateGame(away, contactStreams(pa, scripts));
  expect(mirrored.lowlight).toMatchObject({ inning: 9, half: 'bottom', basesBefore: 7, challengeBatting: false, outcome: 'homeRun', runsScored: 4, winAfter: 0 });
 });
 it('does not change boxes or randomness when moment observation is disabled', () => {
  const pa = [PA.contact, ...strikeouts(50), PA.BB, PA.contact];
  const tracked = simulateGame(testGame(), contactStreams(pa, [HOME_RUN, DOUBLE]));
  const untracked = simulateGame(testGame(), contactStreams(pa, [HOME_RUN, DOUBLE]), null);
  expect({ ...tracked, highlight: null, lowlight: null }).toEqual(untracked);
 });
 it('starts extra innings with empty bases and produces a real winner', () => {
  const game = simulateGame(testGame(), contactStreams([...strikeouts(54), PA.contact], [HOME_RUN]));
  expect(game.home.innings).toHaveLength(10);
  expect(game.away.innings[9]).toBe(1);
  expect(game).toMatchObject({ challengeRuns: 0, opponentRuns: 1, win: false });
 });
 it('records the stadium it was played in', () => {
  const game = simulateGame(testGame(), contactStreams([PA.contact], [HOME_RUN]));
  expect(game.stadium.id).toBe('neutral-reference');
 });
 it('fails the PA safety bound rather than manufacturing a result', () => {
  const input = testGame();
  input.limits = { maxPA: 5 };
  expect(() => simulateGame(input, scriptedStreams({}, { pa: PA.BB }))).toThrow('plate appearances');
 });
 it('fails the innings safety bound rather than breaking a tie', () => {
  const input = testGame();
  input.limits = { maxInnings: 9 };
  expect(() => simulateGame(input, scriptedStreams({}))).toThrow('without a winner');
 });
});
