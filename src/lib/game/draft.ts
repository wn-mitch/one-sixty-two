import {
 compareId,
 CURRENT_REPLAY_SCHEMA_VERSION,
 HITTER_SLOTS,
 STARTER_SLOTS,
 type Candidate,
 type Draft,
 type DraftAction,
 type HitterSlot,
 type Manifest,
 type Pick,
 RULES_VERSION,
 type Replay,
 type ReplaySchemaVersion,
 type Roll,
 type Slot
} from './types.ts';
import { analyzeDraft, canFinishDraft, isViableForSlot } from './draft-analysis.ts';
import { randomStream } from './random.ts';
import { draftRules, type DraftRulePolicy } from './rules.ts';

function requireCurrentRules(draft: Draft): DraftRulePolicy {
 if (draft.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Saved draft is incompatible');
 return draftRules(CURRENT_REPLAY_SCHEMA_VERSION);
}

function emptyDraft(manifest: Manifest, seed: number): Draft {
 const policy = draftRules(CURRENT_REPLAY_SCHEMA_VERSION);
 return {
  schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
  dataVersion: manifest.dataVersion,
  modelVersion: policy.modelVersion,
  rulesVersion: RULES_VERSION,
  seed,
  homeStadium: null,
  picks: [],
  currentRoll: null,
  battingOrder: [],
  starterOrder: [],
  actions: []
 };
}

export function createDraft(manifest: Manifest, seed: number): Draft {
 if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid draft seed');
 return emptyDraft(manifest, seed);
}

export function openSlots(draft: Draft): Slot[] {
 const occupied = new Set(draft.picks.map(pick => pick.slot));
 return draftRules(draft.schemaVersion).slots.filter(slot => !occupied.has(slot));
}

export function legalSlots(draft: Draft, candidate: Candidate, manifest: Manifest): Slot[] {
 const analysis = analyzeDraft(draft, manifest);
 if (!analysis.unusedSeasons.has(candidate.seasonId)) return [];
 return analysis.slots.filter(slot =>
  candidate.eligibleSlots.includes(slot) && isViableForSlot(analysis, candidate, slot)
 );
}

/** The roll's era, bounded by the decade's data coverage and the draft's year limits. */
export function rollYears(roll: Roll, manifest: Manifest, schemaVersion: ReplaySchemaVersion): { first: number; last: number } {
 const policy = draftRules(schemaVersion);
 const coverage = manifest.coverage.find(item => item.decade === roll.decade);
 return {
  first: Math.max(policy.minYear, coverage?.firstYear ?? roll.decade),
  last: Math.min(policy.maxYear, coverage?.lastYear ?? roll.decade + 9)
 };
}

export function availableCandidates(draft: Draft, manifest: Manifest, roll: Roll | null = draft.currentRoll): Candidate[] {
 const analysis = analyzeDraft(draft, manifest);
 return analysis.unused.filter(candidate => {
  if (roll && (candidate.franchiseId !== roll.franchiseId || candidate.decade !== roll.decade)) return false;
  return candidate.eligibleSlots.some(slot =>
   analysis.slots.includes(slot) && isViableForSlot(analysis, candidate, slot)
  );
 });
}

function nextRoll(draft: Draft, manifest: Manifest, random: () => number): Roll {
 const candidates = availableCandidates(draft, manifest, null);
 const franchises = [...new Set(candidates.map(candidate => candidate.franchiseId))].sort(compareId);
 if (!franchises.length) throw new Error('Dataset error: no legal candidates remain. Your draft is preserved.');
 const franchiseId = franchises[Math.floor(random() * franchises.length)];
 const decades = [...new Set(candidates
  .filter(candidate => candidate.franchiseId === franchiseId)
  .map(candidate => candidate.decade))].sort((a, b) => a - b);
 return { franchiseId, decade: decades[Math.floor(random() * decades.length)] };
}

function applyStadium(draft: Draft, manifest: Manifest, stadiumId: string, stadiumVersion: string | null): Draft {
 if (draft.homeStadium || draft.actions.length || draft.picks.length || draft.currentRoll) throw new Error('The home stadium is already chosen');
 const stadium = manifest.stadiums.find(item => item.ref.id === stadiumId);
 if (!stadium || (stadiumVersion !== null && stadium.ref.version !== stadiumVersion)) throw new Error('Choose a stadium from the current deck');
 const { id, version } = stadium.ref;
 return { ...draft, homeStadium: { id, version }, actions: [{ type: 'select-stadium', stadiumId: id, stadiumVersion: version }] };
}

/** Pins the home stadium as the sole first action of an unstarted draft. */
export function selectHomeStadium(draft: Draft, manifest: Manifest, stadiumId: string): Draft {
 requireCurrentRules(draft);
 return applyStadium(draft, manifest, stadiumId, null);
}

function appendAction(draft: Draft, action: DraftAction): DraftAction[] {
 return [...draft.actions, action];
}

function applyRoll(draft: Draft, manifest: Manifest, random: () => number, record: boolean): Draft {
 const policy = draftRules(draft.schemaVersion);
 if (!draft.homeStadium) throw new Error('Choose a home stadium before rolling');
 if (draft.currentRoll) throw new Error('A draft roll is already pending');
 if (draft.picks.length === policy.slots.length) throw new Error('The roster is complete');
 const result = { ...draft, currentRoll: nextRoll(draft, manifest, random) } as Draft;
 if (record) return { ...result, actions: appendAction(draft, { type: 'roll' }) } as Draft;
 return result;
}

function commitPickWithPolicy(
 draft: Draft,
 manifest: Manifest,
 seasonId: string,
 slot: Slot,
 policy: DraftRulePolicy,
 record: boolean
): Draft {
 if (!draft.currentRoll) throw new Error('Roll before choosing a player');
 const candidate = manifest.candidates.find(item => item.seasonId === seasonId);
 if (!candidate || candidate.franchiseId !== draft.currentRoll.franchiseId || candidate.decade !== draft.currentRoll.decade) {
  throw new Error('Choose a season from the current roll');
 }
 const year = Number(candidate.seasonId.split(':')[1]);
 if (!Number.isInteger(year) || year < policy.minYear || year > policy.maxYear) {
  throw new Error('Season is outside the supported era');
 }
 if (!policy.slots.includes(slot) || !legalSlots(draft, candidate, manifest).includes(slot)) {
  throw new Error('Player is not eligible for that empty slot');
 }
 const picks: Pick[] = [...draft.picks, { ...draft.currentRoll, seasonId, slot }];
 let result = { ...draft, picks, currentRoll: null } as Draft;
 if (picks.length === policy.slots.length) {
  result = {
   ...result,
   battingOrder: HITTER_SLOTS.map(position => picks.find(pick => pick.slot === position)!.seasonId),
   starterOrder: STARTER_SLOTS.map(position => picks.find(pick => pick.slot === position)!.seasonId)
  } as Draft;
 }
 if (record) return { ...result, actions: appendAction(draft, { type: 'pick', seasonId, slot }) } as Draft;
 return result;
}


function reassignedDraft(
 draft: Draft,
 manifest: Manifest,
 seasonId: string,
 destination: HitterSlot,
 record: boolean
): Draft {
 requireCurrentRules(draft);
 const selectedPick = draft.picks.find(pick => pick.seasonId === seasonId);
 const selectedCandidate = selectedPick && manifest.candidates.find(candidate => candidate.seasonId === selectedPick.seasonId);
 if (!selectedPick || !selectedCandidate || !HITTER_SLOTS.includes(selectedPick.slot as HitterSlot)) {
  throw new Error('Choose a drafted position player');
 }
 const origin = selectedPick.slot as HitterSlot;
 if (origin === destination) return draft;
 if (!HITTER_SLOTS.includes(destination) || !selectedCandidate.eligibleSlots.includes(destination)) {
  throw new Error('Player does not qualify for that position');
 }
 const otherPick = draft.picks.find(pick => pick.slot === destination);
 if (otherPick) {
  const otherCandidate = manifest.candidates.find(candidate => candidate.seasonId === otherPick.seasonId);
  if (!otherCandidate?.eligibleSlots.includes(origin)) {
   throw new Error('The other player cannot move to the original position');
  }
 }
 const picks = draft.picks.map(pick => {
  if (pick.seasonId === seasonId) return { ...pick, slot: destination };
  if (otherPick && pick.seasonId === otherPick.seasonId) return { ...pick, slot: origin };
  return pick;
 });
 const result = { ...draft, picks } as Draft;
 if (!canFinishDraft(result, manifest)) throw new Error('This move would prevent completing the roster');
 if (result.currentRoll && availableCandidates(result, manifest, result.currentRoll).length === 0) {
  throw new Error('This move would leave the current roll without a legal pick');
 }
 if (record) {
  return { ...result, actions: appendAction(draft, { type: 'reassign', seasonId, slot: destination }) } as Draft;
 }
 return result;
}

export interface LegalReassignment {
 slot: HitterSlot;
 swapWith: string | null;
}

export function legalReassignments(draft: Draft, manifest: Manifest, seasonId: string): LegalReassignment[] {
 requireCurrentRules(draft);
 const selected = draft.picks.find(pick => pick.seasonId === seasonId);
 if (!selected || !HITTER_SLOTS.includes(selected.slot as HitterSlot)) return [];
 const result: LegalReassignment[] = [];
 for (const slot of HITTER_SLOTS) {
  if (slot === selected.slot) continue;
  try {
   const reassigned = reassignedDraft(draft, manifest, seasonId, slot, false);
   const occupant = draft.picks.find(pick => pick.slot === slot);
   if (reassigned !== draft) result.push({ slot, swapWith: occupant?.seasonId ?? null });
  } catch (error) {
   if (error instanceof Error && (
    error.message === 'Player does not qualify for that position' ||
    error.message === 'The other player cannot move to the original position' ||
    error.message === 'This move would prevent completing the roster' ||
    error.message === 'This move would leave the current roll without a legal pick'
   )) continue;
   throw error;
  }
 }
 return result;
}

export function reassignPick(draft: Draft, manifest: Manifest, seasonId: string, destination: HitterSlot): Draft {
 return reassignedDraft(draft, manifest, seasonId, destination, true);
}

function validAction(value: unknown): DraftAction {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid draft action');
 const action = value as Record<string, unknown>;
 if (action.type === 'select-stadium') {
  if (Object.keys(action).length !== 3 || typeof action.stadiumId !== 'string' || typeof action.stadiumVersion !== 'string') throw new Error('Invalid draft action');
  return { type: 'select-stadium', stadiumId: action.stadiumId, stadiumVersion: action.stadiumVersion };
 }
 if (action.type === 'roll') {
  if (Object.keys(action).length !== 1) throw new Error('Invalid draft action');
  return { type: 'roll' };
 }
 if (action.type === 'pick') {
  if (Object.keys(action).length !== 3 || typeof action.seasonId !== 'string' ||
   typeof action.slot !== 'string' || !draftRules(CURRENT_REPLAY_SCHEMA_VERSION).slots.includes(action.slot as Slot)) {
   throw new Error('Invalid draft action');
  }
  return { type: 'pick', seasonId: action.seasonId, slot: action.slot as Slot };
 }
 if (action.type === 'reassign') {
  if (Object.keys(action).length !== 3 || typeof action.seasonId !== 'string' ||
   typeof action.slot !== 'string' || !HITTER_SLOTS.includes(action.slot as HitterSlot)) {
   throw new Error('Invalid draft action');
  }
  return { type: 'reassign', seasonId: action.seasonId, slot: action.slot as HitterSlot };
 }
 throw new Error('Invalid draft action');
}

function replayActions(input: Replay, manifest: Manifest): { draft: Draft; random: () => number } {
 if (!Array.isArray(input.actions)) throw new Error('Invalid draft actions');
 let draft = emptyDraft(manifest, input.seed);
 const random = randomStream(input.seed, 'draft');
 for (const value of input.actions) {
  const action = validAction(value);
  const previous = draft;
  if (action.type === 'select-stadium') draft = applyStadium(draft, manifest, action.stadiumId, action.stadiumVersion);
  else if (action.type === 'roll') draft = applyRoll(draft, manifest, random, true);
  else if (action.type === 'pick') {
   draft = commitPickWithPolicy(draft, manifest, action.seasonId, action.slot, draftRules(CURRENT_REPLAY_SCHEMA_VERSION), true);
  } else {
   draft = reassignedDraft(draft, manifest, action.seasonId, action.slot, true);
   if (draft === previous) throw new Error('Invalid draft action');
  }
 }
 return { draft, random };
}


function replayChronology(input: Replay, manifest: Manifest): { draft: Draft; random: () => number } {
 if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid draft seed');
 return replayActions(input, manifest);
}

export function rollDraft(draft: Draft, manifest: Manifest): Draft {
 const policy = requireCurrentRules(draft);
 if (draft.currentRoll) return draft;
 if (draft.picks.length === policy.slots.length) throw new Error('The roster is complete');
 const { draft: replayed, random } = replayActions(draft, manifest);
 if (!samePicks(draft.picks, replayed.picks)) throw new Error('Invalid draft snapshot');
 return applyRoll(replayed, manifest, random, true);
}

export function commitPick(draft: Draft, manifest: Manifest, seasonId: string, slot: Slot): Draft {
 const policy = requireCurrentRules(draft);
 return commitPickWithPolicy(draft, manifest, seasonId, slot, policy, true);
}

function validateOrder(value: unknown, expected: string[]): string[] {
 if (!Array.isArray(value) || value.length !== expected.length ||
  value.some(item => typeof item !== 'string') ||
  new Set(value).size !== value.length ||
  value.some(item => !expected.includes(item))) {
  throw new Error('Invalid lineup order');
 }
 return value;
}

function sameRoll(left: Roll | null | undefined, right: Roll | null): boolean {
 if (left == null) return right === null;
 return right !== null && Object.keys(left).length === 2 &&
  left.franchiseId === right.franchiseId && left.decade === right.decade;
}

function samePicks(value: Pick[], expected: Pick[]): boolean {
 if (value.length !== expected.length) return false;
 return value.every((pick, index) => {
  if (!pick || typeof pick !== 'object' || Object.keys(pick).length !== 4) return false;
  const other = expected[index];
  return pick.seasonId === other.seasonId && pick.slot === other.slot &&
   pick.franchiseId === other.franchiseId && pick.decade === other.decade;
 });
}

function sameStadium(value: unknown, expected: Draft['homeStadium']): boolean {
 if (value === null || expected === null) return value === expected;
 if (!value || typeof value !== 'object' || Object.keys(value).length !== 2) return false;
 const ref = value as Record<string, unknown>;
 return ref.id === expected.id && ref.version === expected.version;
}

function validateWithRules(value: unknown, manifest: Manifest, requireCurrentRoll: boolean, complete: boolean): Draft {
 if (!value || typeof value !== 'object') throw new Error('Invalid draft');
 const input = value as Draft;
 if (input.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Saved draft is incompatible');
 const policy = draftRules(input.schemaVersion);
 if (input.dataVersion !== manifest.dataVersion || input.modelVersion !== policy.modelVersion || input.rulesVersion !== RULES_VERSION) {
  throw new Error('Saved draft is incompatible');
 }
 if (input.homeStadium && !manifest.stadiums.some(stadium => stadium.ref.id === input.homeStadium!.id && stadium.ref.version === input.homeStadium!.version)) {
  throw new Error('Saved draft is incompatible');
 }
 if (!Array.isArray(input.picks) ||
  input.picks.length > policy.slots.length ||
  complete && input.picks.length !== policy.slots.length ||
  input.picks.some(pick => !pick || typeof pick !== 'object')) {
  throw new Error('Invalid draft picks');
 }
 if (requireCurrentRoll && !Object.prototype.hasOwnProperty.call(input, 'currentRoll')) throw new Error('Invalid saved roll');
 const { draft } = replayChronology(input, manifest);
 if (!samePicks(input.picks, draft.picks) || !sameStadium(input.homeStadium, draft.homeStadium)) throw new Error('Invalid draft snapshot');
 if (!sameRoll(input.currentRoll, draft.currentRoll)) {
  if (complete && input.currentRoll) throw new Error('Complete roster cannot have a pending roll');
  throw new Error('Invalid saved roll');
 }
 if (complete && draft.currentRoll) throw new Error('Complete roster cannot have a pending roll');
 draft.battingOrder = validateOrder(input.battingOrder, draft.battingOrder);
 draft.starterOrder = validateOrder(input.starterOrder, draft.starterOrder);
 return draft;
}

/** Validate an ongoing save under the current draft rules only. */
export function validateDraft(value: unknown, manifest: Manifest, complete = false): Draft {
 return validateWithRules(value, manifest, true, complete);
}

/** Validate a completed immutable replay under the sole current replay contract. */
export function validateReplay(value: unknown, manifest: Manifest): Draft {
 return validateWithRules(value, manifest, false, true);
}

export function replayInput(draft: Draft): Replay {
 const { schemaVersion, dataVersion, modelVersion, rulesVersion, seed, homeStadium, picks, battingOrder, starterOrder, actions } = draft;
 return { schemaVersion, dataVersion, modelVersion, rulesVersion, seed, homeStadium, picks, battingOrder, starterOrder, actions };
}
