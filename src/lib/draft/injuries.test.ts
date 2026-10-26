import { describe, expect, it, vi } from 'vitest';
import { simulateLeagueSegment } from '../engine/node.ts';
import type { Profile } from '../game/types.ts';
import { leagueProfile, testLeagueData } from '../sim/test-fixtures.ts';
import { memoryDb } from '../storage/test-db.ts';
import { isCommon } from './cleanup.ts';
import { RIVALS } from './franchises.ts';
import { availability, BASE_RISK, ESCALATION, fieldedLineup, hurt, INJURY_FLOORS, pushRefusal, pushRisk, resolvePushes, takePush, type Push } from './injuries.ts';
import { recordSegment, segmentInput, startLeague, type LeagueSeason } from './league.ts';
import { canFill } from './rules.ts';
import { applyAction, newRunSetup, startRun, type DraftRun, type RunData } from './run.ts';
import { getRun, resumeRun, saveRun } from './saves.ts';
import { aiShop, buyTraining } from './shop.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';
import { developed, woba } from './training.ts';
import type { DraftSlot } from './types.ts';

vi.setConfig({ testTimeout: 120_000 });

const FRANCHISES = Object.keys(RIVALS);
const DATA: RunData = { cards: testUniverse(160), franchiseIds: FRANCHISES, parkFit: () => 0 };
const setup = newRunSetup(61, 'TEX', 'test-data');

