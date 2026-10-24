import { describe, expect, it } from 'vitest';
import type { LeagueGame } from '../sim/league-types.ts';
import { afterSegment, BASE_EDGE, crowd, EXPECTATION_DRIFT, fill, openingFans, payday, paydayTotal, priors, type FanState } from './fans.ts';

// Seat 0 hosts; seat 1 is a recognized rival (NYM-NYY), seat 2 is not (NYM-SEA).
const SEATS = ['NYM', 'NYY', 'SEA', 'ATL', 'LAD'];
/** Nine games for `seat`, alternating home and away against `opponent`, winning the first `wins`. */
function segment(seat: number, opponent: number, wins: number): LeagueGame[] {
 return Array.from({ length: 9 }, (_, matchday) => {
  const home = matchday % 2 === 0;
  const won = matchday < wins;
  const [ours, theirs] = won ? [5, 2] : [2, 5];
  return home ? { matchday, home: seat, away: opponent, homeRuns: ours, awayRuns: theirs } : { matchday, home: opponent, away: seat, homeRuns: theirs, awayRuns: ours };
 });
}
const fansAt = (sentiment: number, expectation = .5): FanState => ({ prior: .5, expectation, sentiment });

describe('fans', () => {
 it('rewards winning above expectation with fuller stands, a bigger gate and a stronger home lean, and turns on a losing club', () => {
  const start = openingFans(.5);
  const hot = afterSegment(0, SEATS, start, segment(0, 2, 8), { wins: 8, games: 9 });
  const cold = afterSegment(0, SEATS, start, segment(0, 2, 1), { wins: 1, games: 9 });
  expect(hot.sentiment).toBeGreaterThan(0);
  expect(cold.sentiment).toBeLessThan(0);
  expect(fill('NYM', hot)).toBeGreaterThan(fill('NYM', start));
  expect(fill('NYM', cold)).toBeLessThan(fill('NYM', start));
  const next = segment(0, 2, 4);
  expect(paydayTotal(payday(0, SEATS, hot, next))).toBeGreaterThan(paydayTotal(payday(0, SEATS, start, next)));
  expect(paydayTotal(payday(0, SEATS, cold, next))).toBeLessThan(paydayTotal(payday(0, SEATS, start, next)));
  expect(crowd('NYM', hot).edge).toBeGreaterThan(crowd('NYM', start).edge);
  expect(crowd('NYM', start).edge).toBeGreaterThan(BASE_EDGE);
  // A hostile crowd turns its own share of the lean against its club.
  expect(crowd('NYM', fansAt(-1)).edge).toBeLessThan(BASE_EDGE);
  expect(crowd('NYM', fansAt(1)).volatility).toBeGreaterThan(crowd('NYM', fansAt(-1)).volatility);
 });

 it('judges results against expectations: a favorite going 5-4 sours, an underdog going 5-4 cheers', () => {
  const games = segment(0, 2, 5);
  expect(afterSegment(0, SEATS, fansAt(0, .62), games, { wins: 5, games: 9 }).sentiment).toBeLessThan(0);
  expect(afterSegment(0, SEATS, fansAt(0, .4), games, { wins: 5, games: 9 }).sentiment).toBeGreaterThan(0);
 });

 it('moves expectations slowly, then all at once', () => {
  const fans = fansAt(0, .5);
  const drift = afterSegment(0, SEATS, fans, segment(0, 2, 5), { wins: 10, games: 18 });
  expect(drift.expectation).toBeCloseTo(.5 + EXPECTATION_DRIFT * (10 / 18 - .5), 4);
  const reset = afterSegment(0, SEATS, fans, segment(0, 2, 7), { wins: 13, games: 18 });
  expect(reset.expectation).toBeCloseTo(13 / 18, 4);
  // Too early in the season for a reset: the same gap only drifts.
  expect(afterSegment(0, SEATS, fans, segment(0, 2, 7), { wins: 7, games: 9 }).expectation).toBeLessThan(.6);
 });

 it('swings sentiment on rival games and draws a bigger gate for them', () => {
  const start = openingFans(.5);
  const record = { wins: 5, games: 9 };
  expect(afterSegment(0, SEATS, start, segment(0, 1, 5), record).sentiment).toBeGreaterThan(afterSegment(0, SEATS, start, segment(0, 2, 5), record).sentiment);
  expect(afterSegment(0, SEATS, start, segment(0, 1, 0), { wins: 0, games: 9 }).sentiment).toBeLessThan(afterSegment(0, SEATS, start, segment(0, 2, 0), { wins: 0, games: 9 }).sentiment);
  expect(payday(0, SEATS, start, segment(0, 1, 5)).gate).toBeGreaterThan(payday(0, SEATS, start, segment(0, 2, 5)).gate);
 });

 it('applies franchise crowds: Atlanta leans less, fair-weather LA swings harder, and payroll sets the prior', () => {
  const fans = fansAt(.5);
  expect(crowd('ATL', fans).edge).toBeLessThan(crowd('SEA', fans).edge);
  const hot = segment(4, 2, 8);
  expect(afterSegment(4, SEATS, openingFans(.5), hot, { wins: 8, games: 9 }).sentiment).toBeGreaterThan(afterSegment(2, SEATS, openingFans(.5), segment(2, 4, 8), { wins: 8, games: 9 }).sentiment);
  const [rich, middle, poor] = priors(['SEA', 'SEA', 'SEA'], [300, 200, 100]);
  expect(rich).toBeGreaterThan(middle);
  expect(middle).toBeCloseTo(.5, 4);
  expect(poor).toBeLessThan(middle);
  expect(priors(['BAL', 'SEA'], [200, 200])[0]).toBeLessThan(.5);
 });
});
