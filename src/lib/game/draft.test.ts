import { describe, expect, it } from 'vitest';
import {
 availableCandidates,
 commitPick,
 createDraft,
 legalSlots,
 replayInput,
 rollDraft,
 validateDraft,
 validateReplay
} from './draft.ts';
import { decodeReplay } from './share.ts';
import { persistDraft, restoreDraft, STORAGE_KEY } from './persistence.ts';
import { MODEL_VERSION, SLOTS, type Candidate, type Draft, type Manifest, type Replay, type Slot } from './types.ts';
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
 it('finishes every seeded draft with thirteen distinct athletes and franchises', () => {
  for (let seed = 0; seed < 32; seed++) {
   const initial = createDraft(manifest, seed);
   expect(initial.schemaVersion).toBe(2);
   expect(legalSlots(initial, candidates[0], manifest)).toEqual(['C']);
   const draft = finish(seed);
   const selected = draft.picks.map(pick => manifest.candidates.find(item => item.seasonId === pick.seasonId)!);
   expect(new Set(selected.map(candidate => candidate.playerId)).size).toBe(SLOTS.length);
   expect(new Set(selected.map(candidate => candidate.franchiseId)).size).toBe(SLOTS.length);
   expect(draft.picks.map(pick => pick.slot).sort()).toEqual([...SLOTS].sort());
   expect(draft.battingOrder).toHaveLength(9);
   expect(draft.starterOrder).toHaveLength(3);
   expect(validateDraft(draft, manifest, true)).toEqual(draft);
  }
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
  const candidate = availableCandidates(draft, manifest)[0];
  const next = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
  expect(() => commitPick(next, manifest, candidate.seasonId, candidate.eligibleSlots[0])).toThrow('Roll before');
  expect(availableCandidates(next, manifest, null).some(item => item.playerId === candidate.playerId)).toBe(false);
  expect(availableCandidates(next, manifest, null).some(item => item.franchiseId === candidate.franchiseId)).toBe(false);
 });

 it('preserves a closing-pitcher-only final roll', () => {
  let finalDraft: Draft | undefined;
  for (let seed = 0; seed < 256 && !finalDraft; seed++) {
   let draft = createDraft(manifest, seed);
   while (draft.picks.length < 12) {
    draft = rollDraft(draft, manifest);
    const candidate = availableCandidates(draft, manifest)[0];
    draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
   }
   if (draft.picks.every(pick => pick.slot !== 'CL')) finalDraft = draft;
  }
  expect(finalDraft).toBeDefined();
  const rolled = rollDraft(finalDraft!, manifest);
  const remaining = availableCandidates(rolled, manifest);
  expect(remaining).toHaveLength(1);
  expect(legalSlots(rolled, remaining[0], manifest)).toEqual(['CL']);
  expect(validateDraft(commitPick(rolled, manifest, remaining[0].seasonId, 'CL'), manifest, true).picks).toHaveLength(13);
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
   seasonId: candidate.seasonId.replace(/:(?:19|20)\d{2}:/, ':1952:'),
   decade: 1950
  }));
  const old = makeManifest(oldCandidates, 'old');
  const rolled = rollDraft(createDraft(old, 0), old);
  const candidate = availableCandidates(rolled, old)[0];
  expect(() => commitPick(rolled, old, candidate.seasonId, legalSlots(rolled, candidate, old)[0])).toThrow('supported era');
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

 it('verifies a completed schema-one replay under its immutable player-only rules', () => {
  const legacyCandidates = SLOTS.map((slot, index) => ({
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
   modelVersion: MODEL_VERSION,
   seed: 162,
   picks: legacyCandidates.map((candidate, index) => ({
    seasonId: candidate.seasonId,
    slot: SLOTS[index],
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
