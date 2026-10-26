import {
 CURRENT_REPLAY_SCHEMA_VERSION,
 DEFENSE_METHOD_VERSION,
 HITTER_SLOTS,
 MODEL_VERSION,
 RULES_VERSION,
 VALUATION_VERSION,
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
 type SimulationData,
 type Slot,
 validateReliefRoles
} from '../game/types.ts';
import { draftRules } from '../game/rules.ts';
import {
 CONTACT_METHOD_VERSION,
 CONTACT_OUTCOMES,
 POWER_SHIFTS,
 REGION_COUNT,
 SIDES,
 SPEED_NODES,
 contactTargets,
 validateContactShape,
 CLASS_COUNT,
 type ContactModel
} from './contact-profile.ts';
import { validateStadium } from './park.ts';
import type { ParkRef, StadiumConfig } from './park-types.ts';
import type { SeasonInput, TeamInput } from './types.ts';
import { CROWD_TRIGGERS, LEAGUE_CLUBS, LEAGUE_SEGMENTS, MAX_CROWD_EDGE, MAX_CROWD_HYPE, MAX_PARK_FAMILIARITY, PARK_PACKAGES, type LeagueClubInput, type LeagueSegmentInput } from './league-types.ts';
import { DRAFT_BULLPEN_SLOTS, DRAFT_SLOTS } from '../draft/rules.ts';

