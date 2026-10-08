import { describe, expect, it } from 'vitest';
import { createBox, simulateGame } from './game.ts';
import { createInningContext, playHalf, type InningEvent } from './inning.ts';
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
 CONTACT_UNIFORM_COUNT
} from './contact.ts';
import { neutralDefensivePosition } from './defense.ts';
import { createWorkload } from './workload.ts';
import { EVENT as E, eventTable, scripted, testDefenseEnvironment, testGame, testTeam } from './test-fixtures.ts';

function contact(event: number, values: Readonly<Record<number, number>> = {}): number[] {
 const packet = Array<number>(CONTACT_UNIFORM_COUNT).fill(0.99);
 for (const [index, value] of Object.entries(values)) packet[Number(index)] = value;
 return [event, ...packet];
}

function half() {
 const offense = testTeam('batting');
 const defense = testTeam('fielding');
 const batting = createBox(offense);
 const pitching = createBox(defense);
 const workload = createWorkload(defense);
 const context = createInningContext(offense, defense, batting, pitching, workload, eventTable(3), testDefenseEnvironment(), 1000);
 return { offense, defense, batting, pitching, workload, context };
}

describe('plate appearance scoring', () => {
 it('credits every assigned defender with workload on strikeouts', () => {
  const game = half();
  playHalf(game.context, Infinity, scripted([E.SO, E.SO, E.SO]));
  expect(game.pitching.batting.map(line => line.fieldingOuts)).toEqual([...Array(8).fill(3), 0]);
 });
 it('forces a bases-loaded walk, without an AB or hit', () => {
  const game = half();
  playHalf(game.context, Infinity, scripted([E.BB, 0.9, E.BB, E.BB, E.BB]));
  expect(game.batting.runs).toBe(1);
  expect(game.batting.batting[3]).toMatchObject({ PA: 1, AB: 0, BB: 1, H: 0, RBI: 1 });
  expect(game.pitching.pitching[0]).toMatchObject({ BB: 4, R: 1, outs: 3 });
 });
 it('scores a forced HBP with no AB and credits its RBI', () => {
  const game = half();
  playHalf(game.context, Infinity, scripted([E.BB, 0.9, E.BB, E.BB, E.HBP]));
  expect(game.batting.batting[3]).toMatchObject({ HBP: 1, AB: 0, RBI: 1 });
  expect(game.pitching.pitching[0].HBP).toBe(1);
 });
 it('charges inherited runners to the replaced starter', () => {
  const game = half();
  game.workload.budget = 12;
  game.pitching.pitching[0].outs = 11;
  playHalf(game.context, Infinity, scripted([E.BB, 0.9, E.SO, 0.9, ...contact(E.double, { [CONTACT_FIRST_ATTEMPT]: 0, [CONTACT_FIRST_OUT]: 0.99 })]));
  expect(game.pitching.pitching[0]).toMatchObject({ R: 1, outs: 12, BB: 1 });
  expect(game.pitching.pitching[2]).toMatchObject({ R: 0, H: 1, outs: 2 });
 });
 it('ends a half on caught stealing before another PA and observes the third-out event', () => {
  const game = half();
  const events: InningEvent[] = [];
  game.offense.hitters[0].stealAttempt = 0.25;
  playHalf(game.context, Infinity, scripted([E.BB, 0.9, E.SO, 0.9, E.SO, 0, 0.99]), event => events.push(event));
  expect(game.batting.batting.reduce((sum, line) => sum + line.PA, 0)).toBe(3);
  expect(game.batting.batting[0].CS).toBe(1);
  expect(game.pitching.pitching[0]).toMatchObject({ outs: 3, SO: 2 });
  expect(events.at(-1)).toMatchObject({ outcome: 'caughtStealing', outsBefore: 2, outsAfter: 3, basesBefore: 1, basesAfter: 0, runsScored: 0 });
 });
 it('records a successful steal from its own pre-event state without using a PA', () => {
  const game = half();
  const events: InningEvent[] = [];
  game.offense.hitters[0].stealAttempt = 0.25;
  playHalf(game.context, Infinity, scripted([E.BB, 0, 0, E.SO]), event => events.push(event));
  expect(game.batting.batting[0]).toMatchObject({ SB: 1, CS: 0 });
  expect(game.batting.batting.reduce((sum, line) => sum + line.PA, 0)).toBe(4);
  expect(events[1]).toMatchObject({
   outcome: 'stolenBase', outsBefore: 0, outsAfter: 0, basesBefore: 1, basesAfter: 2,
   batterName: game.offense.hitters[0].displayName, batterSeasonId: game.offense.hitters[0].seasonId
  });
 });
 it('records an advancement out separately from caught stealing and stops on the third out', () => {
  const game = half();
  const events: InningEvent[] = [];
  game.offense.hitters[0].stealAttempt = 0.25;
  playHalf(game.context, Infinity, scripted([
   E.BB, 0, 0,
   E.SO,
   E.SO,
   ...contact(E.single, { [CONTACT_SECOND_ATTEMPT]: 0, [CONTACT_SECOND_OUT]: 0 })
  ]), event => events.push(event));
  expect(game.batting.batting[0]).toMatchObject({ SB: 1, CS: 0, caughtAdvancing: 1 });
  expect(game.batting.batting[3]).toMatchObject({ H: 1, AB: 1 });
  expect(game.pitching.pitching[0]).toMatchObject({ outs: 3, H: 1 });
  expect(game.batting.runs).toBe(0);
  expect(events.at(-1)).toMatchObject({ outcome: 'single', outsBefore: 2, outsAfter: 3, runsScored: 0 });
 });
 it('does not attempt a double play with two outs', () => {
  const game = half();
  game.offense.hitters[3].doublePlay = 1;
  playHalf(game.context, Infinity, scripted([E.BB, 0.9, E.SO, 0.9, E.SO, 0.9, ...contact(E.OUT, { [CONTACT_RESPONSIBILITY]: 0.1 })]));
  expect(game.pitching.pitching[0].outs).toBe(3);
  expect(game.context.bases.runners[0]).toBe(0);
 });
 it('ends a one-out half with a double play and never exceeds three outs', () => {
  const game = half();
  game.offense.hitters[2].doublePlay = 0;
  game.context.prepared.doublePlay.fill(1);
  playHalf(game.context, Infinity, scripted([E.BB, 0.9, E.SO, 0.9, ...contact(E.OUT, {
   [CONTACT_RESPONSIBILITY]: 0.1,
   [CONTACT_HIT_CONVERSION]: 0.99,
   [CONTACT_ERROR]: 0.99,
   [CONTACT_DOUBLE_PLAY]: 0
  })]));
  expect(game.pitching.pitching[0].outs).toBe(3);
  expect(game.batting.batting[2]).toMatchObject({ AB: 1, RBI: 0 });
  expect(game.context.bases.runners[0]).toBe(-1);
  expect(game.pitching.defensiveComponents.doublePlay).toBeGreaterThan(0);
  expect(game.batting.battingRuns + game.pitching.defensiveRuns + game.pitching.pitchingRunsAboveNeutral).toBeCloseTo(0, 10);
 });
 it('attributes converted-hit throwing value to the independently selected outfielder', () => {
  const game = half();
  game.context.prepared.hitPrevention[4] = -1;
  game.context.prepared.outfieldThrowing[7] = 1;
  playHalf(game.context, Infinity, scripted([
   ...contact(E.double),
   ...contact(E.OUT, {
    [CONTACT_RESPONSIBILITY]: 0.45,
    [CONTACT_HIT_CONVERSION]: 0,
    [CONTACT_OUTFIELD]: 0.9,
    [CONTACT_SECOND_ATTEMPT]: 0.62
   }),
   E.SO, E.SO, E.SO
  ]));
  const selected = game.pitching.batting[game.defense.defense.RF].defensiveComponents.outfieldThrowing;
  const others = game.pitching.batting
   .filter((_, index) => index !== game.defense.defense.RF)
   .reduce((sum, line) => sum + Math.abs(line.defensiveComponents.outfieldThrowing), 0);
  expect(selected).toBeGreaterThan(0);
  expect(others).toBe(0);
 });
 it('records an error as AB but neither hit nor RBI', () => {
  const game = half();
  game.context.prepared.errorBaseline.fill(0.12);
  playHalf(game.context, Infinity, scripted([E.BB, 0.9, E.BB, E.BB, ...contact(E.OUT, {
   [CONTACT_RESPONSIBILITY]: 0.1,
   [CONTACT_ERROR]: 0
  })]));
  expect(game.batting.runs).toBe(1);
  expect(game.batting.batting[3]).toMatchObject({ AB: 1, H: 0, RBI: 0 });
  expect(game.pitching.pitching[0]).toMatchObject({ H: 0, R: 1 });
 });
 it('maps positional error reliability to the assigned defensive hitter', () => {
  const offense = testTeam('offense');
  const defense = testTeam('defense');
  const originalC = defense.defense.C;
  defense.hitters[originalC].defense.positions.C!.errorAvoidance = 1;
  [defense.defense.C, defense.defense.SS] = [defense.defense.SS, defense.defense.C];
  defense.hitters[defense.defense.C].defense.positions.C = neutralDefensivePosition('C');
  defense.hitters[defense.defense.C].defense.positions.C!.errorAvoidance = -1;
  defense.hitters[defense.defense.SS].defense.positions.SS = neutralDefensivePosition('SS');
  const environment = testDefenseEnvironment();
  environment.leagueErrorRates.C = 0.12;
  const batting = createBox(offense);
  const pitching = createBox(defense);
  const context = createInningContext(offense, defense, batting, pitching, createWorkload(defense), eventTable(3), environment, 1000);
  playHalf(context, Infinity, scripted(contact(E.OUT, { [CONTACT_RESPONSIBILITY]: 0.01, [CONTACT_ERROR]: 0.11 })));
  expect(context.prepared.errorBaseline[0]).toBe(0.12);
  expect(context.prepared.hitterByPosition[0]).toBe(defense.defense.C);
  expect(batting.batting[0]).toMatchObject({ AB: 1, H: 0 });
  expect(batting.batting.reduce((sum, line) => sum + line.PA, 0)).toBe(4);
 });
 it('credits tag-up SF and RBI without AB', () => {
  const game = half();
  playHalf(game.context, Infinity, scripted([
   ...contact(E.triple),
   ...contact(E.OUT, {
    [CONTACT_RESPONSIBILITY]: 0.65,
    [CONTACT_THIRD_ATTEMPT]: 0,
    [CONTACT_THIRD_OUT]: 0.99
   })
  ]));
  expect(game.batting.batting[1]).toMatchObject({ PA: 1, SF: 1, AB: 0, RBI: 1 });
  expect(game.batting.batting[0].R).toBe(1);
 });
 it('observes a non-home-run walkoff by its credited hit result', () => {
  const game = half();
  const events: InningEvent[] = [];
  playHalf(game.context, 1, scripted([...contact(E.triple), ...contact(E.triple)]), event => events.push(event));
  expect(events[1]).toMatchObject({
   outcome: 'single', outsBefore: 0, basesBefore: 4,
   offenseRunsBefore: 0, offenseRunsAfter: 1, runsScored: 1
  });
 });
});


