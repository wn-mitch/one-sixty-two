import { describe, expect, it } from 'vitest';
import { POSITIONS } from '../game/types.ts';
import { createBases } from './advancement.ts';
import {
 CONTACT_DOUBLE_PLAY,
 CONTACT_ERROR,
 CONTACT_FIRST_ATTEMPT,
 CONTACT_FIRST_OUT,
 CONTACT_HIT_CONVERSION,
 CONTACT_OUTFIELD,
 CONTACT_RESPONSIBILITY,
 CONTACT_SECOND_ATTEMPT,
 CONTACT_SECOND_OUT,
 CONTACT_THIRD_ATTEMPT,
 CONTACT_THIRD_OUT,
 CONTACT_UNIFORM_COUNT,
 createContactResult,
 createPreparedDefense,
 fillContactPacket,
 resolveContact,
 type ContactOptions
} from './contact.ts';
import { createBox } from './game.ts';
import { AVERAGE_RATES } from './fixtures.ts';
import { testDefenseEnvironment, testTeam } from './test-fixtures.ts';

const ALL_SKILLS: ContactOptions = {
 hitPrevention: true,
 errorAvoidance: true,
 doublePlayPositions: new Uint8Array(POSITIONS.length).fill(1),
 outfieldThrowing: true
};

function contactFixture() {
 const offense = testTeam('batting');
 const defense = testTeam('fielding');
 const batting = createBox(offense);
 const pitching = createBox(defense);
 const bases = createBases(batting, pitching);
 const result = createContactResult();
 const packet = new Float64Array(CONTACT_UNIFORM_COUNT).fill(0.99);
 return { offense, defense, batting, pitching, bases, result, packet, participants: new Uint8Array(3) };
}

