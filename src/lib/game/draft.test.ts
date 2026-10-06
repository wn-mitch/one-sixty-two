import { describe, expect, it } from 'vitest';
import {
 availableCandidates,
 commitPick,
 createDraft,
 legalReassignments,
 legalSlots,
 reassignPick,
 replayInput,
 rollDraft,
 validateDraft,
 validateReplay
} from './draft.ts';
import { decodeReplay, encodeReplay } from './share.ts';
import { persistDraft, restoreDraft, STORAGE_KEY } from './persistence.ts';
import { HITTER_SLOTS, LEGACY_SLOTS, STARTER_SLOTS, SLOTS, type Candidate, type Draft, type Manifest, type Replay, type Slot } from './types.ts';
import { randomStream } from './random.ts';

function makeManifest(candidates: Candidate[], dataVersion = 'synthetic-v1'): Manifest {
 const franchiseIds = [...new Set(candidates.map(candidate => candidate.franchiseId))].sort();
 return {
  schemaVersion: 1,
  dataVersion,
  sourceCommit: 'synthetic',
  candidates,
  franchises: franchiseIds.map(id => ({ id, name: `Club ${id}`, decades: [1980, 1990, 2020] })),
  chunks: {},
  simulationUrl: '',
  attributionUrl: '',
  archiveUrl: '',
  approximations: [],
  coverage: [],
  diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
  attribution: {
   title: 'Synthetic source',
   credit: 'Synthetic contributors',
   sourceUrl: 'https://data.invalid',
   license: 'CC BY-SA 3.0',
   licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
   sourceCommit: 'synthetic',
   changes: 'Synthetic data.',
   fullNotice: 'Synthetic notice.'
  }
 };
}

const candidates: Candidate[] = SLOTS.map((slot, index) => ({
 seasonId: `anon${index}:1982:AL:T${index}`,
 playerId: `anon${index}`,
 franchiseId: `F${index.toString().padStart(2, '0')}`,
 decade: index === 12 ? 2020 : 1980,
 eligibleSlots: [slot]
}));
candidates[0].eligibleSlots = ['C', '1B'];
candidates[0].seasonId = 'anon0:1982:AL:T0';
candidates[12].seasonId = 'anon12:2022:NL:T12';
candidates.push({ ...candidates[0], seasonId: 'anon0:1983:AL:T0' });
const manifest = makeManifest(candidates);

function finish(seed = 162, source = manifest): Draft {
 let draft = createDraft(source, seed);
 while (draft.picks.length < SLOTS.length) {
  draft = rollDraft(draft, source);
  const candidate = availableCandidates(draft, source)[0];
  draft = commitPick(draft, source, candidate.seasonId, legalSlots(draft, candidate, source)[0]);
 }
 return draft;
}

function memoryStorage() {
 const values: Record<string, string> = {};
 return {
  getItem: (key: string) => values[key] ?? null,
  setItem: (key: string, value: string) => { values[key] = value; },
  removeItem: (key: string) => { delete values[key]; }
 };
}

function draftWithOnlySlotsOpen(pool: Manifest, open: Slot[]): Draft {
 const openSet = new Set<Slot>(open);
 const picks = SLOTS.filter(slot => !openSet.has(slot)).map((slot, index) => {
  const candidate = pool.candidates.find(item => item.eligibleSlots.includes(slot) && item.playerId === `filled-${index}`)!;
  return { seasonId: candidate.seasonId, slot, franchiseId: candidate.franchiseId, decade: candidate.decade };
 });
 return { ...createDraft(pool, 1), picks };
}

function scarcePool(openCandidates: Candidate[], open: Slot[]): Manifest {
 let fillerIndex = 0;
 const fillers = SLOTS.filter(slot => !open.includes(slot)).map(slot => {
  const index = fillerIndex++;
  return {
   seasonId: `filled-${index}:1982:AL:Z${index}`,
   playerId: `filled-${index}`,
   franchiseId: `Z${index}`,
   decade: 1980,
   eligibleSlots: [slot]
  } satisfies Candidate;
 });
 return makeManifest([...fillers, ...openCandidates], 'scarce-v1');
}