function walkoffGrandSlamEvents(): number[] {
 const values = [E.HR, E.HR, E.HR, E.SO, E.SO, E.SO, E.SO, E.SO, E.SO];
 for (let inning = 2; inning <= 8; inning++) values.push(E.SO, E.SO, E.SO, E.SO, E.SO, E.SO);
 values.push(E.SO, E.SO, E.SO, E.BB, 0.9, E.BB, E.BB, E.HR);
 return values;
}

describe('complete games', () => {
 it('omits the bottom ninth when home already leads', () => {
  const events = [E.SO, E.SO, E.SO, E.HR, E.SO, E.SO, E.SO, ...Array<number>(45).fill(E.SO)];
  const game = simulateGame(testGame(), scripted(events));
  expect(game.home.innings).toEqual([1, 0, 0, 0, 0, 0, 0, 0, null]);
  expect(game.away.pitching.reduce((sum, line) => sum + line.outs, 0)).toBe(24);
 });
 it('truncates a triple to a single when third scores the non-HR winning run', () => {
  const game = simulateGame(testGame(), scripted([...Array<number>(51).fill(E.SO), ...contact(E.triple), ...contact(E.triple)]));
  expect(game.home.runs).toBe(1);
  const hitter = game.home.batting[7];
  expect(hitter).toMatchObject({ H: 1, triples: 0, doubles: 0, RBI: 1 });
  expect(game.home.batting[6]).toMatchObject({ triples: 1, R: 1 });
 });
 it('credits a walk-off triple as a double when second supplies the winner', () => {
  const game = simulateGame(testGame(), scripted([...Array<number>(51).fill(E.SO), ...contact(E.double), ...contact(E.triple)]));
  expect(game.home.batting[7]).toMatchObject({ H: 1, doubles: 1, triples: 0 });
  expect(game.home.runs).toBe(1);
 });
 it('stops a bases-loaded non-HR walkoff after the first winning runner', () => {
  const game = simulateGame(testGame(), scripted([...Array<number>(51).fill(E.SO), E.BB, 0.9, E.BB, E.BB, ...contact(E.triple)]));
  expect(game.home.runs).toBe(1);
  expect(game.home.batting[0]).toMatchObject({ H: 1, triples: 0, RBI: 1 });
 });
 it('counts every run of a walk-off home run', () => {
  const game = simulateGame(testGame(), scripted([...Array<number>(51).fill(E.SO), E.BB, 0.9, E.BB, E.BB, E.HR]));
  expect(game.home.runs).toBe(4);
  expect(game.home.batting[0]).toMatchObject({ HR: 1, RBI: 4, R: 1 });
 });
 it('records the actual bases-loaded bottom-ninth grand slam as a terminal highlight', () => {
  const input = testGame();
  input.number = 81;
  input.opponentName = 'Test Visitors';
  const game = simulateGame(input, scripted(walkoffGrandSlamEvents()));
  expect(game).toMatchObject({ challengeRuns: 4, opponentRuns: 3, win: true });
  expect(game.highlight).toMatchObject({
   gameNumber: 81, opponentName: 'Test Visitors', isHome: true,
   inning: 9, half: 'bottom', outsBefore: 0, basesBefore: 7,
   challengeRunsBefore: 0, opponentRunsBefore: 3, challengeRunsAfter: 4, opponentRunsAfter: 3,
   batterName: input.home.hitters[0].displayName, batterSeasonId: input.home.hitters[0].seasonId,
   pitcherName: input.away.pitchers[input.away.closerIndex].displayName,
   pitcherSeasonId: input.away.pitchers[input.away.closerIndex].seasonId, challengeBatting: true,
   outcome: 'homeRun', runsScored: 4, winAfter: 1
  });
  expect(game.highlight!.swing).toBeGreaterThan(0.5);
 });
 it('reverses the same home grand slam into an opponent lowlight without changing event facts', () => {
  const input = testGame();
  input.challengeIsHome = false;
  const game = simulateGame(input, scripted(walkoffGrandSlamEvents()));
  expect(game.lowlight).toMatchObject({
   inning: 9, half: 'bottom', basesBefore: 7, challengeBatting: false,
   challengeRunsBefore: 3, opponentRunsBefore: 0, challengeRunsAfter: 3, opponentRunsAfter: 4,
   outcome: 'homeRun', runsScored: 4, winAfter: 0
  });
  expect(game.lowlight!.swing).toBeLessThan(-0.5);
 });
 it('does not consume randomness or change boxes when moment observation is disabled', () => {
  const values = walkoffGrandSlamEvents();
  let trackedCalls = 0;
  let untrackedCalls = 0;
  const trackedRandom = () => values[trackedCalls++] ?? E.SO;
  const untrackedRandom = () => values[untrackedCalls++] ?? E.SO;
  const tracked = simulateGame(testGame(), trackedRandom);
  const untracked = simulateGame(testGame(), untrackedRandom, null);
  expect({ ...tracked, highlight: null, lowlight: null }).toEqual(untracked);
  expect(trackedCalls).toBe(untrackedCalls);
 });
 it('starts extra innings with empty bases and produces a real winner', () => {
  const game = simulateGame(testGame(), scripted([...Array<number>(54).fill(E.SO), E.HR]));
  expect(game.home.innings).toHaveLength(10);
  expect(game.away.innings[9]).toBe(1);
  expect(game).toMatchObject({ challengeRuns: 0, opponentRuns: 1, win: false });
 });
 it('fails the PA safety bound rather than manufacturing a result', () => {
  const input = testGame();
  input.limits = { maxPA: 5 };
  expect(() => simulateGame(input, () => E.HR)).toThrow('plate appearances');
 });
 it('fails the innings safety bound rather than breaking a tie', () => {
  const input = testGame();
  input.limits = { maxInnings: 9 };
  expect(() => simulateGame(input, () => E.SO)).toThrow('without a winner');
 });
});
