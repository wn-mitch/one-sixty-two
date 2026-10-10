import { loadContactModel } from '../../../scripts/data/contact-model.ts';
import { DEFENSE_METHOD_VERSION, MODEL_VERSION, POSITIONS, RULES_VERSION, SLOTS, VALUATION_VERSION, CURRENT_REPLAY_SCHEMA_VERSION, type DefensiveEnvironment, type Position, type SimulationData } from '../game/types.ts';
import { CONTACT_UNIFORMS, buildMatchupInputs, sampleContact, type ContactDraw } from './contact-profile.ts';
import { neutralDefensivePosition } from './defense.ts';
import {
 OUTCOME_FOUL,
 buildFieldingPlan,
 computeCandidates,
 createFieldingCandidates,
 createFieldingPlan,
 createPhysicalOutcomes,
 fieldingOutcomes,
 selectOutcome
} from './fielding.ts';
import { AVERAGE_RATES, syntheticProfile, syntheticStadium } from './fixtures.ts';
import { createFlightTrace, preparePark, traceFlight } from './flight.ts';
import { createInningContext, type InningContext } from './inning.ts';
import { createBox } from './game.ts';
import { OUTCOME_HOME_RUN } from './fielding.ts';
import { createWorkload } from './workload.ts';
import { neutralPark, stadiumRef } from './park.ts';
import type { GameInput, GameRandomStreams, SeasonInput, TeamInput } from './types.ts';

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
export function testGame(): GameInput {
 const home = testTeam('home');
 const away = testTeam('away');
 return { number: 1, opponentId: 'away', opponentName: 'Club away', challengeIsHome: true, home, away,
  defenseEnvironment: testDefenseEnvironment(), stadium: neutralPark() };
}

/** Plate-appearance stream values for the synthetic league-average matchup (BB .08, HBP .012, SO .225). */
export const PA = { BB: 0.04, HBP: 0.085, SO: 0.2, contact: 0.9 };

/** Each named stream replays its scripted values, then repeats `fallback` (SO, no fielding miss, no advance attempt). */
export function scriptedStreams(script: Partial<Record<keyof GameRandomStreams, readonly number[]>>, fallback: Partial<Record<keyof GameRandomStreams, number>> = {}): GameRandomStreams {
 const defaults = { pa: PA.SO, contact: 0.5, fielding: 0.99, advancement: 0.99, ...fallback };
 const stream = (name: keyof GameRandomStreams) => {
  const values = script[name] ?? [];
  let index = 0;
  return () => index < values.length ? values[index++] : defaults[name];
 };
 return { pa: stream('pa'), contact: stream('contact'), fielding: stream('fielding'), advancement: stream('advancement') };
}

/** Contact and fielding uniforms for one batted ball, found by searching the real flight and fielding path. */
export interface ContactScript { contact: number[]; fielding: number[]; draw: ContactDraw; kind: number; fielder: number; bases: number }

/**
 * Finds the first deterministic contact sample whose actual-defense outcome satisfies `want`,
 * for the given batter and pitcher indexes in the context. Error and double-play uniforms
 * default to 0.99 (neither happens) unless `fielding` overrides them.
 */
