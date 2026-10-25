import { describe, expect, it } from 'vitest';
import type { Profile } from '../game/types.ts';
import { leagueProfile, testLeagueData } from '../sim/test-fixtures.ts';
import { memoryDb } from '../storage/test-db.ts';
import { RIVALS } from './franchises.ts';
import { segmentInput, startLeague, type LeagueSeason } from './league.ts';
import { applyAction, newRunSetup, startRun, type DraftRun, type RunData } from './run.ts';
import { getRun, resumeRun, saveRun } from './saves.ts';
import { aiShop, buyTraining, offersAt, refusal, ShopError, specialsAt } from './shop.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';
import { canTrain, train, TRAININGS } from './training.ts';
import type { DraftSlot } from './types.ts';

const FRANCHISES = Object.keys(RIVALS);
const DATA: RunData = { cards: testUniverse(120), franchiseIds: FRANCHISES, parkFit: () => 0 };
const setup = newRunSetup(41, 'CHC', 'test-data');

function seasonStart(): { run: DraftRun; season: LeagueSeason; profiles: Map<string, Profile> } {
 const run = startRun(setup, DATA);
 playDraft(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 const season = startLeague(run);
 const profiles = new Map<string, Profile>();
 season.lineups.forEach(lineup => {
  for (const [slot, id] of Object.entries(lineup.active)) profiles.set(id, leagueProfile(id, slot as DraftSlot, run.pool.ledger.cards.get(id)!.eligibleSlots));
  for (const id of lineup.reserves) { const card = run.pool.ledger.cards.get(id)!; profiles.set(id, leagueProfile(id, card.eligibleSlots[0] as DraftSlot, card.eligibleSlots)); }
 });
 return { run, season, profiles };
}

describe('training shop', () => {
 it('offers the four basics and two seeded specials that change from stop to stop', () => {
  const offers = offersAt(41, 3);
  expect(offers.slice(0, 4)).toEqual(['hitting', 'pitching', 'fielding', 'baserunning']);
  expect(new Set(offers.slice(4)).size).toBe(2);
  expect(specialsAt(41, 3)).toEqual(specialsAt(41, 3));
  expect(new Set(Array.from({ length: 18 }, (_, stop) => specialsAt(41, stop).join())).size).toBeGreaterThan(5);
 });

 it('sells one training per card per visit from banked cash, reserves included, and refuses the rest with a reason', () => {
  const { run, season, profiles } = seasonStart();
  const human = run.seating.humanSeat;
  const lineup = season.lineups[human];
  const hitter = profiles.get(lineup.active.SS)!;
  // Opening day: nothing banked yet.
  expect(refusal(run, season, human, hitter, 'hitting')).toBe('Not enough cash');
  season.cash[human] = 25;
  buyTraining(run, season, human, hitter, 'hitting');
  expect(season.cash[human]).toBe(15);
  expect(season.upgrades).toEqual([{ cardId: hitter.seasonId, kind: 'hitting', stop: 0, paidBy: human, cost: TRAININGS.hitting.price }]);
  expect(() => buyTraining(run, season, human, hitter, 'baserunning')).toThrow(/already trained at this stop/);
  // An unused reserve trains with no playing-time requirement.
  const reserve = profiles.get(lineup.reserves[0])!;
  const kind = canTrain(reserve, 'hitting') ? 'hitting' : 'pitching';
  buyTraining(run, season, human, reserve, kind);
  expect(season.cash[human]).toBe(5);
  expect(() => buyTraining(run, season, human, profiles.get(lineup.active.C)!, 'hitting')).toThrow(ShopError);
  season.cash[human] = 100;
  expect(refusal(run, season, human, profiles.get(lineup.active.SP1)!, 'hitting')).toMatch(/does not apply/);
  const rival = profiles.get(season.lineups[(human + 1) % 8].active.SS)!;
  expect(refusal(run, season, human, rival, 'hitting')).toMatch(/not on this roster/);
  const missing = (['power', 'eye', 'contact', 'hotBat'] as const).find(special => !specialsAt(41, 0).includes(special))!;
  expect(refusal(run, season, human, profiles.get(lineup.active.C)!, missing)).toMatch(/not on offer/);
 });

 it('has AI clubs buy basics once a stop within their cash, and plays every club with its training in force', () => {
  const { run, season, profiles } = seasonStart();
  const human = run.seating.humanSeat;
  season.cash = season.cash.map(() => 35);
  aiShop(run, season, profiles);
  const bought = season.upgrades.length;
  expect(bought).toBeGreaterThan(0);
  expect(season.upgrades.every(upgrade => upgrade.paidBy !== human && (upgrade.kind === 'hitting' || upgrade.kind === 'pitching'))).toBe(true);
  for (let seat = 0; seat < 8; seat++) if (seat !== human) expect(season.cash[seat]).toBe(35 - 10 * season.upgrades.filter(upgrade => upgrade.paidBy === seat).length);
  expect(season.cash.every(cash => cash >= 0)).toBe(true);
  aiShop(run, season, profiles);
  expect(season.upgrades).toHaveLength(bought);
  // The engine sees each trained card as trained, and a quick-recovery reliever by id.
  const reliever = profiles.get(season.lineups[human].active.CL)!;
  season.cash[human] = 50;
  buyTraining(run, season, human, reliever, 'pitching');
  season.upgrades.push({ cardId: reliever.seasonId, kind: 'recovery', stop: 0, paidBy: human, cost: 12 });
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  const club = input.clubs[human];
  expect(club.roster.find(pick => pick.slot === 'CL')!.profile).toEqual(train(reliever, 'pitching'));
  expect(club.quickRecovery).toEqual([reliever.seasonId]);
  const upgraded = season.upgrades[0];
  const owner = season.lineups.findIndex(lineup => Object.values(lineup.active).includes(upgraded.cardId));
  expect(input.clubs[owner].roster.find(pick => pick.profile.seasonId === upgraded.cardId)!.profile).toEqual(train(profiles.get(upgraded.cardId)!, upgraded.kind));
 });

 it('keeps upgrades, their payers and the bank through a save and resume', async () => {
  const { run, season, profiles } = seasonStart();
  const human = run.seating.humanSeat;
  season.cash[human] = 30;
  buyTraining(run, season, human, profiles.get(season.lineups[human].active.CF)!, 'fielding');
  const { db } = await memoryDb();
  await saveRun(db, 'run', run, season);
  const resumed = resumeRun((await getRun(db, 'run'))!, DATA, 'test-data');
  if (!resumed.ok) throw new Error(resumed.reason);
  expect(resumed.season!.upgrades).toEqual(season.upgrades);
  expect(resumed.season!.cash).toEqual(season.cash);
 });
});
