import { MODEL_VERSION, POSITIONS, SLOTS, type DefensiveEnvironment, type Position, type SimulationData } from '../game/types.ts';
import { neutralDefensivePosition } from './defense.ts';
import { AVERAGE_RATES, syntheticProfile } from './fixtures.ts';
import type { GameInput, SeasonInput, TeamInput } from './types.ts';

export function testTeam(id: string): TeamInput {
 const hitters = Array.from({ length: 9 }, (_, index) => {
  const profile = syntheticProfile(`${id}-h${index}`);
  const slot = index < 8 ? POSITIONS[index] : 'DH';
  profile.eligibleSlots = [slot];
  profile.primaryHitterSlot = slot;
  if (slot !== 'DH') profile.defense.positions[slot] = neutralDefensivePosition(slot);
  profile.stealAttempt = 0;
  return profile;
 });
 const pitchers = ['starter', 'closer', 'support'].map(role => syntheticProfile(`${id}-${role}`));
 pitchers[2].displayName = `${id} support bullpen`;
 pitchers[2].pitching!.G = 60;
 pitchers[2].pitching!.GS = 0;
 pitchers[2].pitching!.IPouts = 486;
 return { id, name: `Club ${id}`, hitters, defense: Object.fromEntries(POSITIONS.map((position, index) => [position, index])) as Record<Position, number>,
  pitchers, starterIndex: 0, closerIndex: 1, bullpenIndex: 2,
  closerAvailable: true, closerOutsRemaining: 100 };
}
export function eventTable(pitchers: number): Float64Array {
 return Float64Array.from({ length: 9 * pitchers * 8 }, (_, index) => (index % 8 + 1) / 8);
}
export function testDefenseEnvironment(): DefensiveEnvironment {
 return {
  leagueRates: AVERAGE_RATES,
  leagueErrorRates: Object.fromEntries(POSITIONS.map(position => [position, 0.01])) as Record<Position, number>,
  leagueStealAttempt: 0.03,
  leagueStealSuccess: 0.75,
  leagueDoublePlay: 0.08
 };
}
export function testGame(): GameInput {
 const home = testTeam('home');
 const away = testTeam('away');
 return { number: 1, opponentId: 'away', opponentName: 'Club away', challengeIsHome: true, home, away,
  defenseEnvironment: testDefenseEnvironment(), park: 1,
  homeMatchups: eventTable(away.pitchers.length), awayMatchups: eventTable(home.pitchers.length) };
}
export const EVENT = { BB: 0.0625, HBP: 0.1875, SO: 0.3125, single: 0.4375, double: 0.5625, triple: 0.6875, HR: 0.8125, OUT: 0.9375 };
export function scripted(values: number[], fallback = EVENT.SO): () => number {
 let index = 0;
 return () => index < values.length ? values[index++] : fallback;
}
function seasonFixture(seed: number): SeasonInput {
 const roster = SLOTS.map((slot, index) => {
  const profile = syntheticProfile(`roster-${index}`);
  profile.franchiseId = `F${index}`;
  profile.teamId = `T${index}`;
  profile.eligibleSlots = [slot];
  profile.primaryHitterSlot = POSITIONS.includes(slot as Position) ? slot as Position : 'DH';
  if (profile.primaryHitterSlot !== 'DH') profile.defense.positions[profile.primaryHitterSlot] = neutralDefensivePosition(profile.primaryHitterSlot);
  if (slot === 'BP') {
   profile.displayName = 'Synthetic Club bullpen remainder';
   profile.pitching!.G = 60;
   profile.pitching!.GS = 0;
   profile.pitching!.IPouts = 486;
  }
  return { profile, slot };
 });
 const opponents = Array.from({ length: 30 }, (_, index) => {
  const team = testTeam(`opponent-${index}`);
  return { id: team.id, name: team.name, park: 1, hitters: team.hitters,
   starters: Array.from({ length: 5 }, (_, rotation) => syntheticProfile(`${team.id}-sp${rotation}`)), closer: team.pitchers[1], bullpen: team.pitchers[2] };
 });
 const bullpen = syntheticProfile('pooled-support');
 bullpen.displayName = 'League support bullpen';
 bullpen.eligibleSlots = [];
 bullpen.pitching!.G = 60;
 bullpen.pitching!.GS = 0;
 bullpen.pitching!.IPouts = 486;
 const defenseEnvironment = testDefenseEnvironment();
 const data: SimulationData = { schemaVersion: 1, dataVersion: 'synthetic', bullpen, opponents,
  observedRuns: 4.45, ...defenseEnvironment, defenseMethodVersion: 'defense-v1', valuationVersion: 'sim-war-v1' };
 return { schemaVersion: 4, modelVersion: MODEL_VERSION, seed, roster, battingOrder: roster.slice(0, 9).map(pick => pick.profile.seasonId), starterOrder: roster.slice(9, 12).map(pick => pick.profile.seasonId), data };
}

export function testSeason(seed = 162): SeasonInput {
 return seasonFixture(seed);
}
