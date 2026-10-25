import { describe, expect, it, vi } from 'vitest';
import { simulateLeagueSegment } from '../engine/node.ts';
import type { Profile } from '../game/types.ts';
import { LEAGUE_CHAPTERS } from '../sim/league-types.ts';
import { leagueProfile, testLeagueData } from '../sim/test-fixtures.ts';
import { decreeAt, decreeCalendar, DECREES, segmentDecree } from './decrees.ts';
import { RIVALS } from './franchises.ts';
import { segmentInput, startLeague } from './league.ts';
import { applyAction, newRunSetup, startRun, type RunData } from './run.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';
import type { DraftSlot } from './types.ts';

vi.setConfig({ testTimeout: 120_000 });

const FRANCHISES = Object.keys(RIVALS);
const DATA: RunData = { cards: testUniverse(120), franchiseIds: FRANCHISES, parkFit: () => 0 };

describe('decree calendar', () => {
 it('draws six different decrees per run from the seed, any of them first', () => {
  const calendar = decreeCalendar(7);
  expect(calendar).toHaveLength(LEAGUE_CHAPTERS);
  expect(new Set(calendar.map(decree => decree.id)).size).toBe(LEAGUE_CHAPTERS);
  expect(decreeCalendar(7)).toEqual(calendar);
  expect(decreeAt(7, 4)).toBe(calendar[4]);
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(segment => segmentDecree(7, segment).id)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2].map(chapter => calendar[chapter].id));
  const openings = new Set(Array.from({ length: 200 }, (_, seed) => decreeAt(seed, 0).id));
  expect(openings).toEqual(new Set(DECREES.map(decree => decree.id)));
 });
});

describe('decree rules in play', () => {
 const run = startRun(newRunSetup(23, 'SEA', 'test-data'), DATA);
 playDraft(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 const season = startLeague(run);
 const profiles = new Map<string, Profile>();
 season.lineups.forEach(lineup => {
  for (const [slot, id] of Object.entries(lineup.active)) profiles.set(id, leagueProfile(id, slot as DraftSlot, run.pool.ledger.cards.get(id)!.eligibleSlots));
 });
 const data = testLeagueData(FRANCHISES);
 const names = run.seating.seats.map(id => `Club ${id}`);

 it('sends the chapter decree to the engine, which plays every game under it', () => {
  expect(segmentInput(run, season, profiles, data, names).rules).toEqual(decreeAt(23, 0).rules);
  for (const decree of DECREES) {
   const input = { ...segmentInput(run, season, profiles, data, names), rules: { ...decree.rules } };
   const { detailGames } = simulateLeagueSegment(input);
   expect(detailGames).toHaveLength(9);
   for (const game of detailGames) {
    const halves = (box: typeof game.home) => box.innings.filter(runs => runs !== null).length;
    // Regulation length, with extras only from a tie.
    expect(game.away.innings.length, decree.name).toBeGreaterThanOrEqual(decree.rules.innings);
    // Every top half is played to its last out, so the home staff records exactly that many.
    expect(game.home.pitching.reduce((sum, line) => sum + line.outs, 0), decree.name).toBe(decree.rules.outs * halves(game.away));
    if (decree.rules.singlesOnly) {
     for (const line of [...game.home.batting, ...game.away.batting]) expect(line.doubles + line.triples + line.HR + line.SB + line.CS, decree.name).toBe(0);
    }
   }
  }
 });
});
