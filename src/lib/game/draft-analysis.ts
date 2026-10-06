import { compareId, type Candidate, type Draft, type Manifest, type Slot } from './types.ts';
import { draftRules, type DraftRulePolicy } from './rules.ts';

interface CandidatePair {
 playerId: string;
 franchiseId: string;
}

export interface DraftAnalysis {
 policy: DraftRulePolicy;
 slots: Slot[];
 unused: Candidate[];
 plentiful: boolean;
 viability: Map<string, boolean>;
}

const analysisCache = new WeakMap<Draft, WeakMap<Manifest, DraftAnalysis>>();


function openSlots(draft: Draft, policy: DraftRulePolicy): Slot[] {
 const occupied = new Set(draft.picks.map(pick => pick.slot));
 return policy.slots.filter(slot => !occupied.has(slot));
}

function unusedCandidates(draft: Draft, manifest: Manifest, policy: DraftRulePolicy, slots: Slot[]): Candidate[] {
 const candidatesBySeason = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
 const usedPlayers = new Set<string>();
 const usedFranchises = new Set<string>();
 for (const pick of draft.picks) {
  const candidate = candidatesBySeason.get(pick.seasonId);
  if (candidate) usedPlayers.add(candidate.playerId);
  if (policy.uniqueFranchises) usedFranchises.add(pick.franchiseId);
 }
 const openSlotSet = new Set(slots);
 return manifest.candidates.filter(candidate => {
  const year = Number(candidate.seasonId.split(':')[1]);
  return Number.isInteger(year) && year >= policy.minYear && year <= policy.maxYear &&
   !usedPlayers.has(candidate.playerId) &&
   !usedFranchises.has(candidate.franchiseId) &&
   candidate.eligibleSlots.some(slot => openSlotSet.has(slot));
 });
}

/** Hall's condition for legacy drafts, where only athlete identity is unique. */
function canFinishByPlayer(candidates: Candidate[], slots: Slot[]): boolean {
 const players = new Map<Slot, Set<string>>(slots.map(slot => [slot, new Set()]));
 for (const candidate of candidates) {
  for (const slot of candidate.eligibleSlots) players.get(slot)?.add(candidate.playerId);
 }
 const assigned = new Map<string, Slot>();
 function visit(slot: Slot, seen: Set<string>): boolean {
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
 }
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
 * This sufficient proof is intentionally stronger than a matching. Individual
 * slots need n deep franchises with n athletes apiece. BP instead needs n
 * franchises with a valid unit because each franchise has one composite ID.
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
  const franchises = bySlot.get(slot)!;
  if (slot === 'BP') return franchises.size >= slots.length;
  let deepFranchises = 0;
  for (const players of franchises.values()) {
   if (players.size >= slots.length && ++deepFranchises >= slots.length) return true;
  }
  return false;
 });
}

/** Exact joint athlete/franchise search used when the sufficient proof fails. */
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

function canFinishAfterPick(candidates: Candidate[], slots: Slot[], candidate: Candidate, policy: DraftRulePolicy): boolean {
 const remaining = candidates.filter(item =>
  item.playerId !== candidate.playerId &&
  (!policy.uniqueFranchises || item.franchiseId !== candidate.franchiseId)
 );
 return policy.uniqueFranchises
  ? canFinishJointly(remaining, slots)
  : canFinishByPlayer(remaining, slots);
}

export function analyzeDraft(draft: Draft, manifest: Manifest): DraftAnalysis {
 let byManifest = analysisCache.get(draft);
 if (!byManifest) {
  byManifest = new WeakMap();
  analysisCache.set(draft, byManifest);
 }
 const cached = byManifest.get(manifest);
 if (cached) return cached;
 const policy = draftRules(draft.schemaVersion);
 const slots = openSlots(draft, policy);
 const unused = unusedCandidates(draft, manifest, policy, slots);
 const analysis: DraftAnalysis = {
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

export function isViableForSlot(analysis: DraftAnalysis, candidate: Candidate, slot: Slot): boolean {
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

export function canFinishDraft(draft: Draft, manifest: Manifest): boolean {
 const analysis = analyzeDraft(draft, manifest);
 return analysis.policy.uniqueFranchises
  ? canFinishJointly(analysis.unused, analysis.slots)
  : canFinishByPlayer(analysis.unused, analysis.slots);
}
