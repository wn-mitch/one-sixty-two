import { HITTER_SLOTS, POSITIONS, SUPPORTED_REPLAY_SCHEMA_VERSIONS, type Draft, type Profile, type Rates, type Slot } from '../game/types.ts';
import { draftRules } from '../game/rules.ts';
import type { SeasonInput, TeamInput } from './types.ts';

export function validateRates(rates: Rates | undefined): void {
 if (!rates || rates.length !== 8 || rates.some(value => !Number.isFinite(value) || value < 0) || Math.abs(rates.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) throw new Error('Invalid simulation event rates');
}
export function validateHitter(profile: Profile): void {
 validateRates(profile.battingRates);
 for (const value of [profile.speed, profile.stealAttempt, profile.stealSuccess, profile.doublePlay, profile.catcherCS, ...POSITIONS.map(position => profile.errorRates[position])]) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid hitter running or fielding probability');
 }
}
export function validatePitcher(profile: Profile): void {
 validateRates(profile.pitchingRates);
 if (!profile.pitching || !Number.isFinite(profile.pitching.IPouts) || profile.pitching.IPouts < 0 || !Number.isFinite(profile.pitching.GS) || profile.pitching.GS < 0 || !Number.isFinite(profile.teamGames) || profile.teamGames <= 0) throw new Error('Invalid pitching workload');
}
export function validateTeam(team: TeamInput): void {
 if (team.hitters.length !== 9 || new Set(team.hitters.map(profile => profile.playerId)).size !== 9) throw new Error('A lineup requires nine distinct hitters');
 const defense = POSITIONS.map(position => team.defense[position]);
 if (new Set(defense).size !== 8 || defense.some(index => !Number.isInteger(index) || index < 0 || index >= 9)) throw new Error('Invalid defensive alignment');
 const indices = [team.starterIndex, team.closerIndex, team.bullpenIndex];
 if (new Set(indices).size !== 3 || indices.some(index => !Number.isInteger(index) || index < 0 || index >= team.pitchers.length)) throw new Error('Invalid pitching roles');
 team.hitters.forEach(validateHitter);
 team.pitchers.forEach(validatePitcher);
 if (!Number.isFinite(team.closerOutsRemaining) || team.closerOutsRemaining < 0 || team.pitchers[team.starterIndex].pitching!.GS <= 0) throw new Error('Invalid available pitching workload');
}
export function validateSeason(input: SeasonInput): void {
 if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid simulation seed');
 if (!SUPPORTED_REPLAY_SCHEMA_VERSIONS.includes(input.schemaVersion)) throw new Error('Season schema is incompatible');
 const policy = draftRules(input.schemaVersion);
 if (input.modelVersion !== policy.modelVersion) throw new Error('Season model is incompatible');
 const rosterSlots = input.roster.map(pick => pick.slot);
 const rosterSize = policy.slots.length;
 if (input.roster.length !== rosterSize ||
  new Set(rosterSlots).size !== rosterSize ||
  new Set(input.roster.map(pick => pick.profile.playerId)).size !== rosterSize ||
  new Set(input.roster.map(pick => pick.profile.seasonId)).size !== rosterSize ||
  policy.slots.some(slot => !rosterSlots.includes(slot))) {
  throw new Error(`Season requires ${rosterSize} distinct selections and policy slots`);
 }
 if (policy.uniqueFranchises && new Set(input.roster.map(pick => pick.profile.franchiseId)).size !== rosterSize) throw new Error('Season requires distinct franchises');
 for (const { profile, slot } of input.roster) {
  if (!policy.slots.includes(slot) || !profile.eligibleSlots.includes(slot) || !Number.isInteger(profile.year) || profile.year < policy.minYear || profile.year > policy.maxYear || (profile.league !== 'AL' && profile.league !== 'NL')) throw new Error('Invalid roster eligibility');
  if (slot === 'CL' || slot === 'BP' || slot.startsWith('SP')) validatePitcher(profile);
  else validateHitter(profile);
  if (slot.startsWith('SP') && profile.pitching!.GS <= 0) throw new Error('Starter requires positive starts');
 }
 const hitterSlots: readonly Slot[] = HITTER_SLOTS;
 for (const [order, expected] of [
  [input.battingOrder, input.roster.filter(pick => hitterSlots.includes(pick.slot)).map(pick => pick.profile.seasonId)],
  [input.starterOrder, input.roster.filter(pick => pick.slot.startsWith('SP')).map(pick => pick.profile.seasonId)]
 ]) {
  if (order.length !== expected.length || new Set(order).size !== expected.length || order.some(id => !expected.includes(id))) throw new Error('Invalid lineup order');
 }
 if (input.data.schemaVersion !== 1 || !input.data.dataVersion || input.data.opponents.length !== 30 || new Set(input.data.opponents.map(team => team.id)).size !== 30) throw new Error('Season requires thirty distinct opponents');
 validateRates(input.data.leagueRates);
 if (input.data.leagueRates.some(value => value <= 0) || !Number.isFinite(input.data.leagueCatcherCS) || input.data.leagueCatcherCS < 0 || input.data.leagueCatcherCS > 1) throw new Error('Invalid league baseline');
 validatePitcher(input.data.bullpen);
 for (const opponent of input.data.opponents) {
  if (!opponent.id || !Number.isFinite(opponent.park) || opponent.park <= 0 || opponent.starters.length !== 5) throw new Error('Invalid opponent rotation or park');
  if (opponent.hitters.length !== 9 || new Set(opponent.hitters.map(profile => profile.playerId)).size !== 9) throw new Error('Invalid opponent lineup');
  const positions: string[] = opponent.hitters.map(profile => profile.eligibleSlots.length === 1 ? profile.eligibleSlots[0] : '');
  if (new Set(positions).size !== 9 || ![...POSITIONS, 'DH'].every(position => positions.includes(position))) throw new Error('Invalid opponent defensive assignment');
  opponent.hitters.forEach(validateHitter);
  for (const starter of opponent.starters) {
   validatePitcher(starter);
   if (starter.pitching!.GS <= 0) throw new Error('Opponent starter requires positive starts');
  }
  validatePitcher(opponent.closer);
  validatePitcher(opponent.bullpen);
 }
}
export function validateDraftVersion(draft: Draft, dataVersion: string): void {
 if (!SUPPORTED_REPLAY_SCHEMA_VERSIONS.includes(draft.schemaVersion) ||
  draft.modelVersion !== draftRules(draft.schemaVersion).modelVersion ||
  draft.dataVersion !== dataVersion ||
  draft.currentRoll !== null) {
  throw new Error('Draft is incomplete or incompatible');
 }
}
