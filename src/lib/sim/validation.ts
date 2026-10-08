import {
 CURRENT_REPLAY_SCHEMA_VERSION,
 HITTER_SLOTS,
 MODEL_VERSION,
 POSITIONS,
 SLOTS,
 type DefensiveEnvironment,
 type DefensiveEvidence,
 type DefensivePosition,
 type DefensiveSkillName,
 type Draft,
 type Position,
 type Profile,
 type Rates,
 type Slot
} from '../game/types.ts';
import { draftRules } from '../game/rules.ts';
import type { SeasonInput, TeamInput } from './types.ts';

const DEFENSIVE_SKILLS: readonly DefensiveSkillName[] = [
 'hitPrevention',
 'doublePlay',
 'outfieldThrowing',
 'errorAvoidance',
 'catcherThrowing'
];
const DOUBLE_PLAY_APPLIES: Record<Position, boolean> = {
 C: false, '1B': true, '2B': true, '3B': true, SS: true, LF: false, CF: false, RF: false
};
const OUTFIELD_THROWING_APPLIES: Record<Position, boolean> = {
 C: false, '1B': false, '2B': false, '3B': false, SS: false, LF: true, CF: true, RF: true
};

export function validateRates(rates: Rates | undefined): void {
 if (!rates || rates.length !== 8 || rates.some(value => !Number.isFinite(value) || value < 0) ||
  Math.abs(rates.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) {
  throw new Error('Invalid simulation event rates');
 }
}

function skillApplies(position: Position, skill: DefensiveSkillName): boolean {
 if (skill === 'hitPrevention' || skill === 'errorAvoidance') return true;
 if (skill === 'doublePlay') return DOUBLE_PLAY_APPLIES[position];
 if (skill === 'outfieldThrowing') return OUTFIELD_THROWING_APPLIES[position];
 return position === 'C';
}

function validateEvidence(
 position: Position,
 skill: DefensiveSkillName,
 value: number,
 evidence: DefensiveEvidence | undefined
): void {
 if (!Number.isFinite(value) || value < -1 || value > 1 || !evidence ||
  !Number.isFinite(evidence.exposure) || evidence.exposure < 0 ||
  (evidence.reason !== undefined && (typeof evidence.reason !== 'string' || !evidence.reason.trim()))) {
  throw new Error('Invalid defensive skill evidence');
 }
 const applicable = skillApplies(position, skill);
 if (!applicable) {
  if (evidence.status !== 'notApplicable' || evidence.exposure !== 0 || value !== 0) {
   throw new Error('Invalid non-applicable defensive skill');
  }
  return;
 }
 if (evidence.status === 'notApplicable') throw new Error('Applicable defensive skill is missing');
 if (evidence.status === 'genericOutfield' &&
  (skill !== 'outfieldThrowing' || !OUTFIELD_THROWING_APPLIES[position])) {
  throw new Error('Invalid generic outfield evidence');
 }
 if (evidence.status === 'neutralMissingEvidence') {
  if (value !== 0 || typeof evidence.reason !== 'string' || !evidence.reason.trim()) {
   throw new Error('Invalid neutral defensive evidence');
  }
  return;
 }
 if ((evidence.status !== 'exact' && evidence.status !== 'genericOutfield') || evidence.exposure <= 0) {
  throw new Error('Invalid defensive evidence status');
 }
}

function validateDefensivePosition(position: Position, defense: DefensivePosition | undefined): void {
 if (!defense || !defense.evidence || typeof defense.residualClamped !== 'boolean') {
  throw new Error('Missing defensive position record');
 }
 const evidenceKeys = Object.keys(defense.evidence);
 if (evidenceKeys.length !== DEFENSIVE_SKILLS.length ||
  evidenceKeys.some(skill => !DEFENSIVE_SKILLS.includes(skill as DefensiveSkillName))) {
  throw new Error('Invalid defensive evidence record');
 }
 for (const skill of DEFENSIVE_SKILLS) validateEvidence(position, skill, defense[skill], defense.evidence[skill]);
 const aggregateAvailable = defense.evidence.hitPrevention.status === 'exact';
 if (aggregateAvailable) {
  if (defense.expectedRunsSaved162 === null || !Number.isFinite(defense.expectedRunsSaved162)) {
   throw new Error('Invalid expected defensive runs');
  }
 } else if (defense.expectedRunsSaved162 !== null || defense.residualClamped) {
  throw new Error('Unavailable defensive estimate must be null');
 }
}

function validateProfileDefense(profile: Profile): void {
 if (!profile.defense || !profile.defense.positions || !Array.isArray(profile.eligibleSlots) ||
  new Set(profile.eligibleSlots).size !== profile.eligibleSlots.length ||
  profile.eligibleSlots.some(slot => !SLOTS.includes(slot))) {
  throw new Error('Invalid profile defensive contract');
 }
 const hitterSlots = profile.eligibleSlots.filter((slot): slot is typeof HITTER_SLOTS[number] =>
  HITTER_SLOTS.includes(slot as typeof HITTER_SLOTS[number])
 );
 const hasHitting = Boolean(profile.batting || profile.battingRates || hitterSlots.length > 0);
 if (!hasHitting) {
  if (profile.primaryHitterSlot !== null) throw new Error('Pitching-only profile has a primary hitter slot');
 } else if (profile.primaryHitterSlot === null || !HITTER_SLOTS.includes(profile.primaryHitterSlot)) {
  throw new Error('Invalid primary hitter slot');
 }
 const positionKeys = Object.keys(profile.defense.positions);
 if (positionKeys.some(position => !POSITIONS.includes(position as Position))) {
  throw new Error('Invalid defensive position');
 }
 if (profile.primaryHitterSlot !== null && profile.primaryHitterSlot !== 'DH') {
  validateDefensivePosition(profile.primaryHitterSlot, profile.defense.positions[profile.primaryHitterSlot]);
 }
 for (const slot of hitterSlots) {
  if (slot !== 'DH') validateDefensivePosition(slot, profile.defense.positions[slot]);
 }
 for (const position of positionKeys) {
  validateDefensivePosition(position as Position, profile.defense.positions[position as Position]);
 }
}

export function validateDefensiveEnvironment(environment: DefensiveEnvironment): void {
 if (!environment) throw new Error('Missing defensive environment');
 validateRates(environment.leagueRates);
 if (environment.leagueRates.some(value => value <= 0) ||
  POSITIONS.some(position => !Number.isFinite(environment.leagueErrorRates?.[position]) ||
   environment.leagueErrorRates[position] < 0 || environment.leagueErrorRates[position] > 0.12) ||
  !Number.isFinite(environment.leagueStealAttempt) || environment.leagueStealAttempt < 0 || environment.leagueStealAttempt > 1 ||
  !Number.isFinite(environment.leagueStealSuccess) || environment.leagueStealSuccess < 0 || environment.leagueStealSuccess > 1 ||
  !Number.isFinite(environment.leagueDoublePlay) || environment.leagueDoublePlay < 0 || environment.leagueDoublePlay > 1) {
  throw new Error('Invalid defensive environment');
 }
}

function validateHittingInputs(profile: Profile): void {
 validateRates(profile.battingRates);
 for (const value of [profile.speed, profile.stealAttempt, profile.stealSuccess, profile.doublePlay]) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid hitter running probability');
 }
}