const hitterSlotSet: ReadonlySet<string> = new Set(HITTER_SLOTS);

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
  profile.eligibleSlots.some(slot => slot !== 'BP' && !SLOTS.includes(slot))) {
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

const VALIDATED_MODELS = new WeakSet<ContactModel>();
/** Validates the contact shape and basis table sizes, finiteness, and row sums. */
export function validateContactModel(model: ContactModel): void {
 if (VALIDATED_MODELS.has(model)) return;
 if (!model || model.methodVersion !== CONTACT_METHOD_VERSION || model.provenance !== 'estimated' || !model.shape || !model.basis ||
  !Array.isArray(model.basis.responses) || !Array.isArray(model.basis.classes)) throw new Error('Invalid contact model');
 validateContactShape(model.shape);
 const { responses, classes } = model.basis;
 if (responses.length !== SIDES.length * SPEED_NODES.length * POWER_SHIFTS.length * REGION_COUNT * CONTACT_OUTCOMES ||
  classes.length !== POWER_SHIFTS.length * REGION_COUNT * CLASS_COUNT) throw new Error('Invalid contact basis size');
 for (const [values, width] of [[responses, CONTACT_OUTCOMES], [classes, CLASS_COUNT]] as const) {
  for (let row = 0; row < values.length; row += width) {
   let total = 0;
   for (let index = row; index < row + width; index++) {
    if (!Number.isFinite(values[index]) || values[index] < 0) throw new Error('Invalid contact basis value');
    total += values[index];
   }
   if (Math.abs(total - 1) > 1e-6) throw new Error('Contact basis rows must sum to one');
  }
 }
 VALIDATED_MODELS.add(model);
}

export function validateDefensiveEnvironment(environment: DefensiveEnvironment): void {
 if (!environment) throw new Error('Missing defensive environment');
 validateContactModel(environment.contactModel);
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

/** Contact provenance must be the current estimated method and agree with the normalized rates. */
function validateContactRecord(profile: Profile, role: 'batting' | 'pitching'): void {
 const record = profile.contact;
 const rates = role === 'batting' ? profile.battingRates : profile.pitchingRates;
 const targets = record?.[role];
 if (!record || record.methodVersion !== CONTACT_METHOD_VERSION || record.provenance !== 'estimated' ||
  !Array.isArray(targets) || !rates) throw new Error(`Missing or unsupported ${role} contact provenance`);
 const expected = contactTargets(rates);
 if (targets.length !== CONTACT_OUTCOMES || targets.some((value, index) => !(Math.abs(value - expected[index]) <= 1e-9))) throw new Error(`Inconsistent ${role} contact targets`);
}

function validateHittingInputs(profile: Profile): void {
 validateRates(profile.battingRates);
 validateContactRecord(profile, 'batting');
 for (const value of [profile.speed, profile.stealAttempt, profile.stealSuccess, profile.doublePlay]) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid hitter running probability');
 }
}

function validatePitchingInputs(profile: Profile): void {
 validateRates(profile.pitchingRates);
 validateContactRecord(profile, 'pitching');
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
 const indices = [team.starterIndex, team.closerIndex, team.bullpenIndex, ...team.relievers];
 if (new Set(indices).size !== indices.length ||
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
 if (team.available.length !== team.pitchers.length || team.pitchers[team.starterIndex].pitching!.GS <= 0) {
  throw new Error('Invalid available pitching workload');
 }
}

export function validateSeason(input: SeasonInput): void {
 if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid simulation seed');
 if (input.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Season schema is incompatible');
 const policy = draftRules(input.schemaVersion);
 if (input.modelVersion !== MODEL_VERSION || input.modelVersion !== policy.modelVersion || input.rulesVersion !== RULES_VERSION) {
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
  if (!hitterSlotSet.has(slot)) validatePitcher(profile);
  else validateHitter(profile);
  if (slot.startsWith('SP') && profile.pitching!.GS <= 0) throw new Error('Starter requires positive starts');
 }
 for (const [order, expected] of [
  [input.battingOrder, input.roster.filter(pick => hitterSlotSet.has(pick.slot)).map(pick => pick.profile.seasonId)],
  [input.starterOrder, input.roster.filter(pick => pick.slot.startsWith('SP')).map(pick => pick.profile.seasonId)]
 ]) {
  if (order.length !== expected.length || new Set(order).size !== expected.length ||
   order.some(id => !expected.includes(id))) {
   throw new Error('Invalid lineup order');
  }
 }
 validateReliefRoles(input.reliefRoles, true);
 if (input.data.schemaVersion !== 1 || !input.data.dataVersion ||
  input.data.defenseMethodVersion !== DEFENSE_METHOD_VERSION || input.data.valuationVersion !== VALUATION_VERSION ||
  !Number.isFinite(input.data.observedRuns) || input.data.observedRuns <= 0 ||
  input.data.opponents.length !== 30 || new Set(input.data.opponents.map(team => team.id)).size !== 30) {
  throw new Error('Season requires compatible simulation data and thirty distinct opponents');
 }
 validateDefensiveEnvironment(input.data);
 validateStadiumDeck(input.data);
 resolveStadium(input.data, input.homeStadium);
 validatePitcher(input.data.bullpen);
 for (const opponent of input.data.opponents) {
  if (!opponent.id || opponent.starters.length !== 5) throw new Error('Invalid opponent rotation');
  if (resolveStadium(input.data, opponent.homeStadium).franchiseId !== opponent.id) throw new Error('Opponent home stadium belongs to another franchise');
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
  if (opponent.relievers.length !== 3) throw new Error('Invalid opponent relievers');
  opponent.relievers.forEach(validatePitcher);
  validatePitcher(opponent.bullpen);
 }
}

const VALIDATED_DECKS = new WeakSet<StadiumConfig[]>();
/** One valid 2025 reference venue per opponent franchise, with unique ids. */
export function validateStadiumDeck(data: Pick<SimulationData, 'stadiums' | 'opponents'>): void {
 if (VALIDATED_DECKS.has(data.stadiums)) return;
 if (!Array.isArray(data.stadiums) || data.stadiums.length !== data.opponents.length) throw new Error('Stadium deck must cover every franchise');
 data.stadiums.forEach(validateStadium);
 if (new Set(data.stadiums.map(stadium => stadium.id)).size !== data.stadiums.length ||
  new Set(data.stadiums.map(stadium => stadium.franchiseId)).size !== data.stadiums.length ||
  data.opponents.some(opponent => !data.stadiums.some(stadium => stadium.franchiseId === opponent.id))) {
  throw new Error('Stadium deck has duplicate or missing franchises');
 }
 VALIDATED_DECKS.add(data.stadiums);
}

/** Resolves a pinned stadium; an unknown id or a different version is incompatible. */
export function resolveStadium(data: Pick<SimulationData, 'stadiums'>, ref: ParkRef | null | undefined): StadiumConfig {
 if (!ref || typeof ref.id !== 'string' || typeof ref.version !== 'string') throw new Error('Missing home stadium');
 const stadium = data.stadiums.find(item => item.id === ref.id);
 if (!stadium || stadium.version !== ref.version) throw new Error('Home stadium is incompatible with this dataset');
 return stadium;
}

export function validateDraftVersion(draft: Draft, dataVersion: string): void {
 if (draft.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION ||
  draft.modelVersion !== MODEL_VERSION ||
  draft.rulesVersion !== RULES_VERSION ||
  !draft.homeStadium ||
  draft.modelVersion !== draftRules(draft.schemaVersion).modelVersion ||
  draft.dataVersion !== dataVersion ||
  draft.currentRoll !== null) {
  throw new Error('Draft is incomplete or incompatible');
 }
}

/**
 * A Draft Mode club: every active slot filled once by an eligible card, with matching orders and
 * roles. Draft legality allows two seasons of one player on a club, so player ids may repeat.
 */
function validateLeagueClub(club: LeagueClubInput, data: SimulationData): void {
 const slots = club.roster.map(pick => pick.slot);
 if (!club.id || club.roster.length !== DRAFT_SLOTS.length || DRAFT_SLOTS.some(slot => !slots.includes(slot)) ||
  new Set(club.roster.map(pick => pick.profile.seasonId)).size !== DRAFT_SLOTS.length) {
  throw new Error(`${club.name}: club requires one distinct card in every active slot`);
 }
 const slotOf = (id: string) => club.roster.find(pick => pick.profile.seasonId === id)?.slot;
 if (!Array.isArray(club.quickRecovery) || club.quickRecovery.some(id => !slotOf(id))) {
  throw new Error(`${club.name}: quick recovery names a card outside the club`);
 }
 if (!Array.isArray(club.ridden) || club.ridden.some(id => !/^SP\d$/.test(slotOf(id) ?? ''))) throw new Error(`${club.name}: only an active starter can be ridden`);
 if (club.crowdTrigger !== null && !(CROWD_TRIGGERS as readonly string[]).includes(club.crowdTrigger)) throw new Error(`${club.name}: unknown crowd trigger`);
 if (club.parkPackage !== null && !(PARK_PACKAGES as readonly string[]).includes(club.parkPackage)) throw new Error(`${club.name}: unknown park package`);
 if (!(club.familiarity >= 0 && club.familiarity <= MAX_PARK_FAMILIARITY)) throw new Error(`${club.name}: park familiarity is out of bounds`);
 if (!Array.isArray(club.tireless) || club.tireless.some(id => !/^(CL|RP\d)$/.test(slotOf(id) ?? ''))) throw new Error(`${club.name}: only a named reliever can skip rest`);
 for (const { profile, slot } of club.roster) {
  const eligible = slot.startsWith('RP') ? profile.eligibleSlots.includes('CL') : profile.eligibleSlots.includes(slot as Slot);
  if (!eligible) throw new Error(`${club.name}: ${profile.seasonId} cannot play ${slot}`);
  if (hitterSlotSet.has(slot)) validateHitter(profile);
  else validatePitcher(profile);
  if (slot.startsWith('SP') && profile.pitching!.GS <= 0) throw new Error(`${club.name}: starter requires positive starts`);
 }
 for (const [order, expected] of [
  [club.battingOrder, club.roster.filter(pick => hitterSlotSet.has(pick.slot)).map(pick => pick.profile.seasonId)],
  [club.starterOrder, club.roster.filter(pick => pick.slot.startsWith('SP')).map(pick => pick.profile.seasonId)]
 ]) {
  if (order.length !== expected.length || new Set(order).size !== expected.length || order.some(id => !expected.includes(id))) {
   throw new Error(`${club.name}: invalid lineup order`);
  }
 }
 validateReliefRoles(club.reliefRoles, true, DRAFT_BULLPEN_SLOTS);
 resolveStadium(data, club.homeStadium);
}

export function validateLeagueSegment(input: LeagueSegmentInput): void {
 if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid simulation seed');
 if (input.modelVersion !== MODEL_VERSION || input.rulesVersion !== RULES_VERSION) throw new Error('League model is incompatible');
 if (input.clubs.length !== LEAGUE_CLUBS || new Set(input.clubs.map(club => club.id)).size !== LEAGUE_CLUBS) throw new Error('A league needs eight distinct clubs');
 const paired = input.rivals.flat();
 if (input.rivals.length !== LEAGUE_CLUBS / 2 || new Set(paired).size !== LEAGUE_CLUBS || paired.some(club => !Number.isInteger(club) || club < 0 || club >= LEAGUE_CLUBS)) {
  throw new Error('Rival pairs must cover each club exactly once');
 }
 if (!Number.isInteger(input.segment) || input.segment < 0 || input.segment >= LEAGUE_SEGMENTS) throw new Error('Invalid league segment');
 if (input.carry.length !== (input.segment === 0 ? 0 : LEAGUE_CLUBS)) throw new Error('Carried rest must come from the previous segment');
 if (!Array.isArray(input.hype) || (input.hype.length !== 0 && input.hype.length !== LEAGUE_CLUBS) || input.hype.some(hype => !(hype >= 0 && hype <= MAX_CROWD_HYPE))) throw new Error('Crowd hype must cover every club within its bounds');
 if (input.crowds.length !== LEAGUE_CLUBS || input.crowds.some(crowd => !(Math.abs(crowd.edge) <= MAX_CROWD_EDGE && crowd.volatility >= 0 && crowd.volatility <= MAX_CROWD_EDGE))) {
  throw new Error('Every club needs a home crowd within bounds');
 }
 if (!Number.isInteger(input.detailClub) || input.detailClub < 0 || input.detailClub >= LEAGUE_CLUBS) throw new Error('Invalid detail club');
 const { innings, outs } = input.rules;
 if (!Number.isInteger(innings) || innings < 5 || innings > 15 || !Number.isInteger(outs) || outs < 2 || outs > 4) throw new Error('Game rules are out of bounds');
 validateDefensiveEnvironment(input.data);
 validateStadiumDeck(input.data);
 validatePitcher(input.data.bullpen);
 for (const club of input.clubs) validateLeagueClub(club, input.data);
}