describe('contact transition kernel', () => {
 it('fills one fixed packet and performs repeated counterfactual resolution without RNG or box mutation', () => {
  const game = contactFixture();
  let calls = 0;
  fillContactPacket(game.packet, () => {
   calls++;
   return 0.5;
  });
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());
  resolveContact(game.result, game.bases, 0, 7, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  resolveContact(game.result, game.bases, 0, 7, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);

  expect(calls).toBe(CONTACT_UNIFORM_COUNT);
  expect([...game.bases.runners]).toEqual([-1, -1, -1]);
  expect(game.batting.batting.reduce((sum, line) => sum + line.PA, 0)).toBe(0);
  expect(game.pitching.pitching.reduce((sum, line) => sum + line.BF, 0)).toBe(0);
 });

 it('turns a non-HR hit into a clean catch without advancing existing runners', () => {
  const game = contactFixture();
  game.bases.runners.set([1, -1, 2]);
  game.bases.pitchers.set([0, -1, 0]);
  game.packet[CONTACT_RESPONSIBILITY] = 0.45;
  game.packet[CONTACT_HIT_CONVERSION] = 0;
  game.defense.hitters[game.defense.defense.SS].defense.positions.SS!.hitPrevention = 1;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());

  resolveContact(game.result, game.bases, 0, 3, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect(game.result).toMatchObject({ creditedBases: 0, outsAfter: 1, runs: 0, error: false, doublePlay: false, caughtAdvancing: -1 });
  expect([...game.result.runners]).toEqual([1, -1, 2]);
 });

 it('turns an ordinary out into a single for negative hit prevention without changing another category', () => {
  const game = contactFixture();
  game.packet[CONTACT_RESPONSIBILITY] = 0.45;
  game.packet[CONTACT_HIT_CONVERSION] = 0;
  game.packet[CONTACT_OUTFIELD] = 0.9;
  game.defense.hitters[game.defense.defense.SS].defense.positions.SS!.hitPrevention = -1;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());

  resolveContact(game.result, game.bases, 0, 7, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect(game.result).toMatchObject({ creditedBases: 1, outsAfter: 0, runs: 0, error: false, doublePlay: false });
  expect(game.result.fielder).toBe(POSITIONS.indexOf('SS'));
  expect(game.result.thrower).toBe(POSITIONS.indexOf('RF'));
  expect([...game.result.runners]).toEqual([0, -1, -1]);
 });

 it('uses all distinct infield participants for a double play and never permits one with two outs', () => {
  const game = contactFixture();
  game.bases.runners[0] = 1;
  game.bases.pitchers[0] = 0;
  game.packet[CONTACT_RESPONSIBILITY] = 0.06;
  game.packet[CONTACT_ERROR] = 0.99;
  game.packet[CONTACT_DOUBLE_PLAY] = 0.05;
  game.defense.hitters[game.defense.defense['1B']].defense.positions['1B']!.doublePlay = 1;
  game.defense.hitters[game.defense.defense.SS].defense.positions.SS!.doublePlay = 1;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());

  resolveContact(game.result, game.bases, 1, 7, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect(game.result).toMatchObject({ doublePlay: true, outsAfter: 3, runs: 0 });
  expect(game.result.runners[0]).toBe(-1);

  resolveContact(game.result, game.bases, 2, 7, AVERAGE_RATES, 0, 0, game.offense.hitters, 1, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect(game.result).toMatchObject({ doublePlay: false, outsAfter: 3 });
  expect(game.result.runners[0]).toBe(1);
 });

 it('resolves lead runners first, records a caught advance, and stops at the third out', () => {
  const game = contactFixture();
  game.bases.runners.set([1, 2, 3]);
  game.bases.pitchers.set([0, 0, 0]);
  game.packet[CONTACT_RESPONSIBILITY] = 0.45;
  game.packet[CONTACT_OUTFIELD] = 0.5;
  game.packet[CONTACT_SECOND_ATTEMPT] = 0;
  game.packet[CONTACT_SECOND_OUT] = 0;
  game.packet[CONTACT_FIRST_ATTEMPT] = 0;
  game.packet[CONTACT_FIRST_OUT] = 0.99;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());

  resolveContact(game.result, game.bases, 2, 3, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect(game.result).toMatchObject({ creditedBases: 1, runs: 1, outsAfter: 3, caughtAdvancing: 2, scoreCount: 1 });
  expect(game.result.scoredRunners[0]).toBe(3);
  expect([...game.result.runners]).toEqual([1, -1, -1]);
 });

 it('retains every caught-advancing runner when multiple attempts fail on one hit', () => {
  const game = contactFixture();
  game.bases.runners.set([1, 2, -1]);
  game.bases.pitchers.set([0, 0, -1]);
  game.packet[CONTACT_RESPONSIBILITY] = 0.45;
  game.packet[CONTACT_OUTFIELD] = 0.5;
  game.packet[CONTACT_SECOND_ATTEMPT] = 0;
  game.packet[CONTACT_SECOND_OUT] = 0;
  game.packet[CONTACT_FIRST_ATTEMPT] = 0;
  game.packet[CONTACT_FIRST_OUT] = 0;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());

  resolveContact(game.result, game.bases, 0, 3, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect(game.result).toMatchObject({ creditedBases: 1, runs: 0, outsAfter: 2, caughtCount: 2, caughtAdvancing: 1 });
  expect([...game.result.caughtRunners.slice(0, 2)]).toEqual([2, 1]);
  expect([...game.result.runners]).toEqual([0, -1, -1]);
 });

 it('preserves every occupied lead base when extra-base attempts are declined', () => {
  const game = contactFixture();
  game.bases.runners.set([1, 2, -1]);
  game.bases.pitchers.set([0, 0, -1]);
  game.packet[CONTACT_SECOND_ATTEMPT] = 0.99;
  game.packet[CONTACT_FIRST_ATTEMPT] = 0.99;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());
  resolveContact(game.result, game.bases, 0, 3, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect([...game.result.runners]).toEqual([0, 1, 2]);
  expect(game.result.runs).toBe(0);
 });

 it('lets the trailing runner take third only after the lead runner scores', () => {
  const game = contactFixture();
  game.bases.runners.set([1, 2, -1]);
  game.bases.pitchers.set([0, 0, -1]);
  game.packet[CONTACT_SECOND_ATTEMPT] = 0;
  game.packet[CONTACT_SECOND_OUT] = 0.99;
  game.packet[CONTACT_FIRST_ATTEMPT] = 0;
  game.packet[CONTACT_FIRST_OUT] = 0.99;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());
  resolveContact(game.result, game.bases, 0, 3, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect([...game.result.runners]).toEqual([0, -1, 1]);
  expect(game.result.runs).toBe(1);
  expect(game.result.scoredRunners[0]).toBe(2);
 });

 it('scores second and third on a double while retaining the original first-base runner', () => {
  const game = contactFixture();
  game.bases.runners.set([1, 2, 3]);
  game.bases.pitchers.set([0, 0, 0]);
  game.packet[CONTACT_FIRST_ATTEMPT] = 0.99;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());
  resolveContact(game.result, game.bases, 0, 4, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect([...game.result.runners]).toEqual([-1, 0, 1]);
  expect(game.result.runs).toBe(2);
  expect([...game.result.scoredRunners.slice(0, 2)]).toEqual([3, 2]);
 });

 it('ends a non-HR walkoff on the winning runner and truncates the credited hit', () => {
  const game = contactFixture();
  game.bases.runners.set([-1, 1, 2]);
  game.bases.pitchers.set([-1, 0, 0]);
  game.packet[CONTACT_RESPONSIBILITY] = 0.45;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());

  resolveContact(game.result, game.bases, 0, 4, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, 1, game.participants);
  expect(game.result).toMatchObject({ creditedBases: 1, runs: 1, scoreCount: 1, ended: true, winningAdvance: 1, caughtAdvancing: -1 });
  expect(game.result.scoredRunners[0]).toBe(2);
  expect(game.result.runners[1]).toBe(1);
 });

 it('makes a thrown-out tag the third out without a run or sacrifice fly', () => {
  const game = contactFixture();
  game.bases.runners[2] = 3;
  game.bases.pitchers[2] = 0;
  game.packet[CONTACT_RESPONSIBILITY] = 0.65;
  game.packet[CONTACT_ERROR] = 0.99;
  game.packet[CONTACT_DOUBLE_PLAY] = 0.99;
  game.packet[CONTACT_THIRD_ATTEMPT] = 0;
  game.packet[CONTACT_THIRD_OUT] = 0;
  const prepared = createPreparedDefense(game.defense, testDefenseEnvironment());

  resolveContact(game.result, game.bases, 1, 7, AVERAGE_RATES, 0, 0, game.offense.hitters, 0, prepared, ALL_SKILLS,
   game.packet, 0, Infinity, game.participants);
  expect(game.result).toMatchObject({ outsAfter: 3, runs: 0, sacrificeFly: false, caughtAdvancing: 3 });
  expect(game.result.runners[2]).toBe(-1);
 });
});
