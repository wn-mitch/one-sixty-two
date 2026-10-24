import { describe, expect, it, vi } from 'vitest';
import { simulateLeagueSegment } from '../engine/node.ts';
import type { Profile } from '../game/types.ts';
import { leagueProfile, testLeagueData } from '../sim/test-fixtures.ts';
import { RIVALS } from './franchises.ts';
import { arrangeRoster, submissionFrom } from './legality.ts';
import { paydayTotal } from './fans.ts';
import { canSwap, LineupError, swapPlaces, matchRivals, recordSegment, seasonLines, seasonStop, segmentInput, setLineup, standings, startLeague, validateLineup, type LeagueSeason } from './league.ts';
import { applyAction, newRunSetup, ownedBy, startRun, type DraftRun, type RunData } from './run.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';
import type { DraftSlot } from './types.ts';

vi.setConfig({ testTimeout: 120_000 });

const FRANCHISES = Object.keys(RIVALS);
const DATA: RunData = { cards: testUniverse(120), franchiseIds: FRANCHISES, parkFit: () => 0 };

/** A run whose player auto-fixes and submits the window. */
function submittedRun(seed: number, franchiseId: string): DraftRun {
 const run = startRun(newRunSetup(seed, franchiseId, 'test-data'), DATA);
 playDraft(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 return run;
}

describe('league rivals', () => {
 it('pairs every seat once, the player with the guaranteed rival', () => {
  for (let seed = 0; seed < 30; seed++) {
   for (const franchise of ['NYM', 'CHC', 'SEA']) {
    const run = startRun(newRunSetup(seed, franchise, 'test-data'), DATA);
    const pairs = matchRivals(run);
    expect(pairs.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(pairs[0][0]).toBe(run.seating.humanSeat);
    if (run.seating.rival) expect(run.seating.seats[pairs[0][1]]).toBe(run.seating.rival);
   }
  }
 });
});

describe('league season', () => {
 const run = submittedRun(11, 'BOS');
 const human = run.seating.humanSeat;

 it('starts with a legal lineup at every seat and refuses lineups that change the cards or break a slot', () => {
  const season = startLeague(run);
  season.lineups.forEach((lineup, seat) => expect(() => validateLineup(run, seat, lineup)).not.toThrow());
  const lineup = structuredClone(season.lineups[human]);
  // A reserve that can field the slot may swap in; the batting order follows the fielders.
  const index = lineup.reserves.findIndex(id => run.pool.ledger.cards.get(id)!.eligibleSlots.includes('DH'));
  expect(index).toBeGreaterThanOrEqual(0);
  expect(canSwap(run, lineup, 'DH', index)).toBe(true);
  const reserve = lineup.reserves[index];
  const benched = lineup.active.DH;
  const swapped = swapPlaces(lineup, 'DH', index);
  expect(swapped.battingOrder.indexOf(reserve)).toBe(lineup.battingOrder.indexOf(benched));
  setLineup(run, season, swapped);
  expect(season.lineups[human].active.DH).toBe(reserve);
  // Fielders trading slots keep their batting spots; a pitcher cannot take a fielder's slot.
  const traded = swapPlaces(swapped, 'LF', 'DH');
  if (canSwap(run, swapped, 'LF', 'DH')) expect(traded.battingOrder).toEqual(swapped.battingOrder);
  expect(canSwap(run, swapped, 'C', 'SP1')).toBe(false);
  const stranger = ownedBy(run, (human + 1) % 8)[0].seasonId;
  expect(() => setLineup(run, season, { ...lineup, reserves: [stranger, lineup.reserves[1]] })).toThrow(LineupError);
  expect(() => setLineup(run, season, { ...lineup, active: { ...lineup.active, C: lineup.active.SP1, SP1: lineup.active.C } })).toThrow(/cannot play/);
  expect(() => setLineup(run, season, { ...lineup, battingOrder: lineup.battingOrder.slice(1) })).toThrow(/batting order/);
  expect(() => setLineup(run, season, { ...lineup, reliefRoles: lineup.reliefRoles.map(role => ({ ...role, secondary: role.primary })) })).toThrow(/backup role/);
 });

 it('plays nine-game segments through the engine into standings, season lines, fans and cash', () => {
  const season: LeagueSeason = startLeague(run);
  const data = testLeagueData(FRANCHISES);
  const profiles = new Map<string, Profile>();
  season.lineups.forEach(lineup => {
   for (const [slot, id] of Object.entries(lineup.active)) profiles.set(id, leagueProfile(id, slot as DraftSlot, run.pool.ledger.cards.get(id)!.eligibleSlots));
  });
  const names = run.seating.seats.map(id => `Club ${id}`);
  expect(season.cash).toEqual(Array(8).fill(0));
  const opening = structuredClone(season.fans);
  for (let segment = 0; segment < 6; segment++) {
   const input = segmentInput(run, season, profiles, data, names);
   // Each segment plays before the crowds its fans drew at the previous stop.
   expect(input.crowds.every(crowd => crowd.edge > -.4 && crowd.edge < .4)).toBe(true);
   recordSegment(run, season, simulateLeagueSegment(input));
  }
  expect(seasonStop(season)).toEqual({ played: 6, chapter: 2, chapterStop: true, over: false });
  // Every payday is credited once, with the segment it pays for; each club hosted half its games.
  for (let seat = 0; seat < 8; seat++) {
   expect(season.cash[seat]).toBe(season.segments.reduce((sum, segment) => sum + paydayTotal(segment.paydays[seat]), 0));
   expect(season.segments.reduce((sum, segment) => sum + segment.paydays[seat].homeGames, 0)).toBe(season.segments.flatMap(segment => segment.games).filter(game => game.home === seat).length);
  }
  expect(season.fans).not.toEqual(opening);
  expect(season.fans.every((fans, seat) => fans.prior === opening[seat].prior)).toBe(true);
  const table = standings(season);
  expect(table.map(row => row.wins + row.losses)).toEqual(Array(8).fill(54));
  expect(table.reduce((sum, row) => sum + row.wins, 0)).toBe(216);
  expect(table[0].gamesBack).toBe(0);
  expect(table.every((row, index) => index === 0 || row.wins / 54 <= table[index - 1].wins / 54)).toBe(true);
  const lines = seasonLines(season, human);
  const row = table.find(item => item.seat === human)!;
  expect(lines.batting.reduce((sum, line) => sum + line.R, 0)).toBe(row.runsFor);
  expect(lines.pitching.reduce((sum, line) => sum + line.R, 0)).toBe(row.runsAgainst);
  expect(new Set(lines.batting.map(line => line.seasonId)).size).toBe(lines.batting.length);
  const cash = [...season.cash];
  expect(() => recordSegment(run, season, { segment: 0, games: [], totals: [], detailGames: [], carry: [] })).toThrow(/Expected segment 7/);
  expect(season.cash).toEqual(cash);
 });
});
