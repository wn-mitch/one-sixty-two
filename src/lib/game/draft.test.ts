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
 selectHomeStadium,
 validateDraft,
 validateReplay
} from './draft.ts';
import { decodeReplay, encodeReplay } from './share.ts';
import { persistDraft, restoreDraft, STORAGE_KEY } from './persistence.ts';
import { SLOTS, type Candidate, type Draft, type Manifest, type Slot } from './types.ts';
import { randomStream } from './random.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';

function makeManifest(candidates: Candidate[], dataVersion = 'synthetic-v1'): Manifest {
 const franchiseIds = [...new Set(candidates.map(candidate => candidate.franchiseId))].sort();
 return {
  schemaVersion: 1,
  dataVersion,
  sourceCommit: 'synthetic',
  candidates,
  franchises: franchiseIds.map(id => ({ id, name: `Club ${id}`, decades: [1980, 1990, 2020] })),
  chunks: {},
  stadiums: syntheticStadiumSummaries(franchiseIds),
  simulationUrl: '',
  attributionUrl: '',
  showcaseUrl: '',
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

/** A new draft with its home stadium pinned, ready to roll. */
function startDraft(source: Manifest, seed: number): Draft {
 return selectHomeStadium(createDraft(source, seed), source, source.stadiums[0].ref.id);
}

describe('home stadium selection', () => {
 it('must precede the first roll and is recorded as the sole first action', () => {
  const draft = createDraft(manifest, 7);
  expect(() => rollDraft(draft, manifest)).toThrow('home stadium');
  const pinned = selectHomeStadium(draft, manifest, manifest.stadiums[1].ref.id);
  expect(pinned.homeStadium).toEqual(manifest.stadiums[1].ref);
  expect(pinned.actions).toEqual([{ type: 'select-stadium', stadiumId: manifest.stadiums[1].ref.id, stadiumVersion: manifest.stadiums[1].ref.version }]);
  expect(() => selectHomeStadium(pinned, manifest, manifest.stadiums[2].ref.id)).toThrow('already chosen');
  expect(() => selectHomeStadium(draft, manifest, 'nowhere-2025')).toThrow('current deck');
 });
 it('does not change the draft rolls for a seed', () => {
  const first = rollDraft(selectHomeStadium(createDraft(manifest, 9), manifest, manifest.stadiums[0].ref.id), manifest);
  const second = rollDraft(selectHomeStadium(createDraft(manifest, 9), manifest, manifest.stadiums[3].ref.id), manifest);
  expect(first.currentRoll).toEqual(second.currentRoll);
 });
 it('rejects a forged stadium snapshot or an unknown stadium version on replay', () => {
  const saved = rollDraft(startDraft(manifest, 11), manifest);
  expect(() => validateDraft({ ...saved, homeStadium: manifest.stadiums[2].ref }, manifest)).toThrow('snapshot');
  const forged = { ...saved, actions: [{ type: 'select-stadium', stadiumId: manifest.stadiums[0].ref.id, stadiumVersion: 'old' }, ...saved.actions.slice(1)] };
  expect(() => validateDraft(forged, manifest)).toThrow();
 });
 it('saves and resumes an unselected run in the stadium phase only', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) };
  persistDraft(storage, createDraft(manifest, 3), 'stadium');
  expect(restoreDraft(storage, manifest)).toMatchObject({ kind: 'valid', phase: 'stadium' });
  persistDraft(storage, createDraft(manifest, 3), 'draft');
  expect(restoreDraft(storage, manifest).kind).toBe('incompatible');
 });
});

function finish(seed = 162, source = manifest): Draft {
 let draft = startDraft(source, seed);
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
 return { ...startDraft(pool, 1), picks };
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
  expect(initial.homeStadium).toBeNull();
  expect(initial.schemaVersion).toBe(5);
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
  const rolled = rollDraft(startDraft(expanded, 19), expanded);
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
  const rolls = Array.from({ length: 64 }, (_, seed) => rollDraft(startDraft(manifest, seed), manifest).currentRoll!);
  expect(rolls.some(roll => roll.franchiseId === 'F12')).toBe(true);
  expect(rolls.filter(roll => roll.franchiseId === 'F12').every(roll => roll.decade === 2020)).toBe(true);
 });

 it('keeps an unresolved roll across saves and rejects double assignment', () => {
  const storage = memoryStorage();
  const draft = rollDraft(startDraft(manifest, 162), manifest);
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
  let finalDraft = startDraft(manifest, 25);
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
   ...startDraft(old, 0),
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
   let draft = startDraft(flexible, seed);
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
  if (moved.schemaVersion !== 5) throw new Error('Expected current draft');
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
  const draft = { ...startDraft(source, 1), picks: picked };
  expect(() => reassignPick(draft, source, selected.seasonId, '1B')).toThrow('prevent completing');

  const reciprocal = makeManifest([selected, remaining, ...fillers], 'incompatible-swap-v1');
  const starter = fillers.find(candidate => candidate.eligibleSlots.includes('SP1'))!;
  const occupied = {
   ...startDraft(reciprocal, 1),
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
   ...startDraft(source, 1),
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
  if (moved.schemaVersion !== 5) throw new Error('Expected current replay');
  const input = replayInput(moved);
  if (input.schemaVersion !== 5) throw new Error('Expected current replay');
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

 it('rejects every pre-cutover replay schema and model at replay, URL, and persistence boundaries', () => {
  const current = replayInput(finish());
  for (const schemaVersion of [1, 2, 3]) {
   const obsolete = { ...current, schemaVersion };
   expect(() => validateReplay(obsolete, manifest)).toThrow('incompatible');
   const token = btoa(JSON.stringify(obsolete)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
   expect(() => decodeReplay(token, manifest)).toThrow('incompatible');
  }

  const obsoleteModel = { ...current, modelVersion: 'pa-v2' };
  expect(() => validateReplay(obsoleteModel, manifest)).toThrow('incompatible');

  const storage = memoryStorage();
  const saved = JSON.stringify({ ...current, schemaVersion: 3, modelVersion: 'pa-v2', phase: 'results' });
  storage.setItem(STORAGE_KEY, saved);
  expect(restoreDraft(storage, manifest)).toMatchObject({ kind: 'incompatible' });
  expect(storage.getItem(STORAGE_KEY)).toBe(saved);
 });

 it('does not overwrite incompatible saves and allows blocked-storage play', () => {
  const storage = memoryStorage();
  const obsolete = JSON.stringify({ ...finish(), schemaVersion: 1 });
  storage.setItem(STORAGE_KEY, obsolete);
  expect(restoreDraft(storage, manifest).kind).toBe('incompatible');
  expect(storage.getItem(STORAGE_KEY)).toBe(obsolete);
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