function validatePitchingInputs(profile: Profile): void {
 validateRates(profile.pitchingRates);
 if (!profile.pitching || !Number.isFinite(profile.pitching.IPouts) || profile.pitching.IPouts < 0 ||
  !Number.isFinite(profile.pitching.GS) || profile.pitching.GS < 0 ||
  !Number.isFinite(profile.teamGames) || profile.teamGames <= 0) {
  throw new Error('Invalid pitching workload');
 }
}

export function validateHitter(profile: Profile): void {
 validateHittingInputs(profile);
 validateProfileDefense(profile);
}

export function validatePitcher(profile: Profile): void {
 validatePitchingInputs(profile);
 validateProfileDefense(profile);
}

export function validateProfile(profile: Profile): void {
 validateProfileDefense(profile);
 const hasHitting = Boolean(profile.batting || profile.battingRates ||
  profile.eligibleSlots.some(slot => HITTER_SLOTS.includes(slot as typeof HITTER_SLOTS[number])));
 const hasPitching = Boolean(profile.pitching || profile.pitchingRates ||
  profile.eligibleSlots.some(slot => slot === 'CL' || slot === 'BP' || slot.startsWith('SP')));
 if (!hasHitting && !hasPitching) throw new Error('Profile has no playable role');
 if (hasHitting) validateHittingInputs(profile);
 if (hasPitching) validatePitchingInputs(profile);
}

export function validateTeam(team: TeamInput): void {
 if (team.hitters.length !== 9 || new Set(team.hitters.map(profile => profile.playerId)).size !== 9) {
  throw new Error('A lineup requires nine distinct hitters');
 }
 const defense = POSITIONS.map(position => team.defense[position]);
 if (new Set(defense).size !== 8 ||
  defense.some(index => !Number.isInteger(index) || index < 0 || index >= team.hitters.length)) {
  throw new Error('Invalid defensive alignment');
 }
 const indices = [team.starterIndex, team.closerIndex, team.bullpenIndex];
 if (new Set(indices).size !== 3 ||
  indices.some(index => !Number.isInteger(index) || index < 0 || index >= team.pitchers.length)) {
  throw new Error('Invalid pitching roles');
 }
 team.hitters.forEach(validateHitter);
 for (const position of POSITIONS) {
  const fielder = team.hitters[team.defense[position]];
  if (!fielder.eligibleSlots.includes(position) || !fielder.defense.positions[position]) {
   throw new Error('Invalid prepared defensive alignment');
  }
 }
 team.pitchers.forEach(validatePitcher);
 if (!Number.isFinite(team.closerOutsRemaining) || team.closerOutsRemaining < 0 ||
  team.pitchers[team.starterIndex].pitching!.GS <= 0) {
  throw new Error('Invalid available pitching workload');
 }
}

