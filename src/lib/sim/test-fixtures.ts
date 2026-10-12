import { loadContactModel } from '../../../scripts/data/contact-model.ts';
import { BULLPEN_SLOTS, defaultReliefRoles, DEFENSE_METHOD_VERSION, MODEL_VERSION, POSITIONS, RULES_VERSION, SLOTS, VALUATION_VERSION, CURRENT_REPLAY_SCHEMA_VERSION, type DefensiveEnvironment, type Position, type Profile, type SimulationData } from '../game/types.ts';
import { neutralDefensivePosition } from './defense.ts';
import { AVERAGE_RATES, syntheticProfile, syntheticStadium } from './fixtures.ts';
import { stadiumRef } from './park.ts';
import type { SeasonInput, TeamInput } from './types.ts';

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
 const pitchers = ['starter', 'closer', 'rp1', 'rp2', 'rp3', 'support'].map(role => syntheticProfile(`${id}-${role}`));
 for (const reliever of pitchers.slice(1)) relieve(reliever);
 pitchers[5].displayName = `${id} support bullpen`;
 pitchers[5].pitching!.IPouts = 486;
 return { id, name: `Club ${id}`, hitters, defense: Object.fromEntries(POSITIONS.map((position, index) => [position, index])) as Record<Position, number>,
  pitchers, starterIndex: 0, closerIndex: 1, relievers: [2, 3, 4], bullpenIndex: 5, available: pitchers.map(() => true) };
}
/** Makes a synthetic pitcher relief-only: sixty games, no starts. */
function relieve(profile: Profile): void {
 profile.pitching!.G = 60;
 profile.pitching!.GS = 0;
 profile.pitching!.IPouts = 200;
}
export function testDefenseEnvironment(): DefensiveEnvironment {
 return {
  leagueRates: AVERAGE_RATES,
  leagueErrorRates: Object.fromEntries(POSITIONS.map(position => [position, 0.01])) as Record<Position, number>,
  leagueStealAttempt: 0.03,
  leagueStealSuccess: 0.75,
  leagueDoublePlay: 0.08,
  contactModel: loadContactModel()
 };
}
export const testStadium = syntheticStadium;
function seasonFixture(seed: number): SeasonInput {
 const roster = SLOTS.map((slot, index) => {
  const profile = syntheticProfile(`roster-${index}`);
  profile.franchiseId = `F${index}`;
  profile.teamId = `T${index}`;
  profile.eligibleSlots = [slot];
  profile.primaryHitterSlot = POSITIONS.includes(slot as Position) ? slot as Position : 'DH';
  if (profile.primaryHitterSlot !== 'DH') profile.defense.positions[profile.primaryHitterSlot] = neutralDefensivePosition(profile.primaryHitterSlot);
  if (slot.startsWith('RP')) relieve(profile);
  return { profile, slot };
 });
 const stadiums = Array.from({ length: 30 }, (_, index) => testStadium(`opponent-${index}`));
 const opponents = Array.from({ length: 30 }, (_, index) => {
  const team = testTeam(`opponent-${index}`);
  return { id: team.id, name: team.name, homeStadium: stadiumRef(stadiums[index]), hitters: team.hitters,
   starters: Array.from({ length: 5 }, (_, rotation) => syntheticProfile(`${team.id}-sp${rotation}`)), closer: team.pitchers[1], relievers: team.pitchers.slice(2, 5), bullpen: team.pitchers[5] };
 });
 const bullpen = syntheticProfile('pooled-support');
 bullpen.displayName = 'League support bullpen';
 bullpen.eligibleSlots = [];
 bullpen.pitching!.G = 60;
 bullpen.pitching!.GS = 0;
 bullpen.pitching!.IPouts = 486;
 const defenseEnvironment = testDefenseEnvironment();
 const data: SimulationData = { schemaVersion: 1, dataVersion: 'synthetic', bullpen, opponents, stadiums,
  observedRuns: 4.45, ...defenseEnvironment, defenseMethodVersion: DEFENSE_METHOD_VERSION, valuationVersion: VALUATION_VERSION };
 return { schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION, modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, seed, homeStadium: stadiumRef(stadiums[0]),
  roster, battingOrder: roster.slice(0, 9).map(pick => pick.profile.seasonId), starterOrder: roster.slice(9, 12).map(pick => pick.profile.seasonId),
  reliefRoles: defaultReliefRoles(BULLPEN_SLOTS), data };
}

export function testSeason(seed = 162): SeasonInput {
 return seasonFixture(seed);
}
