import { describe, expect, it } from 'vitest';
import type { Profile } from '../game/types.ts';
import { simulateLeagueSegment } from '../engine/node.ts';
import { leagueProfile, testLeagueData } from '../sim/test-fixtures.ts';
import { payday, type FanState } from './fans.ts';
import { RIVALS } from './franchises.ts';
import { segmentInput, startLeague, type LeagueSeason } from './league.ts';
import { PACKAGES } from './packages.ts';
import { effectiveCap, validateBudget } from './rules.ts';
import { applyAction, newRunSetup, startRun, type DraftRun, type RunData } from './run.ts';
import { buyTraining, gainScale, offersFor, priceFor } from './shop.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';
import { developed } from './training.ts';
import type { DraftSlot } from './types.ts';

const FRANCHISES = [...new Set([...Object.keys(RIVALS), ...Object.keys(PACKAGES)])];
const DATA: RunData = { cards: testUniverse(160), franchiseIds: FRANCHISES, parkFit: () => 0 };

function seasonFor(franchiseId: string): { run: DraftRun; season: LeagueSeason; profile: (id: string) => Profile } {
 const run = startRun(newRunSetup(29, franchiseId, 'test-data'), DATA);
 playDraft(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 const season = startLeague(run);
 season.cash = season.cash.map(() => 100);
 const profile = (id: string) => {
  const card = run.pool.ledger.cards.get(id)!;
  return leagueProfile(id, (card.eligibleSlots.find(slot => slot !== 'DH') ?? card.eligibleSlots[0]) as DraftSlot, card.eligibleSlots);
 };
 return { run, season, profile };
}

describe('franchise packages', () => {
 it('sends each franchise\'s park condition to the engine for its home games', () => {
  const { run, season, profile } = seasonFor('COL');
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  input.clubs.forEach((club, seat) => expect(club.parkPackage).toBe(PACKAGES[run.seating.seats[seat]]?.park ?? null));
  expect(input.clubs[run.seating.humanSeat].parkPackage).toBe('thinAir');
  const plain = simulateLeagueSegment({ ...input, clubs: input.clubs.map(club => ({ ...club, parkPackage: null })) });
  const thin = simulateLeagueSegment(input);
  // Same seeds and rosters: only the packaged parks' games can change.
  const changed = thin.games.filter((game, index) => game.homeRuns !== plain.games[index].homeRuns || game.awayRuns !== plain.games[index].awayRuns);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every(game => input.clubs[game.home].parkPackage !== null)).toBe(true);
 });

 it('moves each franchise\'s cap by its share of the table cap, always leaving room for a roster of commons', () => {
  for (const franchiseId of ['ATL', 'BAL', 'OAK', 'SEA']) {
   const run = startRun(newRunSetup(29, franchiseId, 'test-data'), DATA);
   const seat = run.seating.humanSeat;
   const share = PACKAGES[franchiseId]?.capShare ?? 0;
   expect(effectiveCap(run.budgets[seat])).toBe(run.pool.tableCap + Math.round(run.pool.tableCap * share));
   expect(validateBudget(run.budgets[seat], run.pool.rules)).toEqual([]);
  }
 });

 it('prices training for the Athletics a quarter lower and charges that price', () => {
  const { run, season, profile } = seasonFor('OAK');
  const human = run.seating.humanSeat;
  expect(priceFor(run, human, 'hitting')).toBe(8);
  expect(priceFor(run, human, 'power')).toBe(11);
  const ss = season.lineups[human].active.SS;
  buyTraining(run, season, human, profile(ss), 'hitting');
  expect(season.cash[human]).toBe(92);
  expect(season.upgrades[0].cost).toBe(8);
 });

 it('gives St. Louis half as much again from fielding, and the gain stays with the card', () => {
  const { run, season, profile } = seasonFor('STL');
  const human = run.seating.humanSeat;
  const id = season.lineups[human].active.SS;
  const printed = profile(id);
  buyTraining(run, season, human, printed, 'fielding');
  expect(season.upgrades[0].scale).toBe(1.5);
  const skill = (card: Profile) => card.defense.positions.SS!.hitPrevention;
  const ceilingGap = .2776 - skill(printed);
  expect(skill(developed(printed, season.upgrades, 0)) - skill(printed)).toBeCloseTo(.15 * 1.5 * ceilingGap, 6);
  // Another club's purchase gains the ordinary amount.
  const plainSeat = run.seating.seats.findIndex((franchiseId, seat) => seat !== human && !PACKAGES[franchiseId]);
  expect(gainScale(run, season, plainSeat, 'fielding')).toBe(1);
 });

 it('offers Texas the strikeout pitch at every stop and boosts it, and scales Detroit by its active commons', () => {
  const texas = seasonFor('TEX');
  const tx = texas.run.seating.humanSeat;
  for (let stop = 0; stop < 18; stop++) expect(offersFor(texas.run, tx, stop)).toContain('strikeout');
  const plain = texas.run.seating.seats.findIndex(franchiseId => franchiseId !== 'TEX');
  expect(Array.from({ length: 18 }, (_, stop) => offersFor(texas.run, plain, stop).includes('strikeout')).every(Boolean)).toBe(false);
  expect(gainScale(texas.run, texas.season, tx, 'strikeout')).toBe(1.5);
  expect(gainScale(texas.run, texas.season, tx, 'strikeout', true)).toBe(2.25);
  const detroit = seasonFor('DET');
  const dt = detroit.run.seating.humanSeat;
  const commons = Object.values(detroit.season.lineups[dt].active).filter(id => { const card = detroit.run.pool.ledger.cards.get(id)!; return card.finish === 'base' && card.salary <= detroit.run.pool.rules.commonSalaryMax; }).length;
  expect(commons).toBeGreaterThan(0);
  expect(gainScale(detroit.run, detroit.season, dt, 'hitting')).toBeCloseTo(1 + Math.min(.4, .05 * commons), 9);
 });

 it('pays Kansas City casino cash for home wins only', () => {
  const fans: FanState = { prior: .5, expectation: .5, sentiment: 0 };
  const seats = ['KCR', 'SEA'];
  const games = [
   { matchday: 0, home: 0, away: 1, homeRuns: 5, awayRuns: 2 },
   { matchday: 1, home: 0, away: 1, homeRuns: 6, awayRuns: 1 },
   { matchday: 2, home: 0, away: 1, homeRuns: 1, awayRuns: 2 },
   { matchday: 3, home: 1, away: 0, homeRuns: 0, awayRuns: 3 },
   { matchday: 4, home: 1, away: 0, homeRuns: 3, awayRuns: 2 }
  ];
  expect(payday(0, seats, fans, games).franchise).toBe(3);
  expect(payday(1, seats, fans, games).franchise).toBe(0);
 });
});