export function validateSeason(input: SeasonInput): void {
 if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid simulation seed');
 if (input.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Season schema is incompatible');
 const policy = draftRules(input.schemaVersion);
 if (input.modelVersion !== MODEL_VERSION || input.modelVersion !== policy.modelVersion) {
  throw new Error('Season model is incompatible');
 }
 const rosterSlots = input.roster.map(pick => pick.slot);
 const rosterSize = policy.slots.length;
 if (input.roster.length !== rosterSize ||
  new Set(rosterSlots).size !== rosterSize ||
  new Set(input.roster.map(pick => pick.profile.playerId)).size !== rosterSize ||
  new Set(input.roster.map(pick => pick.profile.seasonId)).size !== rosterSize ||
  policy.slots.some(slot => !rosterSlots.includes(slot))) {
  throw new Error(`Season requires ${rosterSize} distinct selections and policy slots`);
 }
 if (new Set(input.roster.map(pick => pick.profile.franchiseId)).size !== rosterSize) {
  throw new Error('Season requires distinct franchises');
 }
 for (const { profile, slot } of input.roster) {
  if (!policy.slots.includes(slot) || !profile.eligibleSlots.includes(slot) ||
   !Number.isInteger(profile.year) || profile.year < policy.minYear || profile.year > policy.maxYear ||
   (profile.league !== 'AL' && profile.league !== 'NL')) {
   throw new Error('Invalid roster eligibility');
  }
  if (slot === 'CL' || slot === 'BP' || slot.startsWith('SP')) validatePitcher(profile);
  else validateHitter(profile);
  if (slot.startsWith('SP') && profile.pitching!.GS <= 0) throw new Error('Starter requires positive starts');
 }
 const hitterSlots: readonly Slot[] = HITTER_SLOTS;
 for (const [order, expected] of [
  [input.battingOrder, input.roster.filter(pick => hitterSlots.includes(pick.slot)).map(pick => pick.profile.seasonId)],
  [input.starterOrder, input.roster.filter(pick => pick.slot.startsWith('SP')).map(pick => pick.profile.seasonId)]
 ]) {
  if (order.length !== expected.length || new Set(order).size !== expected.length ||
   order.some(id => !expected.includes(id))) {
   throw new Error('Invalid lineup order');
  }
 }
 if (input.data.schemaVersion !== 1 || !input.data.dataVersion ||
  input.data.defenseMethodVersion !== 'defense-v1' || input.data.valuationVersion !== 'sim-war-v1' ||
  !Number.isFinite(input.data.observedRuns) || input.data.observedRuns <= 0 ||
  input.data.opponents.length !== 30 || new Set(input.data.opponents.map(team => team.id)).size !== 30) {
  throw new Error('Season requires compatible simulation data and thirty distinct opponents');
 }
 validateDefensiveEnvironment(input.data);
 validatePitcher(input.data.bullpen);
 for (const opponent of input.data.opponents) {
  if (!opponent.id || !Number.isFinite(opponent.park) || opponent.park <= 0 || opponent.starters.length !== 5) {
   throw new Error('Invalid opponent rotation or park');
  }
  if (opponent.hitters.length !== 9 || new Set(opponent.hitters.map(profile => profile.playerId)).size !== 9) {
   throw new Error('Invalid opponent lineup');
  }
  const positions: string[] = opponent.hitters.map(profile => profile.eligibleSlots.length === 1 ? profile.eligibleSlots[0] : '');
  if (new Set(positions).size !== 9 || ![...POSITIONS, 'DH'].every(position => positions.includes(position))) {
   throw new Error('Invalid opponent defensive assignment');
  }
  opponent.hitters.forEach(validateHitter);
  for (const position of POSITIONS) {
   const fielder = opponent.hitters.find(profile => profile.eligibleSlots[0] === position);
   if (!fielder?.defense.positions[position]) throw new Error('Missing opponent defensive position');
  }
  for (const starter of opponent.starters) {
   validatePitcher(starter);
   if (starter.pitching!.GS <= 0) throw new Error('Opponent starter requires positive starts');
  }
  validatePitcher(opponent.closer);
  validatePitcher(opponent.bullpen);
 }
}

export function validateDraftVersion(draft: Draft, dataVersion: string): void {
 if (draft.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION ||
  draft.modelVersion !== MODEL_VERSION ||
  draft.modelVersion !== draftRules(draft.schemaVersion).modelVersion ||
  draft.dataVersion !== dataVersion ||
  draft.currentRoll !== null) {
  throw new Error('Draft is incomplete or incompatible');
 }
}
