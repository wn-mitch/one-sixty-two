import { describe, expect, it } from 'vitest';
import type { LeagueGame } from '../sim/league-types.ts';
import { afterSegment, BASE_EDGE, crowd, EXPECTATION_DRIFT, fill, openingFans, payday, paydayTotal, priors, SALARY, winBonus, type FanState } from './fans.ts';

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
  expect(payday(0, SEATS, hot, next).attendance).toBeGreaterThan(payday(0, SEATS, start, next).attendance);
  expect(payday(0, SEATS, cold, next).attendance).toBeLessThan(payday(0, SEATS, start, next).attendance);
  // A euphoric house out-earns a hostile one on the same games.
  expect(paydayTotal(payday(0, SEATS, fansAt(1), next))).toBeGreaterThan(paydayTotal(payday(0, SEATS, fansAt(-1), next)));
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

 it('swings sentiment on rival games and draws bigger crowds for them', () => {
  const start = openingFans(.5);
  const record = { wins: 5, games: 9 };
  expect(afterSegment(0, SEATS, start, segment(0, 1, 5), record).sentiment).toBeGreaterThan(afterSegment(0, SEATS, start, segment(0, 2, 5), record).sentiment);
  expect(afterSegment(0, SEATS, start, segment(0, 1, 0), { wins: 0, games: 9 }).sentiment).toBeLessThan(afterSegment(0, SEATS, start, segment(0, 2, 0), { wins: 0, games: 9 }).sentiment);
  expect(payday(0, SEATS, start, segment(0, 1, 5)).attendance).toBeGreaterThan(payday(0, SEATS, start, segment(0, 2, 5)).attendance);
 });

 it('pays a salary every stop, and pays each win more the wider its margin, up to a cap', () => {
  expect(winBonus(1)).toBeCloseTo(.7);
  expect(winBonus(3)).toBeGreaterThan(winBonus(2));
  expect(winBonus(5)).toBeCloseTo(1.7);
  expect(winBonus(12)).toBe(winBonus(5));
  // Nine road games: no gate, but the salary and the win bonus still arrive.
  const road = Array.from({ length: 9 }, (_, matchday) => ({ matchday, home: 2, away: 0, homeRuns: 1, awayRuns: matchday < 5 ? 9 : 0 }));
  const paid = payday(0, SEATS, openingFans(.5), road);
  expect(paid).toMatchObject({ salary: SALARY, gate: 0, homeGames: 0, wins: 5, winBonus: Math.round(5 * winBonus(8)) });
  // Same record, same crowd: blowout wins out-earn one-run wins.
  const close = Array.from({ length: 9 }, (_, matchday) => ({ matchday, home: 2, away: 0, homeRuns: matchday < 5 ? 1 : 3, awayRuns: 2 }));
  expect(paydayTotal(paid)).toBeGreaterThan(paydayTotal(payday(0, SEATS, openingFans(.5), close)));
  expect(payday(0, SEATS, openingFans(.5), close).wins).toBe(5);
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
