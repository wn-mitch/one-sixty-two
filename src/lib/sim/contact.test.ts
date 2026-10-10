import { describe, expect, it } from 'vitest';
import { POSITIONS } from '../game/types.ts';
import { createBases } from './advancement.ts';
import {
 DECISION_DOUBLE_PLAY,
 DECISION_ERROR,
 DECISION_FIRST_ATTEMPT,
 DECISION_FIRST_OUT,
 DECISION_SECOND_ATTEMPT,
 DECISION_SECOND_OUT,
 DECISION_THIRD_ATTEMPT,
 DECISION_THIRD_OUT,
 createContactOptions,
 createContactResult,
 createDecisions,
 createPreparedDefense,
 enumerateDecisions,
 resolveContact
} from './contact.ts';
import { OUTCOME_AUTOMATIC_DOUBLE, OUTCOME_CAUGHT, OUTCOME_GROUND_OUT, OUTCOME_HIT, OUTCOME_HOME_RUN, OUTCOME_INFIELD_HIT } from './fielding.ts';
import { createBox } from './game.ts';
import { testDefenseEnvironment, testTeam } from './test-fixtures.ts';

const SS = POSITIONS.indexOf('SS');
const CF = POSITIONS.indexOf('CF');

function fixture() {
 const offense = testTeam('batting');
 const defense = testTeam('fielding');
 const batting = createBox(offense);
 const pitching = createBox(defense);
 const bases = createBases(batting, pitching);
 const decisions = createDecisions();
 decisions.packet.fill(0.99);
 const options = createContactOptions();
 options.errorPositions.fill(1);
 options.doublePlayPositions.fill(1);
 options.outfieldThrowing = true;
 return { offense, defense, bases, result: createContactResult(), decisions, options, participants: new Uint8Array(3) };
}

type Fixture = ReturnType<typeof fixture>;
function resolve(game: Fixture, kind: number, fielder: number, basesTaken: number, outs = 0, target = Infinity, batterDoublePlay = 0) {
 const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());
 resolveContact(game.result, game.bases, outs, kind, fielder, basesTaken, 0, 0, game.offense.hitters, batterDoublePlay, prepared,
  game.options, game.decisions, 0, target, game.participants);
 return game.result;
}

