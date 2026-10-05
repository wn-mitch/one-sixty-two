import {
 compareId,
 CURRENT_REPLAY_SCHEMA_VERSION,
 MODEL_VERSION,
 SLOTS,
 SUPPORTED_REPLAY_SCHEMA_VERSIONS,
 type Candidate,
 type Draft,
 type Manifest,
 type Pick,
 type Replay,
 type ReplaySchemaVersion,
 type Roll,
 type Slot
} from './types.ts';
import { randomStream } from './random.ts';

interface RulePolicy {
 schemaVersion: ReplaySchemaVersion;
 uniqueFranchises: boolean;
}

const RULE_POLICIES: Record<ReplaySchemaVersion, RulePolicy> = {
 1: { schemaVersion: 1, uniqueFranchises: false },
 2: { schemaVersion: 2, uniqueFranchises: true }
};

function requireCurrentRules(draft: Draft): RulePolicy {
 if (draft.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Saved draft is incompatible');
 return RULE_POLICIES[CURRENT_REPLAY_SCHEMA_VERSION];
}

export function createDraft(manifest: Manifest, seed: number): Draft {
 if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid draft seed');
 return { schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION, dataVersion: manifest.dataVersion, modelVersion: MODEL_VERSION, seed, picks: [], currentRoll: null, battingOrder: [], starterOrder: [] };
}

export function openSlots(draft: Draft): Slot[] {
 const occupied = new Set(draft.picks.map(pick => pick.slot));
 return SLOTS.filter(slot => !occupied.has(slot));
}

function unusedCandidates(draft: Draft, manifest: Manifest, policy: RulePolicy): Candidate[] {
 const candidatesBySeason = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
 const usedPlayers = new Set<string>();
 const usedFranchises = new Set<string>();
 for (const pick of draft.picks) {
  const candidate = candidatesBySeason.get(pick.seasonId);
  if (candidate) usedPlayers.add(candidate.playerId);
  if (policy.uniqueFranchises) usedFranchises.add(pick.franchiseId);
 }
 const slots = new Set(openSlots(draft));
 return manifest.candidates.filter(candidate =>
  !usedPlayers.has(candidate.playerId) &&
  !usedFranchises.has(candidate.franchiseId) &&
  candidate.eligibleSlots.some(slot => slots.has(slot))
 );
}

/** Hall's condition for the historical player-only rule. */
function canFinishByPlayer(candidates: Candidate[], slots: Slot[], excludedPlayer?: string): boolean {
 const players = new Map<Slot, Set<string>>(slots.map(slot => [slot, new Set()]));
 for (const candidate of candidates) {
  if (candidate.playerId === excludedPlayer) continue;
  for (const slot of candidate.eligibleSlots) players.get(slot)?.add(candidate.playerId);
 }
 const assigned = new Map<string, Slot>();
 const visit = (slot: Slot, seen: Set<string>): boolean => {
  for (const player of players.get(slot) ?? []) {
   if (seen.has(player)) continue;
   seen.add(player);
   const previous = assigned.get(player);
   if (!previous || visit(previous, seen)) {
    assigned.set(player, slot);
    return true;
   }
  }
  return false;
 };
 return slots.every(slot => visit(slot, new Set()));
}

function playerPoolIsPlentiful(candidates: Candidate[], slots: Slot[]): boolean {
 const players = new Map(slots.map(slot => [slot, new Set<string>()]));
 for (const candidate of candidates) {
  for (const slot of candidate.eligibleSlots) {
   const set = players.get(slot);
   if (set && set.size < slots.length) set.add(candidate.playerId);
  }
 }
 return slots.every(slot => players.get(slot)!.size >= slots.length);
}

/**
 * This is deliberately stronger than separate player and franchise matchings.
 * With n franchises each offering n players for every slot, fewer than n prior
 * choices cannot exhaust either resource, so a greedy joint assignment exists.
 */
function jointPoolIsPlentiful(candidates: Candidate[], slots: Slot[]): boolean {
 const bySlot = new Map(slots.map(slot => [slot, new Map<string, Set<string>>()]));
 for (const candidate of candidates) {
  for (const slot of candidate.eligibleSlots) {
   const franchises = bySlot.get(slot);
   if (!franchises) continue;
   let players = franchises.get(candidate.franchiseId);
   if (!players) {
    players = new Set();
    franchises.set(candidate.franchiseId, players);
   }
   if (players.size < slots.length) players.add(candidate.playerId);
  }
 }
 return slots.every(slot => {
  let deepFranchises = 0;
  for (const players of bySlot.get(slot)!.values()) {
   if (players.size >= slots.length && ++deepFranchises >= slots.length) return true;
  }
  return false;
 });
}

interface CandidatePair {
 playerId: string;
 franchiseId: string;
}

/** Exact joint player/franchise search, reached only after the abundant-pool proof fails. */
function canFinishJointly(candidates: Candidate[], slots: Slot[]): boolean {
 if (slots.length === 0) return true;
 if (jointPoolIsPlentiful(candidates, slots)) return true;

 const pairsBySlot = new Map<Slot, CandidatePair[]>(slots.map(slot => [slot, []]));
 const seenBySlot = new Map<Slot, Map<string, Set<string>>>(slots.map(slot => [slot, new Map()]));
 for (const candidate of candidates) {
  for (const slot of candidate.eligibleSlots) {
   const seenByFranchise = seenBySlot.get(slot);
   if (!seenByFranchise) continue;
   let players = seenByFranchise.get(candidate.franchiseId);
   if (!players) {
    players = new Set();
    seenByFranchise.set(candidate.franchiseId, players);
   }
   if (players.has(candidate.playerId)) continue;
   players.add(candidate.playerId);
   pairsBySlot.get(slot)!.push({ playerId: candidate.playerId, franchiseId: candidate.franchiseId });
  }
 }
 for (const pairs of pairsBySlot.values()) {
  pairs.sort((a, b) => compareId(a.franchiseId, b.franchiseId) || compareId(a.playerId, b.playerId));
 }

 const usedPlayers = new Set<string>();
 const usedFranchises = new Set<string>();
 const failed = new Set<string>();
 const search = (remaining: Slot[]): boolean => {
  if (remaining.length === 0) return true;
  const key = JSON.stringify([
   remaining,
   [...usedPlayers].sort(compareId),
   [...usedFranchises].sort(compareId)
  ]);
  if (failed.has(key)) return false;

  let chosen = remaining[0];
  let options = pairsBySlot.get(chosen)!.filter(pair =>
   !usedPlayers.has(pair.playerId) && !usedFranchises.has(pair.franchiseId)
  );
  for (const slot of remaining.slice(1)) {
   const available = pairsBySlot.get(slot)!.filter(pair =>
    !usedPlayers.has(pair.playerId) && !usedFranchises.has(pair.franchiseId)
   );
   if (available.length < options.length) {
    chosen = slot;
    options = available;
   }
  }
  if (options.length === 0) {
   failed.add(key);
   return false;
  }
  const next = remaining.filter(slot => slot !== chosen);
  for (const pair of options) {
   usedPlayers.add(pair.playerId);
   usedFranchises.add(pair.franchiseId);
   const possible = next.every(slot => pairsBySlot.get(slot)!.some(option =>
    !usedPlayers.has(option.playerId) && !usedFranchises.has(option.franchiseId)
   ));
   if (possible && search(next)) return true;
   usedPlayers.delete(pair.playerId);
   usedFranchises.delete(pair.franchiseId);
  }
  failed.add(key);
  return false;
 };
 return search(slots);
}
function canFinishAfterPick(candidates: Candidate[], slots: Slot[], candidate: Candidate, policy: RulePolicy): boolean {
 const remaining = candidates.filter(item =>
  item.playerId !== candidate.playerId &&
  (!policy.uniqueFranchises || item.franchiseId !== candidate.franchiseId)
 );
 return policy.uniqueFranchises
  ? canFinishJointly(remaining, slots)
  : canFinishByPlayer(remaining, slots);
}

interface DraftAnalysis {
 policy: RulePolicy;
 slots: Slot[];
 unused: Candidate[];
 plentiful: boolean;
 viability: Map<string, boolean>;
}

const analysisCache = new WeakMap<Draft, WeakMap<Manifest, DraftAnalysis>>();

function analyzeDraft(draft: Draft, manifest: Manifest): DraftAnalysis {
 let byManifest = analysisCache.get(draft);
 if (!byManifest) {
  byManifest = new WeakMap();
  analysisCache.set(draft, byManifest);
 }
 const cached = byManifest.get(manifest);
 if (cached) return cached;
 const policy = RULE_POLICIES[draft.schemaVersion];
 const slots = openSlots(draft);
 const unused = unusedCandidates(draft, manifest, policy);
 const analysis = {
  policy,
  slots,
  unused,
  plentiful: policy.uniqueFranchises
   ? jointPoolIsPlentiful(unused, slots)
   : playerPoolIsPlentiful(unused, slots),
  viability: new Map<string, boolean>()
 };
 byManifest.set(manifest, analysis);
 return analysis;
}

function isViableForSlot(analysis: DraftAnalysis, candidate: Candidate, slot: Slot): boolean {
 if (analysis.plentiful) return true;
 const key = JSON.stringify([
  candidate.playerId,
  analysis.policy.uniqueFranchises ? candidate.franchiseId : '',
  slot
 ]);
 const cached = analysis.viability.get(key);
 if (cached !== undefined) return cached;
 const viable = canFinishAfterPick(
  analysis.unused,
  analysis.slots.filter(other => other !== slot),
  candidate,
  analysis.policy
 );
 analysis.viability.set(key, viable);
 return viable;
}

export function legalSlots(draft: Draft, candidate: Candidate, manifest: Manifest): Slot[] {
 const analysis = analyzeDraft(draft, manifest);
 if (!analysis.unused.some(item => item.seasonId === candidate.seasonId)) return [];
 return analysis.slots.filter(slot =>
  candidate.eligibleSlots.includes(slot) && isViableForSlot(analysis, candidate, slot)
 );
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

function commitPickWithPolicy(draft: Draft, manifest: Manifest, seasonId: string, slot: Slot): Draft {
 if (!draft.currentRoll) throw new Error('Roll before choosing a player');
 const candidate = manifest.candidates.find(item => item.seasonId === seasonId);
 if (!candidate || candidate.franchiseId !== draft.currentRoll.franchiseId || candidate.decade !== draft.currentRoll.decade) {
  throw new Error('Choose a season from the current roll');
 }
 const year = Number(candidate.seasonId.split(':')[1]);
 if (!Number.isInteger(year) || year < 1961 || year > 2025) throw new Error('Season is outside the supported era');
 if (!SLOTS.includes(slot) || !legalSlots(draft, candidate, manifest).includes(slot)) {
  throw new Error('Player is not eligible for that empty slot');
 }
 const picks: Pick[] = [...draft.picks, { ...draft.currentRoll, seasonId, slot }];
 const result: Draft = { ...draft, picks, currentRoll: null };
 if (picks.length === 13) {
  result.battingOrder = SLOTS.slice(0, 9).map(position => picks.find(pick => pick.slot === position)!.seasonId);
  result.starterOrder = SLOTS.slice(9, 12).map(position => picks.find(pick => pick.slot === position)!.seasonId);
 }
 return result;
}

function replayPicks(input: Replay, manifest: Manifest): { draft: Draft; random: () => number } {
 if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid draft seed');
 const policy = RULE_POLICIES[input.schemaVersion];
 let draft: Draft = {
  schemaVersion: policy.schemaVersion,
  dataVersion: manifest.dataVersion,
  modelVersion: MODEL_VERSION,
  seed: input.seed,
  picks: [],
  currentRoll: null,
  battingOrder: [],
  starterOrder: []
 };
 const random = randomStream(input.seed, 'draft');
 for (const pick of input.picks) {
  const roll = nextRoll(draft, manifest, random);
  if (roll.franchiseId !== pick.franchiseId || roll.decade !== pick.decade) {
   throw new Error('Draft roll does not match its seed');
  }
  draft = commitPickWithPolicy({ ...draft, currentRoll: roll }, manifest, pick.seasonId, pick.slot);
 }
 return { draft, random };
}

export function rollDraft(draft: Draft, manifest: Manifest): Draft {
 requireCurrentRules(draft);
 if (draft.currentRoll) return draft;
 if (draft.picks.length === 13) throw new Error('The roster is complete');
 const { draft: replayed, random } = replayPicks(draft, manifest);
 return { ...draft, currentRoll: nextRoll(replayed, manifest, random) };
}

export function commitPick(draft: Draft, manifest: Manifest, seasonId: string, slot: Slot): Draft {
 requireCurrentRules(draft);
 return commitPickWithPolicy(draft, manifest, seasonId, slot);
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

function validateWithRules(value: unknown, manifest: Manifest, allowHistorical: boolean, complete: boolean): Draft {
 if (!value || typeof value !== 'object') throw new Error('Invalid draft');
 const input = value as Draft;
 if (!SUPPORTED_REPLAY_SCHEMA_VERSIONS.includes(input.schemaVersion) ||
  (!allowHistorical && input.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) ||
  input.dataVersion !== manifest.dataVersion ||
  input.modelVersion !== MODEL_VERSION) {
  throw new Error('Saved draft is incompatible');
 }
 if (!Array.isArray(input.picks) ||
  input.picks.length > SLOTS.length ||
  complete && input.picks.length !== SLOTS.length ||
  input.picks.some(pick => !pick || typeof pick !== 'object')) {
  throw new Error('Invalid draft picks');
 }
 const { draft, random } = replayPicks(input, manifest);
 if (input.currentRoll != null) {
  if (draft.picks.length === SLOTS.length) throw new Error('Complete roster cannot have a pending roll');
  const expected = nextRoll(draft, manifest, random);
  if (input.currentRoll.franchiseId !== expected.franchiseId || input.currentRoll.decade !== expected.decade) {
   throw new Error('Invalid saved roll');
  }
  draft.currentRoll = expected;
 }
 draft.battingOrder = validateOrder(input.battingOrder, draft.battingOrder);
 draft.starterOrder = validateOrder(input.starterOrder, draft.starterOrder);
 return draft;
}

/** Validate an ongoing save under the current draft rules only. */
export function validateDraft(value: unknown, manifest: Manifest, complete = false): Draft {
 return validateWithRules(value, manifest, false, complete);
}

/** Validate a completed immutable replay under the rules recorded in that replay. */
export function validateReplay(value: unknown, manifest: Manifest): Draft {
 return validateWithRules(value, manifest, true, true);
}

export function replayInput(draft: Draft): Replay {
 const { schemaVersion, dataVersion, modelVersion, seed, picks, battingOrder, starterOrder } = draft;
 return { schemaVersion, dataVersion, modelVersion, seed, picks, battingOrder, starterOrder };
}