export function findContact(context: InningContext, hitter: number, pitcher: number, want: (kind: number, fielder: number, bases: number, draw: ContactDraw) => boolean, fielding: { error?: number; doublePlay?: number } = {}): ContactScript {
 const uniforms = new Float64Array(CONTACT_UNIFORMS);
 const draw: ContactDraw = { region: 0, speedMph: 0, launchDeg: 0, sprayDeg: 0, carry: 1 };
 const trace = createFlightTrace();
 const candidates = createFieldingCandidates();
 const plan = createFieldingPlan();
 const outcomes = createPhysicalOutcomes();
 const reach = new Uint8Array(POSITIONS.length).fill(1);
 const pair = hitter * context.defense.pitchers.length + pitcher;
 let state = 0x9e3779b9;
 const next = () => { state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return state / 4294967296; };
 for (let attempt = 0; attempt < 200_000; attempt++) {
  for (let index = 0; index < CONTACT_UNIFORMS; index++) uniforms[index] = next();
  const reachUniform = next();
  sampleContact(context.matchups, pair, uniforms, draw);
  traceFlight(draw, context.park, trace);
  computeCandidates(trace, context.prepared.hitPrevention, candidates);
  buildFieldingPlan(trace, candidates, reach, context.prepared.outfieldThrowing, plan);
  fieldingOutcomes(plan, context.offense.hitters[hitter].speed, outcomes);
  const selected = selectOutcome(outcomes, reachUniform);
  const kind = outcomes.kind[selected];
  if (kind === OUTCOME_FOUL || !want(kind, outcomes.fielder[selected], outcomes.bases[selected], draw)) continue;
  return {
   contact: Array.from(uniforms), fielding: [reachUniform, fielding.error ?? 0.99, fielding.doublePlay ?? 0.99],
   draw: { ...draw }, kind, fielder: outcomes.fielder[selected], bases: outcomes.bases[selected]
  };
 }
 throw new Error('No contact sample satisfies the requested outcome');
}

/** Concatenates contact scripts into stream scripts in plate-appearance order. */
export function contactStreams(pa: readonly number[], scripts: readonly ContactScript[], extra: Partial<Record<keyof GameRandomStreams, readonly number[]>> = {}): GameRandomStreams {
 return scriptedStreams({
  pa,
  contact: scripts.flatMap(script => script.contact),
  fielding: scripts.flatMap(script => script.fielding),
  ...extra
 });
}

/** A batting-versus-fielding half-inning context between two synthetic teams. */
export function testHalf(offense = testTeam('batting'), defense = testTeam('fielding'), environment = testDefenseEnvironment()) {
 const batting = createBox(offense);
 const pitching = createBox(defense);
 const workload = createWorkload(defense);
 const context = createInningContext(offense, defense, batting, pitching, workload, testMatchups(offense, defense, environment), environment, TEST_PARK(), 1000);
 return { offense, defense, batting, pitching, workload, context };
}

let homeRun: ContactScript | null = null;
/** A neutral-park home run for any synthetic batter and pitcher (they share one rate vector). */
export function homeRunScript(): ContactScript {
 homeRun ??= findContact(testHalf().context, 0, 0, kind => kind === OUTCOME_HOME_RUN);
 return homeRun;
}

/** Plate-appearance outcomes where 'HR' is a scripted home-run contact and numbers are PA uniforms. */
export function eventStreams(events: readonly (number | 'HR')[]): GameRandomStreams {
 const pa = events.map(event => event === 'HR' ? PA.contact : event);
 return contactStreams(pa, events.filter(event => event === 'HR').map(() => homeRunScript()));
}

export function testMatchups(offense: TeamInput, defense: TeamInput, environment = testDefenseEnvironment()) {
 return buildMatchupInputs(offense.hitters, defense.pitchers, environment.leagueRates, environment.contactModel);
}
export const TEST_PARK = () => preparePark(neutralPark());

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
 const stadiums = Array.from({ length: 30 }, (_, index) => testStadium(`opponent-${index}`));
 const opponents = Array.from({ length: 30 }, (_, index) => {
  const team = testTeam(`opponent-${index}`);
  return { id: team.id, name: team.name, homeStadium: stadiumRef(stadiums[index]), hitters: team.hitters,
   starters: Array.from({ length: 5 }, (_, rotation) => syntheticProfile(`${team.id}-sp${rotation}`)), closer: team.pitchers[1], bullpen: team.pitchers[2] };
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
  roster, battingOrder: roster.slice(0, 9).map(pick => pick.profile.seasonId), starterOrder: roster.slice(9, 12).map(pick => pick.profile.seasonId), data };
}

export function testSeason(seed = 162): SeasonInput {
 return seasonFixture(seed);
}