describe('legal contact adapter', () => {
 it('resolves repeatedly from the same bases without mutating them', () => {
  const game = fixture();
  game.bases.runners.set([1, -1, 2]);
  resolve(game, OUTCOME_HIT, CF, 2);
  resolve(game, OUTCOME_HIT, CF, 2);
  expect([...game.bases.runners]).toEqual([1, -1, 2]);
 });
 it('scores every runner and the batter on a home run, even past a walkoff target', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, 3]);
  const result = resolve(game, OUTCOME_HOME_RUN, -1, 4, 0, 1);
  expect(result).toMatchObject({ creditedBases: 4, runs: 4, ended: true, winningAdvance: 4 });
 });
 it('advances runners two bases on an automatic double', () => {
  const game = fixture();
  game.bases.runners.set([1, -1, -1]);
  const result = resolve(game, OUTCOME_AUTOMATIC_DOUBLE, -1, 2);
  expect([...result.runners]).toEqual([-1, 0, 1]);
  expect(result.creditedBases).toBe(2);
 });
 it('forces runners on an infield hit', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, -1]);
  const result = resolve(game, OUTCOME_INFIELD_HIT, SS, 1);
  expect([...result.runners]).toEqual([0, 1, 2]);
  expect(result.runs).toBe(0);
 });
 it('uses all distinct infield participants for a double play and never permits one with two outs', () => {
  const game = fixture();
  game.bases.runners[0] = 1;
  game.decisions.packet[DECISION_DOUBLE_PLAY] = 0.05;
  expect(resolve(game, OUTCOME_GROUND_OUT, SS, 0, 1, Infinity, 0.08)).toMatchObject({ doublePlay: true, outsAfter: 3, runs: 0 });
  expect(game.result.runners[0]).toBe(-1);
  expect(resolve(game, OUTCOME_GROUND_OUT, SS, 0, 2, Infinity, 0.08)).toMatchObject({ doublePlay: false, outsAfter: 3 });
  expect(game.result.runners[0]).toBe(1);
 });
 it('puts the batter on first on an error without an out or a hit', () => {
  const game = fixture();
  game.decisions.packet[DECISION_ERROR] = 0;
  expect(resolve(game, OUTCOME_GROUND_OUT, SS, 0)).toMatchObject({ error: true, outsAfter: 0, creditedBases: 0 });
  expect(game.result.runners[0]).toBe(0);
 });
 it('resolves lead runners first, records a caught advance, and stops at the third out', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, 3]);
  game.decisions.packet.set([0.99, 0.99, 0.99, 0.99, 0, 0, 0, 0.99]);
  const result = resolve(game, OUTCOME_HIT, CF, 1, 2);
  expect(result).toMatchObject({ creditedBases: 1, runs: 1, outsAfter: 3, caughtAdvancing: 2, scoreCount: 1 });
  expect(result.scoredRunners[0]).toBe(3);
 });
 it('retains every caught-advancing runner when multiple attempts fail on one hit', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, -1]);
  game.decisions.packet[DECISION_SECOND_ATTEMPT] = 0;
  game.decisions.packet[DECISION_SECOND_OUT] = 0;
  game.decisions.packet[DECISION_FIRST_ATTEMPT] = 0;
  game.decisions.packet[DECISION_FIRST_OUT] = 0;
  const result = resolve(game, OUTCOME_HIT, CF, 1);
  expect(result).toMatchObject({ creditedBases: 1, runs: 0, outsAfter: 2, caughtCount: 2, caughtAdvancing: 1 });
  expect([...result.caughtRunners.slice(0, 2)]).toEqual([2, 1]);
  expect([...result.runners]).toEqual([0, -1, -1]);
 });
 it('preserves every occupied lead base when extra-base attempts are declined', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, -1]);
  const result = resolve(game, OUTCOME_HIT, CF, 1);
  expect([...result.runners]).toEqual([0, 1, 2]);
  expect(result.runs).toBe(0);
 });
 it('lets the trailing runner take third only after the lead runner scores', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, -1]);
  game.decisions.packet[DECISION_SECOND_ATTEMPT] = 0;
  game.decisions.packet[DECISION_FIRST_ATTEMPT] = 0;
  const result = resolve(game, OUTCOME_HIT, CF, 1);
  expect([...result.runners]).toEqual([0, -1, 1]);
  expect(result.runs).toBe(1);
  expect(result.scoredRunners[0]).toBe(2);
 });
 it('scores second and third on a double while retaining the original first-base runner', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, 3]);
  const result = resolve(game, OUTCOME_HIT, CF, 2);
  expect([...result.runners]).toEqual([-1, 0, 1]);
  expect(result.runs).toBe(2);
  expect([...result.scoredRunners.slice(0, 2)]).toEqual([3, 2]);
 });
 it('ends a non-HR walkoff on the winning runner and truncates the credited hit', () => {
  const game = fixture();
  game.bases.runners.set([-1, 1, 2]);
  const result = resolve(game, OUTCOME_HIT, CF, 2, 0, 1);
  expect(result).toMatchObject({ creditedBases: 1, runs: 1, scoreCount: 1, ended: true, winningAdvance: 1, caughtAdvancing: -1 });
  expect(result.scoredRunners[0]).toBe(2);
  expect(result.runners[1]).toBe(1);
 });
 it('makes a thrown-out tag the third out without a run or sacrifice fly', () => {
  const game = fixture();
  game.bases.runners[2] = 3;
  game.decisions.packet[DECISION_THIRD_ATTEMPT] = 0;
  game.decisions.packet[DECISION_THIRD_OUT] = 0;
  const result = resolve(game, OUTCOME_CAUGHT, CF, 0, 1);
  expect(result).toMatchObject({ outsAfter: 3, runs: 0, sacrificeFly: false, caughtAdvancing: 3 });
  expect(result.runners[2]).toBe(-1);
 });
 it('enumerates every decision path with probabilities that sum to one', () => {
  const game = fixture();
  game.bases.runners.set([1, 2, 3]);
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());
  let total = 0;
  let paths = 0;
  enumerateDecisions(game.decisions, () => resolveContact(game.result, game.bases, 0, OUTCOME_HIT, CF, 1, 0, 0, game.offense.hitters, 0, prepared,
   game.options, game.decisions, 0, Infinity, game.participants), probability => { total += probability; paths++; });
  expect(paths).toBeGreaterThan(2);
  expect(total).toBeCloseTo(1, 12);
 });
});