function seasonStart(): { run: DraftRun; season: LeagueSeason; profiles: Map<string, Profile> } {
 const run = startRun(setup, DATA);
 playDraft(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 const season = startLeague(run);
 return { run, season, profiles: profilesFor(run, run.pool.ledger.cards.keys()) };
}

/** Synthetic engine profiles for every card, each at its first eligible slot. */
function profilesFor(run: DraftRun, ids: Iterable<string>): Map<string, Profile> {
 const profiles = new Map<string, Profile>();
 for (const id of ids) {
  const card = run.pool.ledger.cards.get(id)!;
  const slot = card.eligibleSlots.find(item => item !== 'DH') ?? card.eligibleSlots[0];
  profiles.set(id, leagueProfile(id, slot as DraftSlot, card.eligibleSlots));
 }
 return profiles;
}

const injure = (season: LeagueSeason, seat: number, cardId: string, severity: 'minor' | 'major') =>
 season.injuries.push({ seat, cardId, segment: season.segments.length, severity, cause: 'ride' });

describe('push risk', () => {
 it('starts at one in eight, rises one in sixteen per earlier push on the card this chapter, and resets the next chapter', () => {
  const { run, season } = seasonStart();
  const human = run.seating.humanSeat;
  const ace = season.lineups[human].active.SP1;
  expect(pushRisk(season, ace)).toBe(BASE_RISK);
  takePush(run, season, human, ace, 'ride');
  expect(season.pushes[0].risk).toBe(BASE_RISK);
  expect(pushRisk(season, ace)).toBe(BASE_RISK + ESCALATION);
  expect(pushRisk(season, season.lineups[human].active.SP2)).toBe(BASE_RISK);
  // A push from an earlier chapter no longer counts.
  season.pushes[0].stop = -3;
  expect(pushRisk(season, ace)).toBe(BASE_RISK);
 });

 it('injures at the disclosed rate, a quarter of the time seriously, for the following segment', () => {
  const { run, season } = seasonStart();
  const pushes: Push[] = Array.from({ length: 4000 }, (_, index) => ({ seat: 0, cardId: `card-${index}`, kind: 'ride', stop: 2, risk: BASE_RISK }));
  season.pushes = pushes;
  resolvePushes(run, season, 2);
  const rate = season.injuries.length / pushes.length;
  expect(rate).toBeGreaterThan(.11);
  expect(rate).toBeLessThan(.14);
  const major = season.injuries.filter(injury => injury.severity === 'major').length / season.injuries.length;
  expect(major).toBeGreaterThan(.2);
  expect(major).toBeLessThan(.3);
  expect(season.injuries.every(injury => injury.segment === 3)).toBe(true);
  // The same pushes roll the same injuries.
  const again = structuredClone(season);
  again.injuries = [];
  resolvePushes(run, again, 2);
  expect(again.injuries).toEqual(season.injuries);
  // Playing through an injury can only make it worse.
  season.injuries = [];
  season.pushes = pushes.map(push => ({ ...push, kind: 'playThrough' }));
  resolvePushes(run, season, 2);
  expect(season.injuries.length).toBeGreaterThan(0);
  expect(season.injuries.every(injury => injury.severity === 'major')).toBe(true);
 });

 it('offers each push only where it means something', () => {
  const { run, season } = seasonStart();
  const human = run.seating.humanSeat;
  const { active, reliefRoles } = season.lineups[human];
  const middle = reliefRoles.find(role => role.primary === 'middle')!.slot;
  expect(pushRefusal(run, season, human, active.CL, 'ride')).toMatch(/starter/);
  expect(pushRefusal(run, season, human, active[middle], 'skipRest')).toMatch(/closer or setup/);
  expect(pushRefusal(run, season, human, active.CL, 'skipRest')).toBeNull();
  expect(pushRefusal(run, season, human, active.SP1, 'playThrough')).toMatch(/minor injury/);
  expect(pushRefusal(run, season, human, season.lineups[(human + 1) % 8].active.SP1, 'ride')).toMatch(/not on this roster/);
  injure(season, human, active.SP1, 'major');
  expect(pushRefusal(run, season, human, active.SP1, 'ride')).toMatch(/injured/);
  expect(pushRefusal(run, season, human, active.SP1, 'playThrough')).toMatch(/minor injury/);
 });
});

describe('injured cards in play', () => {
 it('covers an absence with a reserve who can play the slot, else distinct emergency call-ups', () => {
  const { run, season } = seasonStart();
  const human = run.seating.humanSeat;
  const lineup = season.lineups[human];
  const card = (id: string) => run.pool.ledger.cards.get(id)!;
  const hitterSlot = (['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const).find(slot => lineup.reserves.some(id => canFill(card(id), slot)))!;
  expect(hitterSlot).toBeDefined();
  const benched = lineup.active[hitterSlot];
  for (const slot of [hitterSlot, 'CL', 'RP1', 'RP2'] as const) injure(season, human, lineup.active[slot], 'major');
  const { lineup: fielded, substitutions } = fieldedLineup(run, season, human, 0);
  const reserve = substitutions.find(sub => sub.slot === hitterSlot)!;
  expect(reserve.callUp).toBe(false);
  expect(lineup.reserves).toContain(reserve.in);
  expect(fielded.battingOrder.indexOf(reserve.in)).toBe(lineup.battingOrder.indexOf(benched));
  expect(fielded.reserves).toContain(benched);
  const callUps = substitutions.filter(sub => sub.callUp).map(sub => sub.in);
  // Reserves may cover some relief slots; the rest are distinct unowned commons who can close.
  expect(new Set(callUps).size).toBe(callUps.length);
  for (const id of callUps) {
   expect(isCommon(card(id))).toBe(true);
   expect(run.pool.ledger.instances.has(id)).toBe(false);
   expect(canFill(card(id), 'CL')).toBe(true);
  }
  expect(substitutions).toHaveLength(4);
  // The stored lineup is untouched: the absence lasts only this segment.
  expect(season.lineups[human]).toEqual(lineup);
  expect(availability(season, benched, 1)).toBe('fit');
 });

 it('plays a minor injury through at reduced strength without undoing training', () => {
  const { run, season, profiles } = seasonStart();
  const human = run.seating.humanSeat;
  const ss = season.lineups[human].active.SS;
  season.cash[human] = 50;
  buyTraining(run, season, human, profiles.get(ss)!, 'hitting');
  injure(season, human, ss, 'minor');
  expect(availability(season, ss, 0)).toBe('out');
  expect(fieldedLineup(run, season, human, 0).lineup.active.SS).not.toBe(ss);
  takePush(run, season, human, ss, 'playThrough');
  expect(availability(season, ss, 0)).toBe('hurt');
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  const playing = input.clubs[human].roster.find(pick => pick.slot === 'SS')!.profile;
  const trained = developed(profiles.get(ss)!, season.upgrades, 0);
  expect(playing).toEqual(hurt(trained));
  const lost = woba(trained.battingRates!) - woba(playing.battingRates!);
  expect(lost).toBeCloseTo(.25 * (woba(trained.battingRates!) - INJURY_FLOORS.battingWoba), 4);
  expect(season.upgrades).toHaveLength(1);
 });

 it('rides a starter and skips a closer\'s rest in the engine, and AI contenders push while others train intensively', () => {
  const { run, season, profiles } = seasonStart();
  const human = run.seating.humanSeat;
  const data = testLeagueData(FRANCHISES);
  const names = FRANCHISES.slice(0, 8);
  const { active } = season.lineups[human];
  const pitched = (input: ReturnType<typeof segmentInput>, id: string) => {
   const lines = simulateLeagueSegment(input).totals[human].pitching.filter(line => line.seasonId === id);
   return { outs: lines.reduce((sum, line) => sum + line.outs, 0), appearances: lines.reduce((sum, line) => sum + line.appearances, 0) };
  };
  const plain = segmentInput(run, season, profiles, data, names);
  takePush(run, season, human, active.SP1, 'ride');
  takePush(run, season, human, active.CL, 'skipRest');
  const pushed = segmentInput(run, season, profiles, data, names);
  expect(pushed.clubs[human].ridden).toEqual([active.SP1]);
  expect(pushed.clubs[human].tireless).toEqual([active.CL]);
  expect(pitched(pushed, active.SP1).outs).toBeGreaterThan(pitched(plain, active.SP1).outs);
  expect(pitched(pushed, active.CL).appearances).toBeGreaterThanOrEqual(pitched(plain, active.CL).appearances);
  // After a segment, contenders push their ace and closer and the rest train one card intensively.
  recordSegment(run, season, simulateLeagueSegment(pushed));
  expect(season.injuries.every(injury => injury.segment === 1)).toBe(true);
  season.cash = season.cash.map(() => 40);
  aiShop(run, season, profiles);
  const ai = season.pushes.filter(push => push.seat !== human);
  expect(ai.some(push => push.kind === 'ride')).toBe(true);
  expect(ai.some(push => push.kind === 'intensive')).toBe(true);
  expect(ai.some(push => push.kind === 'playThrough')).toBe(false);
  for (const push of ai.filter(item => item.kind === 'intensive')) expect(season.upgrades.some(upgrade => upgrade.cardId === push.cardId && upgrade.intensive)).toBe(true);
  // The next segment still fields a legal club at every seat, call-ups included.
  const missing = profilesFor(run, season.lineups.flatMap((_, seat) => fieldedLineup(run, season, seat, 1).substitutions.map(sub => sub.in)));
  for (const [id, profile] of missing) if (!profiles.has(id)) profiles.set(id, profile);
  expect(() => simulateLeagueSegment(segmentInput(run, season, profiles, data, names))).not.toThrow();
 });

 it('keeps pushes and injuries through a save and resume', async () => {
  const { run, season } = seasonStart();
  const human = run.seating.humanSeat;
  takePush(run, season, human, season.lineups[human].active.SP2, 'ride');
  injure(season, human, season.lineups[human].active.C, 'minor');
  const { db } = await memoryDb();
  await saveRun(db, 'run', run, season);
  const resumed = resumeRun((await getRun(db, 'run'))!, DATA, 'test-data');
  if (!resumed.ok) throw new Error(resumed.reason);
  expect(resumed.season!.pushes).toEqual(season.pushes);
  expect(resumed.season!.injuries).toEqual(season.injuries);
 });
});
