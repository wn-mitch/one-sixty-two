import { describe, expect, it } from 'vitest';
import type { Profile } from '../game/types.ts';
import { contactTargets } from '../sim/contact-profile.ts';
import { leagueProfile } from '../sim/test-fixtures.ts';
import { validateProfile } from '../sim/validation.ts';
import { BASIC_GAIN, canTrain, CEILINGS, CROSS_PENALTY, DH_GLOVE, developed, gloveGrade, HOT_GAIN, learnable, learnedGlove, train, woba, type TrainingKind, type Upgrade } from './training.ts';

const hitter = () => leagueProfile('hitter', 'SS', ['SS', '2B']);
const starter = () => leagueProfile('starter', 'SP1', ['SP1', 'SP2', 'SP3']);
const reliever = () => leagueProfile('reliever', 'CL', ['CL']);
const repeat = (profile: Profile, kind: TrainingKind, times: number) => Array.from({ length: times }).reduce<Profile>(card => train(card, kind), profile);
const sumOf = (rates: readonly number[]) => rates.reduce((total, rate) => total + rate, 0);

describe('training effects', () => {
 it('closes 15% of the hitting gap to the elite ceiling, less each time, keeping the hitter\'s own mix', () => {
  const card = hitter();
  const once = train(card, 'hitting');
  const before = woba(card.battingRates!);
  expect(woba(once.battingRates!) - before).toBeCloseTo(BASIC_GAIN * (CEILINGS.battingWoba - before), 6);
  const twice = train(once, 'hitting');
  expect(woba(twice.battingRates!) - woba(once.battingRates!)).toBeLessThan(woba(once.battingRates!) - before);
  // The on-base mix keeps its shape: homers stay the same share of times on base.
  const share = (rates: readonly number[]) => rates[6] / (rates[0] + rates[1] + rates[3] + rates[4] + rates[5] + rates[6]);
  expect(share(once.battingRates!)).toBeCloseTo(share(card.battingRates!), 9);
  expect(sumOf(once.battingRates!)).toBeCloseTo(1, 12);
  // Many trainings approach the ceiling and never pass it.
  expect(woba(repeat(card, 'hitting', 60).battingRates!)).toBeLessThanOrEqual(CEILINGS.battingWoba + 1e-9);
  // The trained card is still a valid engine profile, contact targets included.
  validateProfile(once);
  expect(once.contact!.batting).toEqual(contactTargets(once.battingRates!));
  expect(card.battingRates).toEqual(hitter().battingRates);
 });

 it('lowers what a pitcher allows, and the specials move only their own outcomes', () => {
  const card = starter();
  const better = train(card, 'pitching');
  expect(woba(better.pitchingRates!)).toBeLessThan(woba(card.pitchingRates!));
  validateProfile(better);
  const strikeouts = train(card, 'strikeout');
  expect(strikeouts.pitchingRates![2]).toBeGreaterThan(card.pitchingRates![2]);
  expect(strikeouts.pitchingRates![0]).toBe(card.pitchingRates![0]);
  const control = train(card, 'control');
  expect(control.pitchingRates![0]).toBeLessThan(card.pitchingRates![0]);
  const park = train(card, 'keepInPark');
  expect(park.pitchingRates![6]).toBeLessThan(card.pitchingRates![6]);
  expect(park.pitchingRates![7]).toBeGreaterThan(card.pitchingRates![7]);
  const bat = hitter();
  expect(train(bat, 'power').battingRates![6]).toBeGreaterThan(bat.battingRates![6]);
  expect(train(bat, 'eye').battingRates![0]).toBeGreaterThan(bat.battingRates![0]);
  expect(train(bat, 'contact').battingRates![2]).toBeLessThan(bat.battingRates![2]);
  for (const kind of ['power', 'eye', 'contact'] as const) expect(sumOf(train(bat, kind).battingRates!)).toBeCloseTo(1, 12);
 });

 it('raises fielding at every position the card plays, baserunning, and a starter\'s depth', () => {
  const card = hitter();
  const fielded = train(card, 'fielding');
  for (const position of ['SS', '2B'] as const) expect(fielded.defense.positions[position]!.hitPrevention).toBeGreaterThan(card.defense.positions[position]!.hitPrevention);
  const runner = train(card, 'baserunning');
  expect(runner.speed).toBeGreaterThan(card.speed);
  expect(runner.stealSuccess).toBeGreaterThanOrEqual(card.stealSuccess);
  const arm = starter();
  const deeper = train(arm, 'stamina');
  expect(deeper.pitching!.IPouts / deeper.pitching!.GS).toBeGreaterThan(arm.pitching!.IPouts / arm.pitching!.GS);
  expect(repeat(arm, 'stamina', 40).pitching!.IPouts / arm.pitching!.GS).toBeLessThanOrEqual(CEILINGS.starterOuts + 1e-9);
 });

 it('offers each training only to cards it fits, and recovery once', () => {
  expect(canTrain(hitter(), 'hitting')).toBe(true);
  expect(canTrain(hitter(), 'pitching')).toBe(false);
  expect(canTrain(starter(), 'stamina')).toBe(true);
  expect(canTrain(reliever(), 'stamina')).toBe(false);
  expect(canTrain(reliever(), 'recovery')).toBe(true);
  expect(canTrain(reliever(), 'recovery', [{ cardId: 'reliever', kind: 'recovery', stop: 1, paidBy: 0, cost: 12 }])).toBe(false);
  expect(canTrain(starter(), 'hitting')).toBe(false);
 });

 it('keeps lasting upgrades from their stop on, and a hot streak for its own nine games only', () => {
  const card = hitter();
  const upgrades: Upgrade[] = [
   { cardId: 'hitter', kind: 'hitting', stop: 2, paidBy: 3, cost: 10 },
   { cardId: 'hitter', kind: 'hotBat', stop: 4, paidBy: 3, cost: 8 },
   { cardId: 'someone-else', kind: 'hitting', stop: 0, paidBy: 3, cost: 10 }
  ];
  expect(developed(card, upgrades, 1)).toEqual(card);
  const trained = developed(card, upgrades, 2);
  expect(trained).toEqual(train(card, 'hitting'));
  expect(developed(card, upgrades, 4)).toEqual(train(trained, 'hotBat'));
  expect(developed(card, upgrades, 5)).toEqual(trained);
  expect(woba(train(card, 'hotBat').battingRates!) - woba(card.battingRates!)).toBeCloseTo(HOT_GAIN * (CEILINGS.battingWoba - woba(card.battingRates!)), 6);
 });
 it('teaches a position at the best glove that leads there less the penalty, twice that moving up, and never catcher', () => {
  const card = train(hitter(), 'fielding');
  const best = Math.max(gloveGrade(card, 'SS'), gloveGrade(card, '2B'));
  // A shortstop and second baseman learns first, third and the corners, but not center or catcher.
  expect(learnable(card)).toEqual(['1B', '3B', 'LF', 'RF']);
  expect(learnedGlove(card, 'C')).toBeNull();
  expect(learnedGlove(card, 'CF')).toBeNull();
  expect(learnedGlove(card, '3B')).toBeCloseTo(best - CROSS_PENALTY, 9);
  const third = train(card, 'crossTraining', 1, '3B');
  expect(third.eligibleSlots).toEqual([...card.eligibleSlots, '3B']);
  expect(gloveGrade(third, '3B')).toBeCloseTo(best - CROSS_PENALTY, 6);
  expect(() => validateProfile(third)).not.toThrow();
  // A learned position trains like any other, and learning one he plays changes nothing.
  expect(gloveGrade(train(third, 'fielding'), '3B')).toBeGreaterThan(gloveGrade(third, '3B'));
  expect(train(third, 'crossTraining', 1, '3B')).toBe(third);
  // Moving up the spectrum costs twice as much.
  const second = leagueProfile('second', '2B', ['2B', 'DH']);
  expect(learnedGlove(second, 'SS')).toBeCloseTo(Math.max(0, gloveGrade(second, '2B') - 2 * CROSS_PENALTY), 9);
  const corner = leagueProfile('corner', 'LF', ['LF']);
  expect(learnedGlove(corner, 'CF')).toBeCloseTo(Math.max(0, gloveGrade(corner, 'LF') - 2 * CROSS_PENALTY), 9);
  // A designated hitter learns only the easy spots, from a below-average glove.
  const dh = leagueProfile('dh', 'DH', ['DH']);
  expect(learnable(dh)).toEqual(['1B', 'LF', 'RF']);
  expect(gloveGrade(train(dh, 'crossTraining', 1, 'LF'), 'LF')).toBeCloseTo(DH_GLOVE - CROSS_PENALTY, 6);
  expect(canTrain(dh, 'crossTraining')).toBe(true);
  expect(canTrain(starter(), 'crossTraining')).toBe(false);
  expect(canTrain(reliever(), 'crossTraining')).toBe(false);
 });
});
