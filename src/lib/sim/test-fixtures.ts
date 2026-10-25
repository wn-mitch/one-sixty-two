import { loadContactModel } from '../../../scripts/data/contact-model.ts';
import { BULLPEN_SLOTS, defaultReliefRoles, DEFENSE_METHOD_VERSION, MODEL_VERSION, POSITIONS, RULES_VERSION, SLOTS, VALUATION_VERSION, CURRENT_REPLAY_SCHEMA_VERSION, type DefensiveEnvironment, type Position, type Profile, type SimulationData, type Slot } from '../game/types.ts';
import { neutralDefensivePosition } from './defense.ts';
import { AVERAGE_RATES, syntheticProfile, syntheticStadium } from './fixtures.ts';
import { stadiumRef } from './park.ts';
import type { SeasonInput, TeamInput } from './types.ts';
import { STANDARD_RULES, type LeagueClubInput, type LeagueSegmentInput } from './league-types.ts';
import { DEFAULT_DRAFT_RELIEF_ROLES, DRAFT_SLOTS } from '../draft/rules.ts';
import type { DraftSlot } from '../draft/types.ts';

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

/** A synthetic card's profile for a Draft Mode slot: fielders field it, relief arms never start. */
export function leagueProfile(seasonId: string, slot: DraftSlot, eligibleSlots: readonly Slot[] = [slot.startsWith('RP') ? 'CL' : slot as Slot]): Profile {
 const profile = syntheticProfile(seasonId);
 profile.seasonId = seasonId;
 profile.eligibleSlots = [...eligibleSlots];
 profile.primaryHitterSlot = POSITIONS.includes(slot as Position) ? slot as Position : 'DH';
 for (const position of POSITIONS) if (eligibleSlots.includes(position)) profile.defense.positions[position] = neutralDefensivePosition(position);
 if (slot === 'CL' || slot.startsWith('RP')) relieve(profile);
 return profile;
}

/** The synthetic season data with its thirty opponents and parks relabelled as `franchiseIds`. */
export function testLeagueData(franchiseIds: readonly string[]): SimulationData {
 const { data } = seasonFixture(1);
 const stadiums = franchiseIds.map(id => testStadium(id));
 return { ...data, stadiums, opponents: data.opponents.map((opponent, index) => ({ ...opponent, id: franchiseIds[index], homeStadium: stadiumRef(stadiums[index]) })) };
}

/** A Draft Mode club of synthetic cards in every active slot; relief slots hold closer-eligible arms. */
function leagueClub(id: string, data: SimulationData, park: number): LeagueClubInput {
 const roster = DRAFT_SLOTS.map((slot, index) => {
  const profile = leagueProfile(`${id}-${index}`, slot);
  profile.franchiseId = `F${index}`;
  return { profile, slot };
 });
 return { id, name: `Club ${id}`, homeStadium: stadiumRef(data.stadiums[park]), roster,
  battingOrder: roster.slice(0, 9).map(pick => pick.profile.seasonId), starterOrder: roster.slice(9, 12).map(pick => pick.profile.seasonId),
  reliefRoles: DEFAULT_DRAFT_RELIEF_ROLES.map(role => ({ ...role })), quickRecovery: [] };
}

/** The first segment of an eight-club league on the synthetic season data, before neutral crowds. */
export function testLeagueSegment(seed = 162): LeagueSegmentInput {
 const { data } = seasonFixture(seed);
 return { modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, seed, data,
  clubs: Array.from({ length: 8 }, (_, index) => leagueClub(`club-${index}`, data, index)),
  rivals: [[0, 4], [1, 5], [2, 6], [3, 7]], segment: 0, crowds: Array.from({ length: 8 }, () => ({ edge: 0, volatility: 0 })), carry: [], detailClub: 0, rules: { ...STANDARD_RULES } };
}