describe('permanent deterministic drafting', () => {
 it.each(Array.from({ length: 32 }, (_, seed) => seed))('finishes seed %i with fourteen distinct identities and franchises', seed => {
  const initial = createDraft(manifest, seed);
  expect(initial.schemaVersion).toBe(3);
  expect(legalSlots(initial, candidates[0], manifest)).toEqual(['C']);
  const draft = finish(seed);
  const selected = draft.picks.map(pick => manifest.candidates.find(item => item.seasonId === pick.seasonId)!);
  expect(new Set(selected.map(candidate => candidate.playerId)).size).toBe(SLOTS.length);
  expect(new Set(selected.map(candidate => candidate.franchiseId)).size).toBe(SLOTS.length);
  expect(draft.picks.map(pick => pick.slot).sort()).toEqual([...SLOTS].sort());
  expect(draft.battingOrder).toHaveLength(9);
  expect(draft.starterOrder).toHaveLength(3);
  expect(validateDraft(draft, manifest, true)).toEqual(draft);
 });

 it('removes every decade of a used franchise and every incarnation of a used athlete', () => {
  const expanded = makeManifest(candidates.flatMap((candidate, index) => [
   candidate,
   {
    seasonId: `alternate${index}:1992:NL:R${index}`,
    playerId: `alternate${index}`,
    franchiseId: candidate.franchiseId,
    decade: 1990,
    eligibleSlots: candidate.eligibleSlots
   },
   {
    seasonId: `${candidate.playerId}:1992:NL:X${index}`,
    playerId: candidate.playerId,
    franchiseId: `X${index}`,
    decade: 1990,
    eligibleSlots: candidate.eligibleSlots
   }
  ]));
  const rolled = rollDraft(createDraft(expanded, 19), expanded);
  const selected = availableCandidates(rolled, expanded)[0];
  const next = commitPick(rolled, expanded, selected.seasonId, legalSlots(rolled, selected, expanded)[0]);
  const unused = availableCandidates(next, expanded, null);
  expect(unused.some(candidate => candidate.franchiseId === selected.franchiseId)).toBe(false);
  expect(unused.some(candidate => candidate.playerId === selected.playerId)).toBe(false);
  expect(rollDraft(next, expanded).currentRoll?.franchiseId).not.toBe(selected.franchiseId);
 });

 it('rejects a joint player/franchise trap that two independent matchings would accept', () => {
  const trap = [
   { seasonId: 'x:1982:AL:A', playerId: 'x', franchiseId: 'A', decade: 1980, eligibleSlots: ['C'] },
   { seasonId: 'y:1982:AL:A', playerId: 'y', franchiseId: 'A', decade: 1980, eligibleSlots: ['1B'] },
   { seasonId: 'y:1982:AL:B', playerId: 'y', franchiseId: 'B', decade: 1980, eligibleSlots: ['C'] },
   { seasonId: 'x:1982:AL:B', playerId: 'x', franchiseId: 'B', decade: 1980, eligibleSlots: ['1B'] }
  ] satisfies Candidate[];
  const pool = scarcePool(trap, ['C', '1B']);
  const draft = draftWithOnlySlotsOpen(pool, ['C', '1B']);
  expect(availableCandidates(draft, pool, null)).toEqual([]);
 });

 it('only offers slot choices that leave a joint completion', () => {
  const scarce = [
   { seasonId: 'x:1982:AL:A', playerId: 'x', franchiseId: 'A', decade: 1980, eligibleSlots: ['C', '1B'] },
   { seasonId: 'y:1982:AL:B', playerId: 'y', franchiseId: 'B', decade: 1980, eligibleSlots: ['1B'] },
   { seasonId: 'x:1982:AL:B', playerId: 'x', franchiseId: 'B', decade: 1980, eligibleSlots: ['C'] }
  ] satisfies Candidate[];
  const pool = scarcePool(scarce, ['C', '1B']);
  const draft = draftWithOnlySlotsOpen(pool, ['C', '1B']);
  expect(legalSlots(draft, scarce[0], pool)).toEqual(['C']);
  expect(availableCandidates(draft, pool, null).map(candidate => candidate.seasonId)).toContain(scarce[0].seasonId);
 });

 it('does not invent early decades for a newer franchise', () => {
  const rolls = Array.from({ length: 64 }, (_, seed) => rollDraft(createDraft(manifest, seed), manifest).currentRoll!);
  expect(rolls.some(roll => roll.franchiseId === 'F12')).toBe(true);
  expect(rolls.filter(roll => roll.franchiseId === 'F12').every(roll => roll.decade === 2020)).toBe(true);
 });

 it('keeps an unresolved roll across saves and rejects double assignment', () => {
  const storage = memoryStorage();
  const draft = rollDraft(createDraft(manifest, 162), manifest);
  expect(persistDraft(storage, draft, 'draft')).toBeNull();
  expect(restoreDraft(storage, manifest)).toEqual({ kind: 'valid', draft, phase: 'draft' });
  expect(rollDraft(draft, manifest)).toBe(draft);
  expect(() => validateDraft({
   ...draft,
   currentRoll: { ...draft.currentRoll!, decade: draft.currentRoll!.decade + 10 }
  }, manifest)).toThrow('saved roll');
  const candidate = availableCandidates(draft, manifest)[0];
  const next = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
  expect(() => commitPick(next, manifest, candidate.seasonId, candidate.eligibleSlots[0])).toThrow('Roll before');
  expect(availableCandidates(next, manifest, null).some(item => item.playerId === candidate.playerId)).toBe(false);
  expect(availableCandidates(next, manifest, null).some(item => item.franchiseId === candidate.franchiseId)).toBe(false);
 });

 it('preserves a closing-pitcher-only final roll', () => {
  let finalDraft = createDraft(manifest, 25);
  while (finalDraft.picks.length < SLOTS.length - 1) {
   finalDraft = rollDraft(finalDraft, manifest);
   const candidate = availableCandidates(finalDraft, manifest)[0];
   finalDraft = commitPick(finalDraft, manifest, candidate.seasonId, legalSlots(finalDraft, candidate, manifest)[0]);
  }
  expect(finalDraft.picks.every(pick => pick.slot !== 'CL')).toBe(true);
  const rolled = rollDraft(finalDraft, manifest);
  const remaining = availableCandidates(rolled, manifest);
  expect(remaining).toHaveLength(1);
  expect(legalSlots(rolled, remaining[0], manifest)).toEqual(['CL']);
  expect(validateDraft(commitPick(rolled, manifest, remaining[0].seasonId, 'CL'), manifest, true).picks).toHaveLength(SLOTS.length);
 });

 it('rejects duplicate-franchise forgeries in saves and current replays', () => {
  const draft = finish();
  const forged = {
   ...draft,
   picks: draft.picks.map((pick, index) => index === 12 ? { ...pick, franchiseId: draft.picks[0].franchiseId } : pick)
  };
  expect(() => validateDraft(forged, manifest, true)).toThrow();
  expect(() => validateReplay(replayInput(forged), manifest)).toThrow();
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...forged, phase: 'results' }));
  expect(restoreDraft(storage, manifest).kind).toBe('incompatible');
 });

 it('rejects out-of-era seasons and illegal lineup orders', () => {
  const draft = finish();
  expect(() => validateDraft({ ...draft, battingOrder: Array(9).fill(draft.battingOrder[0]) }, manifest, true)).toThrow('lineup');
  const oldCandidates = candidates.map(candidate => ({
   ...candidate,
   seasonId: candidate.seasonId.replace(/:(?:19|20)\d{2}:/, ':1949:'),
   decade: 1950
  }));
  const old = makeManifest(oldCandidates, 'old');
  const candidate = oldCandidates[0];
  const rolled = {
   ...createDraft(old, 0),
   currentRoll: { franchiseId: candidate.franchiseId, decade: candidate.decade }
  };
  expect(() => commitPick(rolled, old, candidate.seasonId, 'C')).toThrow('supported era');
  const boundaryCandidates = candidates.map(candidate => ({
   ...candidate,
   seasonId: candidate.seasonId.replace(/:(?:19|20)\d{2}:/, ':1950:'),
   decade: 1950
  }));
  const boundary = makeManifest(boundaryCandidates, 'boundary');
  expect(finish(0, boundary).picks).toHaveLength(SLOTS.length);
 });

 it('validates current replay inputs and isolates random streams', () => {
  const draft = finish();
  draft.battingOrder.reverse();
  draft.starterOrder.reverse();
  const replay = validateReplay(replayInput(draft), manifest);
  expect(replay).toEqual(draft);
  const schedule = randomStream(draft.seed, 'schedule');
  const restoredSchedule = randomStream(replay.seed, 'schedule');
  randomStream(draft.seed, 'draft')();
  expect(Array.from({ length: 162 }, () => schedule())).toEqual(Array.from({ length: 162 }, () => restoredSchedule()));
  expect(() => validateReplay({ ...replayInput(draft), dataVersion: 'new' }, manifest)).toThrow('incompatible');
 });

 it('moves a drafted hitter while preserving a pending roll and replays the exact selected season', () => {
  const flexible = makeManifest(candidates.map(candidate => {
   if (candidate.eligibleSlots.includes('RF') || candidate.eligibleSlots.includes('DH')) {
    return { ...candidate, eligibleSlots: ['RF', 'DH'] as Slot[] };
   }
   return { ...candidate, eligibleSlots: [...candidate.eligibleSlots] };
  }), 'flexible-v1');
  let pending: Draft | undefined;
  for (let seed = 0; seed < 256 && !pending; seed++) {
   let draft = createDraft(flexible, seed);
   while (draft.picks.length < SLOTS.length) {
    draft = rollDraft(draft, flexible);
    const options = availableCandidates(draft, flexible);
    const rfPick = draft.picks.find(pick => pick.slot === 'RF');
    const dhCandidate = options.find(candidate => candidate.eligibleSlots.includes('DH') && candidate.seasonId !== rfPick?.seasonId);
    if (rfPick && dhCandidate && draft.picks.length < SLOTS.length - 1 && draft.picks.every(pick => pick.slot !== 'DH')) {
     pending = draft;
     break;
    }
    const candidate = options[0];
    const slot = legalSlots(draft, candidate, flexible).find(value => value !== 'DH') ??
     legalSlots(draft, candidate, flexible)[0];
    draft = commitPick(draft, flexible, candidate.seasonId, slot);
   }
  }
  expect(pending).toBeDefined();
  const original = pending!.picks.find(pick => pick.slot === 'RF')!;
  const roll = pending!.currentRoll;
  const pickCount = pending!.picks.length;
  const moved = reassignPick(pending!, flexible, original.seasonId, 'DH');
  if (moved.schemaVersion !== 3) throw new Error('Expected current draft');
  expect(moved.currentRoll).toEqual(roll);
  expect(moved.seed).toBe(pending!.seed);
  expect(moved.picks).toHaveLength(pickCount);
  expect(moved.actions.at(-1)).toEqual({ type: 'reassign', seasonId: original.seasonId, slot: 'DH' });
  const target = availableCandidates(moved, flexible)[0];
  expect(legalSlots(moved, target, flexible)).toContain('RF');
  let completed = commitPick(moved, flexible, target.seasonId, 'RF');
  completed = reassignPick(completed, flexible, original.seasonId, 'RF');
  while (completed.picks.length < SLOTS.length) {
   completed = rollDraft(completed, flexible);
   const candidate = availableCandidates(completed, flexible)[0];
   completed = commitPick(completed, flexible, candidate.seasonId, legalSlots(completed, candidate, flexible)[0]);
  }
  expect(decodeReplay(encodeReplay(completed), flexible)).toEqual(completed);
 });

 it('swaps reciprocal hitter assignments without changing chronology or lineup order', () => {
  const flexible = makeManifest(candidates.map(candidate => {
   if (candidate.eligibleSlots.includes('C') || candidate.eligibleSlots.includes('1B')) {
    return { ...candidate, eligibleSlots: ['C', '1B'] as Slot[] };
   }
   return { ...candidate, eligibleSlots: [...candidate.eligibleSlots] };
  }), 'swap-v1');
  const draft = finish(162, flexible);
  const catcher = draft.picks.find(pick => pick.slot === 'C')!;
  const firstBaseman = draft.picks.find(pick => pick.slot === '1B')!;
  const battingOrder = [...draft.battingOrder];
  const starterOrder = [...draft.starterOrder];
  expect(legalReassignments(draft, flexible, catcher.seasonId)).toContainEqual({
   slot: '1B',
   swapWith: firstBaseman.seasonId
  });
  const swapped = reassignPick(draft, flexible, catcher.seasonId, '1B');
  expect(swapped.picks.map(pick => pick.seasonId)).toEqual(draft.picks.map(pick => pick.seasonId));
  expect(swapped.picks.find(pick => pick.seasonId === catcher.seasonId)?.slot).toBe('1B');
  expect(swapped.picks.find(pick => pick.seasonId === firstBaseman.seasonId)?.slot).toBe('C');
  expect(swapped.battingOrder).toEqual(battingOrder);
  expect(swapped.starterOrder).toEqual(starterOrder);
  expect(validateReplay(replayInput(swapped), flexible)).toEqual(swapped);
  expect(reassignPick(swapped, flexible, catcher.seasonId, '1B')).toBe(swapped);
 });

 it('rejects incompatible swaps, non-hitters, and moves that strand completion', () => {
  const selected: Candidate = {
   seasonId: 'selected:1982:AL:A',
   playerId: 'selected',
   franchiseId: 'A',
   decade: 1980,
   eligibleSlots: ['C', '1B']
  };
  const remaining: Candidate = {
   seasonId: 'remaining:1982:AL:B',
   playerId: 'remaining',
   franchiseId: 'B',
   decade: 1980,
   eligibleSlots: ['1B']
  };
  const fillers = SLOTS.filter(slot => slot !== 'C' && slot !== '1B').map((slot, index) => ({
   seasonId: `fixed${index}:1982:AL:T${index}`,
   playerId: `fixed${index}`,
   franchiseId: `F${index}`,
   decade: 1980,
   eligibleSlots: [slot]
  } satisfies Candidate));
  const source = makeManifest([selected, remaining, ...fillers], 'stranding-v1');
  const picked = [selected, ...fillers].map(candidate => ({
   seasonId: candidate.seasonId,
   slot: candidate === selected ? 'C' as const : candidate.eligibleSlots[0],
   franchiseId: candidate.franchiseId,
   decade: candidate.decade
  }));
  const draft = { ...createDraft(source, 1), picks: picked };
  expect(() => reassignPick(draft, source, selected.seasonId, '1B')).toThrow('prevent completing');

  const reciprocal = makeManifest([selected, remaining, ...fillers], 'incompatible-swap-v1');
  const starter = fillers.find(candidate => candidate.eligibleSlots.includes('SP1'))!;
  const occupied = {
   ...createDraft(reciprocal, 1),
   picks: [
    { seasonId: selected.seasonId, slot: 'C' as const, franchiseId: 'A', decade: 1980 },
    { seasonId: remaining.seasonId, slot: '1B' as const, franchiseId: 'B', decade: 1980 },
    { seasonId: starter.seasonId, slot: 'SP1' as const, franchiseId: starter.franchiseId, decade: starter.decade }
   ]
  };
  expect(() => reassignPick(occupied, reciprocal, selected.seasonId, '1B')).toThrow('other player');
  expect(() => reassignPick(occupied, reciprocal, selected.seasonId, 'DH')).toThrow('does not qualify');
  expect(() => reassignPick(occupied, reciprocal, starter.seasonId, 'DH')).toThrow('Choose a drafted position player');
  expect(() => reassignPick(occupied, reciprocal, 'not-drafted', 'DH')).toThrow('Choose a drafted position player');
 });

 it('rejects a reassignment that leaves its exact pending roll without a legal pick', () => {
  const selected: Candidate = {
   seasonId: 'selected:1982:AL:A',
   playerId: 'selected',
   franchiseId: 'A',
   decade: 1980,
   eligibleSlots: ['C', '1B']
  };
  const pendingCandidate: Candidate = {
   seasonId: 'pending:1982:AL:P',
   playerId: 'pending',
   franchiseId: 'P',
   decade: 1980,
   eligibleSlots: ['1B']
  };
  const rescue: Candidate = {
   seasonId: 'rescue:1982:AL:Q',
   playerId: 'rescue',
   franchiseId: 'Q',
   decade: 1980,
   eligibleSlots: ['C']
  };
  const fillers = SLOTS.filter(slot => slot !== 'C' && slot !== '1B').map((slot, index) => ({
   seasonId: `pending-fixed${index}:1982:AL:T${index}`,
   playerId: `pending-fixed${index}`,
   franchiseId: `PF${index}`,
   decade: 1980,
   eligibleSlots: [slot]
  } satisfies Candidate));
  const source = makeManifest([selected, pendingCandidate, rescue, ...fillers], 'pending-stranding-v1');
  const draft = {
   ...createDraft(source, 1),
   picks: [selected, ...fillers].map(candidate => ({
    seasonId: candidate.seasonId,
    slot: candidate === selected ? 'C' as const : candidate.eligibleSlots[0],
    franchiseId: candidate.franchiseId,
    decade: candidate.decade
   })),
   currentRoll: { franchiseId: 'P', decade: 1980 }
  };
  expect(() => reassignPick(draft, source, selected.seasonId, '1B')).toThrow('current roll');
 });

 it('reserves a scarce bullpen franchise when evaluating individual picks', () => {
  const open = [
   { seasonId: 'hitter-a:1982:AL:A', playerId: 'hitter-a', franchiseId: 'A', decade: 1980, eligibleSlots: ['C'] },
   { seasonId: 'hitter-b:1982:AL:B', playerId: 'hitter-b', franchiseId: 'B', decade: 1980, eligibleSlots: ['C'] },
   { seasonId: 'bullpen:1982:AL:A', playerId: 'bullpen:A', franchiseId: 'A', decade: 1980, eligibleSlots: ['BP'] }
  ] satisfies Candidate[];
  const pool = scarcePool(open, ['C', 'BP']);
  const draft = draftWithOnlySlotsOpen(pool, ['C', 'BP']);
  expect(legalSlots(draft, open[0], pool)).toEqual([]);
  expect(legalSlots(draft, open[1], pool)).toEqual(['C']);
 });

 it('rejects forged snapshots and malformed or reordered action histories', () => {
  const flexible = makeManifest(candidates.map(candidate => {
   if (candidate.eligibleSlots.includes('C') || candidate.eligibleSlots.includes('1B')) {
    return { ...candidate, eligibleSlots: ['C', '1B'] as Slot[] };
   }
   return { ...candidate, eligibleSlots: [...candidate.eligibleSlots] };
  }), 'forgery-v1');
  const complete = finish(162, flexible);
  const catcher = complete.picks.find(pick => pick.slot === 'C')!;
  const moved = reassignPick(complete, flexible, catcher.seasonId, '1B');
  if (moved.schemaVersion !== 3) throw new Error('Expected current replay');
  const input = replayInput(moved);
  if (input.schemaVersion !== 3) throw new Error('Expected current replay');
  const forgedPick = {
   ...input,
   picks: input.picks.map((pick, index) => index === 0 ? { ...pick, slot: 'DH' as const } : pick)
  };
  expect(() => validateReplay(forgedPick, flexible)).toThrow('snapshot');
  expect(() => validateReplay({ ...input, actions: input.actions.slice(0, -1) }, flexible)).toThrow('snapshot');
  expect(() => validateReplay({ ...input, actions: [...input.actions, input.actions.at(-1)!] }, flexible)).toThrow('Invalid draft action');
  expect(() => validateReplay({ ...input, actions: [input.actions.at(-1)!, ...input.actions.slice(0, -1)] }, flexible)).toThrow();
  expect(() => validateReplay({ ...input, actions: [input.actions[1], input.actions[0], ...input.actions.slice(2)] }, flexible)).toThrow();
  expect(() => validateReplay({ ...input, actions: [input.actions[0], input.actions[0], ...input.actions.slice(1)] }, flexible)).toThrow();
  expect(() => validateReplay({
   ...input,
   actions: [...input.actions.slice(0, -1), { type: 'reassign', seasonId: 'undrafted:1982:AL:X', slot: 'C' }]
  }, flexible)).toThrow('Choose a drafted position player');
  expect(() => validateReplay({ ...input, actions: [...input.actions, { type: 'unknown' }] }, flexible)).toThrow('Invalid draft action');
 });

 it('verifies a completed schema-one replay under its immutable player-only rules', () => {
  const legacyCandidates = LEGACY_SLOTS.map((slot, index) => ({
   seasonId: `legacy${index}:1982:AL:A`,
   playerId: `legacy${index}`,
   franchiseId: 'A',
   decade: 1980,
   eligibleSlots: [slot]
  })) satisfies Candidate[];
  const legacyManifest = makeManifest(legacyCandidates, 'legacy-v1');
  const legacy: Replay = {
   schemaVersion: 1,
   dataVersion: legacyManifest.dataVersion,
   modelVersion: 'pa-v1',
   seed: 162,
   picks: legacyCandidates.map((candidate, index) => ({
    seasonId: candidate.seasonId,
    slot: LEGACY_SLOTS[index],
    franchiseId: 'A',
    decade: 1980
   })),
   battingOrder: legacyCandidates.slice(0, 9).map(candidate => candidate.seasonId),
   starterOrder: legacyCandidates.slice(9, 12).map(candidate => candidate.seasonId)
  };
  const restored = validateReplay(legacy, legacyManifest);
  expect(restored.schemaVersion).toBe(1);
  expect(new Set(restored.picks.map(pick => pick.franchiseId))).toEqual(new Set(['A']));
  const token = btoa(JSON.stringify(legacy)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  expect(decodeReplay(token, legacyManifest)).toEqual(restored);
  const incompatibleToken = btoa(JSON.stringify({ ...legacy, dataVersion: 'retired' }))
   .replace(/\+/g, '-')
   .replace(/\//g, '_')
   .replace(/=+$/, '');
  expect(() => decodeReplay(incompatibleToken, legacyManifest)).toThrow('incompatible');
  expect(() => validateDraft(legacy, legacyManifest, true)).toThrow('incompatible');
  expect(() => rollDraft(restored, legacyManifest)).toThrow('incompatible');
  expect(() => commitPick({ ...restored, currentRoll: { franchiseId: 'A', decade: 1980 } }, legacyManifest, legacy.picks[0].seasonId, 'C')).toThrow('incompatible');
 });

 it('verifies schema-two chronology with its original era, slots, and unique-franchise policy', () => {
  const legacyCandidates = LEGACY_SLOTS.map((slot, index) => ({
   seasonId: `schema2-${index}:1982:AL:T${index}`,
   playerId: `schema2-${index}`,
   franchiseId: `F${index}`,
   decade: 1980,
   eligibleSlots: [slot]
  } satisfies Candidate));
  const ignored = [
   { seasonId: 'early:1959:AL:E', playerId: 'early', franchiseId: 'E', decade: 1950, eligibleSlots: ['C'] },
   { seasonId: 'bullpen:1982:AL:BP', playerId: 'bullpen:BP', franchiseId: 'BP', decade: 1980, eligibleSlots: ['BP'] }
  ] satisfies Candidate[];
  const source = makeManifest([...legacyCandidates, ...ignored], 'legacy-v2');
  const random = randomStream(162, 'draft');
  const remaining = [...legacyCandidates];
  const picks: Replay['picks'] = [];
  while (remaining.length) {
   const franchises = remaining.map(candidate => candidate.franchiseId).sort();
   const franchiseId = franchises[Math.floor(random() * franchises.length)];
   random();
   const index = remaining.findIndex(candidate => candidate.franchiseId === franchiseId);
   const [candidate] = remaining.splice(index, 1);
   picks.push({
    seasonId: candidate.seasonId,
    slot: candidate.eligibleSlots[0],
    franchiseId,
    decade: 1980
   });
  }
  const replay: Replay = {
   schemaVersion: 2,
   dataVersion: source.dataVersion,
   modelVersion: 'pa-v1',
   seed: 162,
   picks,
   battingOrder: HITTER_SLOTS.map(slot => legacyCandidates.find(candidate => candidate.eligibleSlots.includes(slot))!.seasonId),
   starterOrder: STARTER_SLOTS.map(slot => legacyCandidates.find(candidate => candidate.eligibleSlots.includes(slot))!.seasonId)
  };
  const restored = validateReplay(replay, source);
  expect(restored.picks).toHaveLength(LEGACY_SLOTS.length);
  expect(new Set(restored.picks.map(pick => pick.franchiseId)).size).toBe(LEGACY_SLOTS.length);
  expect(restored.picks.some(pick => pick.seasonId === ignored[0].seasonId || pick.seasonId === ignored[1].seasonId)).toBe(false);
 });

 it('does not overwrite incompatible saves and allows blocked-storage play', () => {
  const storage = memoryStorage();
  const legacy = JSON.stringify({ ...finish(), schemaVersion: 1 });
  storage.setItem(STORAGE_KEY, legacy);
  expect(restoreDraft(storage, manifest).kind).toBe('incompatible');
  expect(storage.getItem(STORAGE_KEY)).toBe(legacy);
  const blocked = {
   getItem: () => { throw new Error('blocked'); },
   setItem: () => { throw new Error('blocked'); },
   removeItem: () => { throw new Error('blocked'); }
  };
  expect(restoreDraft(blocked, manifest).kind).toBe('unavailable');
  expect(persistDraft(blocked, finish(), 'simulating')).toContain('Resume unavailable');
 });

 it('preserves exact simulation inputs on reload', () => {
  const storage = memoryStorage();
  const draft = finish();
  expect(persistDraft(storage, draft, 'simulating')).toBeNull();
  expect(restoreDraft(storage, manifest)).toEqual({ kind: 'valid', draft, phase: 'simulating' });
 });
});
