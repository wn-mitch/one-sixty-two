import { describe, expect, it } from 'vitest';
import { battingEvents, matchupRates, normalize, pitchingEvents, prepareRates } from './rates.ts';
import type { BattingCounts, Rates } from '../game/types.ts';

const league: Rates = [0.08, 0.01, 0.22, 0.14, 0.045, 0.005, 0.03, 0.47];
const closeRates = (actual: Rates, expected: Rates): void => { for (let i = 0; i < 8; i++) expect(actual[i]).toBeCloseTo(expected[i], 12); };

describe('common-environment categorical rates', () => {
 it('preserves average against average and either side against average', () => {
  const strong = normalize([0.12, 0.01, 0.18, 0.16, 0.055, 0.005, 0.05, 0.42]);
  closeRates(matchupRates(league, league, league), league);
  closeRates(matchupRates(strong, league, league), strong);
  closeRates(matchupRates(league, strong, league), strong);
 });
 it('translates a source-average profile to the target, using the matching source prior', () => {
  const source = normalize([10, 1, 12, 18, 4, 1, 2, 52]);
  closeRates(prepareRates(source.map(value => value * 500) as Rates, source, league), league);
  closeRates(prepareRates(league.map(value => value * 500) as Rates, league, league), league);
 });
 it('shrinks by exactly one hundred opportunities before park normalization', () => {
  const events: Rates = [10, 1, 30, 15, 5, 1, 8, 30];
  const expected = normalize(events.map((value, index) => (value + 100 * league[index]) / 200));
  closeRates(prepareRates(events, league, league), expected);
  const hitterPark = prepareRates(events, league, league, 1.2);
  expect(hitterPark[6] / hitterPark[0]).toBeCloseTo(expected[6] / expected[0] / 1.2, 12);
 });
 it('derives singles and ordinary outs without double counting hits', () => {
  const batting: BattingCounts = { AB: 100, H: 30, doubles: 5, triples: 2, HR: 3, BB: 10, HBP: 1, SO: 20, SH: 1, SF: 2, SB: 1, CS: 0, GIDP: 1, PA: 114 };
  expect(battingEvents(batting)).toEqual([10, 1, 20, 20, 5, 2, 3, 53]);
  expect(() => battingEvents({ ...batting, H: 2 })).toThrow('Invalid derived');
 });
 it('infers allowed doubles and triples using source-league non-HR hit proportions', () => {
  const counts = { G: 10, GS: 10, IPouts: 180, H: 50, HR: 10, BB: 20, HBP: 2, SO: 60, BFP: 250, ER: 10, SV: 0 };
  expect(pitchingEvents(counts, [0.75, 0.2, 0.05])).toEqual([20, 2, 60, 30, 8, 2, 10, 118]);
  expect(() => pitchingEvents({ ...counts, BFP: 50 }, [0.75, 0.2, 0.05])).toThrow('Invalid derived');
 });
 it('rejects invalid distributions and zero-rate league denominators', () => {
  expect(() => normalize([0, 0, 0, 0, 0, 0, 0, 0])).toThrow('Empty event');
  expect(() => normalize([-1, 0, 0, 0, 0, 0, 0, 1])).toThrow('Invalid event');
  expect(() => prepareRates(league, [0, ...league.slice(1)] as Rates, league)).toThrow('Invalid league');
  expect(() => prepareRates(league, league, league, 0)).toThrow('Invalid league');
 });
});
