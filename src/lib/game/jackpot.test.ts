import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addPack, availableCandidates, choosePack, commitPick, createDraft, legalSlots, openSlots, replayInput, rollDraft, selectHomeStadium, validateDraft, validateReplay } from './draft.ts';
import * as random from './random.ts';
import { draftRules } from './rules.ts';
import { CURRENT_REPLAY_SCHEMA_VERSION, RULES_VERSION, SLOTS, compareId, isJackpot, type Candidate, type Draft, type Manifest, type Slot } from './types.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';

function candidate(playerId: string, slots: Slot[], franchiseId = playerId, year = 1985): Candidate {
 return { seasonId: `${playerId}:${year}:AL:${franchiseId}`, playerId, franchiseId, decade: 1980, eligibleSlots: slots };
}

/** Candidate order is deliberately independent of the ranked jackpot list. */
function manifest(ranked: Candidate[]): Manifest {
 const franchiseIds = [...new Set(ranked.map(value => value.franchiseId))];
 return {
  schemaVersion: 1, dataVersion: 'jackpot-fixture', sourceCommit: 'synthetic',
  candidates: [...ranked].reverse(), jackpot: ranked.map(value => value.seasonId),
  franchises: franchiseIds.map(id => ({ id, name: `Club ${id}`, decades: [1980] })),
  chunks: {}, stadiums: syntheticStadiumSummaries(franchiseIds), simulationUrl: '', showcaseUrl: '', attributionUrl: '', archiveUrl: '',
  approximations: [], coverage: [],
  diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
  attribution: { title: 'Synthetic source', credit: 'Fixture', sourceUrl: 'https://example.invalid', license: 'Fixture', licenseUrl: 'https://example.invalid/license', sourceCommit: 'synthetic', changes: 'Fixture', fullNotice: 'Fixture' }
 };
}

function start(source: Manifest, seed = 5): Draft {
 return selectHomeStadium(createDraft(source, seed), source, source.stadiums[0].ref.id);
}

function fillers(remaining: Slot[]): Candidate[] {
 return SLOTS.filter(slot => !remaining.includes(slot)).map((slot, index) => candidate(`filler${index}`, [slot]));
}

/** Reach the late roll through the public draft actions, retaining every earlier jackpot's players. */
function lateRoll(source: Manifest, remaining: Slot[]): { draft: Draft; shown: Set<string> } {
 let draft = start(source);
 const shown = new Set<string>();
 while (draft.picks.length < SLOTS.length - remaining.length) {
  draft = rollDraft(draft, source);
  for (const value of availableCandidates(draft, source)) {
   if (isJackpot(draft.currentRoll!)) shown.add(value.playerId);
  }
  const pick = availableCandidates(draft, source).find(value => legalSlots(draft, value, source).some(slot => !remaining.includes(slot)));
  if (!pick) throw new Error('Fixture did not offer an unreserved slot');
  const slot = legalSlots(draft, pick, source).find(value => !remaining.includes(value))!;
  draft = commitPick(draft, source, pick.seasonId, slot);
 }
 expect(openSlots(draft)).toEqual(remaining);
 return { draft: rollDraft(draft, source), shown };
}

function choices(draft: Draft, source: Manifest): Candidate[] {
 expect(isJackpot(draft.currentRoll!)).toBe(true);
 const dealt = availableCandidates(draft, source);
 expect(new Set(dealt.map(value => value.playerId)).size).toBe(dealt.length);
 for (const value of dealt) expect(legalSlots(draft, value, source).length).toBeGreaterThan(0);
 return dealt;
}

describe('open-slot jackpot shortlists', () => {
 // Force jackpots and the first shortlist entry without bypassing the actual draft/action APIs.
 beforeEach(() => vi.spyOn(random, 'randomStream').mockImplementation(() => () => 0));
 afterEach(() => vi.restoreAllMocks());

 it('offers six distinct first basemen despite duplicate seasons and high-ranked used franchises or players', () => {
  const base = fillers(['1B']);
  const targets = Array.from({ length: 6 }, (_, index) => candidate(`target${index}`, ['1B'], `target${index}`, 1986));
  const excluded = [candidate('excluded', ['1B'], base[0].franchiseId), candidate(base[1].playerId, ['1B'], 'other-club')];
  const source = manifest([...excluded, ...targets, ...targets.map(value => ({ ...value, seasonId: value.seasonId.replace(':1986:', ':1985:') })), ...base]);
  const { draft } = lateRoll(source, ['1B']);
  const dealt = choices(draft, source);
  expect(dealt).toHaveLength(6);
  expect(dealt.map(value => value.seasonId).sort(compareId)).toEqual(targets.map(value => value.seasonId).sort(compareId));
  expect(dealt.every(value => value.eligibleSlots.includes('1B'))).toBe(true);
  expect(dealt.every(value => !draft.picks.some(pick => pick.franchiseId === value.franchiseId))).toBe(true);
 });

 it('balances six choices three apiece between first and second base', () => {
  const targets = (['1B', '2B'] as const).flatMap(slot => Array.from({ length: 8 }, (_, index) => candidate(`${slot}-${index}`, [slot])));
  const source = manifest([...targets, ...fillers(['1B', '2B'])]);
  const { draft } = lateRoll(source, ['1B', '2B']);
  const dealt = choices(draft, source);
  expect(dealt).toHaveLength(6);
  expect(dealt.filter(value => value.eligibleSlots.includes('1B'))).toHaveLength(3);
  expect(dealt.filter(value => value.eligibleSlots.includes('2B'))).toHaveLength(3);
 });

 it('prefers unseen players but returns previously shown undrafted players when the slot runs out', () => {
  const targets = Array.from({ length: 6 }, (_, index) => candidate(`target${index}`, ['1B']));
  const source = manifest([...targets, ...fillers(['1B'])]);
  const { draft, shown } = lateRoll(source, ['1B']);
  expect(targets.every(value => shown.has(value.playerId))).toBe(true);
  expect(choices(draft, source)).toHaveLength(6);

  const first = rollDraft(start(source), source);
  const firstPlayers = new Set(choices(first, source).map(value => value.playerId));
  const added = addPack(first, source);
  const next = choosePack(added, 1);
  const nextTargets = choices(next, source).filter(value => value.eligibleSlots.includes('1B'));
  expect(nextTargets).toHaveLength(1);
  expect(nextTargets.every(value => !firstPlayers.has(value.playerId))).toBe(true);
 });

 it('deduplicates multi-position players across slot pools and uses their best legal season for the dealt slot', () => {
  const shared = Array.from({ length: 6 }, (_, index) => candidate(`shared${index}`, ['1B', '2B'], `shared${index}`, 1986));
  const source = manifest([...shared, ...shared.map(value => ({ ...value, seasonId: value.seasonId.replace(':1986:', ':1985:') })), ...fillers(['1B', '2B'])]);
  const { draft } = lateRoll(source, ['1B', '2B']);
  expect(choices(draft, source).map(value => value.seasonId).sort(compareId)).toEqual(shared.map(value => value.seasonId).sort(compareId));
 });

 it('redistributes exhausted slots instead of shrinking an otherwise supplied pack', () => {
  const targets = [candidate('scarce', ['1B']), ...Array.from({ length: 7 }, (_, index) => candidate(`deep${index}`, ['2B']))];
  const source = manifest([...targets, ...fillers(['1B', '2B'])]);
  const { draft } = lateRoll(source, ['1B', '2B']);
  const dealt = choices(draft, source);
  expect(dealt).toHaveLength(6);
  expect(dealt.filter(value => value.eligibleSlots.includes('1B'))).toHaveLength(1);
  expect(dealt.filter(value => value.eligibleSlots.includes('2B'))).toHaveLength(5);
 });

 it('keeps complete-roster legality rather than dealing a high-ranked season that consumes a scarce franchise', () => {
  const targets = [candidate('blocked', ['1B'], 'scarce-club'), candidate('scarce', ['2B'], 'scarce-club'), ...Array.from({ length: 6 }, (_, index) => candidate(`safe${index}`, ['1B']))];
  const source = manifest([...targets, ...fillers(['1B', '2B'])]);
  const { draft } = lateRoll(source, ['1B', '2B']);
  const dealt = choices(draft, source);
  expect(dealt).toHaveLength(6);
  expect(dealt.some(value => value.playerId === 'blocked')).toBe(false);
 });

 it('returns fewer only for a genuinely undersupplied pool, and respects an empty jackpot fixture', () => {
  const source = manifest([candidate('only', ['1B']), ...fillers(['1B'])]);
  expect(choices(lateRoll(source, ['1B']).draft, source)).toHaveLength(1);
  const empty = { ...source, jackpot: [] };
  expect(isJackpot(rollDraft(start(empty), empty).currentRoll!)).toBe(false);
 });

 it('takes only the top eight remaining distinct unseen players, not the top eight seasons', () => {
  const targets = Array.from({ length: 12 }, (_, index) => candidate(`target${index}`, ['1B'], `target${index}`, 1986));
  const source = manifest([...targets.flatMap(value => [value, { ...value, seasonId: value.seasonId.replace(':1986:', ':1985:') }]), ...fillers(['1B'])]);
  // Keep the slot order fixed, then draw index 1 of each eight-player shortlist.
  vi.mocked(random.randomStream).mockImplementation((_seed, stream) => {
   let draws = 0;
   return () => stream === 'jackpot' || ++draws <= SLOTS.length ? 0 : .19;
  });
  const first = rollDraft(start(source), source);
  const dealt = choices(first, source).filter(value => value.eligibleSlots.includes('1B'));
  expect(dealt).toEqual([targets[1]]);
 });
});

describe('seeded jackpot action replay', () => {
 const pool = SLOTS.flatMap((slot, index) => Array.from({ length: 3 }, (_, depth) => candidate(`slot${index}-${depth}`, [slot])));
 const source = manifest(pool);

 function finish(seed: number): { draft: Draft; dealt: string[][] } {
  let draft = start(source, seed);
  const dealt: string[][] = [];
  while (draft.picks.length < SLOTS.length) {
   draft = rollDraft(draft, source);
   if (isJackpot(draft.currentRoll!)) {
    dealt.push(draft.currentRoll!.jackpot);
    choices(draft, source);
   }
   const value = availableCandidates(draft, source)[0];
   draft = commitPick(draft, source, value.seasonId, legalSlots(draft, value, source)[0]);
  }
  return { draft, dealt };
 }

 it('preserves guaranteed positions, seeded deals, exact picks and current-version replay', () => {
  const { draft, dealt } = finish(5);
  const policy = draftRules(CURRENT_REPLAY_SCHEMA_VERSION).jackpots;
  expect(policy).toEqual({ guaranteed: 2, chance: .2, size: 6, shortlist: 8 });
  expect(RULES_VERSION).toBe('classic-v9');
  expect(draft.rulesVersion).toBe(RULES_VERSION);
  expect(dealt.length).toBeGreaterThanOrEqual(policy.guaranteed);
  for (const pack of dealt) expect(pack.length).toBeLessThanOrEqual(policy.size);
  expect(finish(5)).toEqual({ draft, dealt });
  expect(validateReplay(replayInput(draft), source)).toEqual(draft);
  expect(draft.picks.filter(pick => pick.jackpot)).toHaveLength(dealt.length);
  const index = draft.picks.findIndex(pick => pick.jackpot);
  const { jackpot: _mark, ...unmarked } = draft.picks[index];
  expect(() => validateReplay({ ...replayInput(draft), picks: draft.picks.with(index, unmarked) }, source)).toThrow('snapshot');
  const plain = draft.picks.findIndex(pick => !pick.jackpot);
  expect(plain).toBeGreaterThanOrEqual(0);
  expect(() => validateReplay({ ...replayInput(draft), picks: draft.picks.with(plain, { ...draft.picks[plain], jackpot: true }) }, source)).toThrow('snapshot');
 });

 it('lets a chosen jackpot retain its place in an added-pack action replay', () => {
  // A short deterministic stream fixture makes the first roll a franchise and the added pack a jackpot.
  const spy = vi.spyOn(random, 'randomStream').mockImplementation((_seed, stream) => {
   if (stream === 'jackpot') return () => 0;
   let draws = 0;
   return () => ++draws <= 3 ? .99 : 0;
  });
  try {
   let draft = rollDraft(start(source), source);
   expect(isJackpot(draft.currentRoll!)).toBe(false);
   draft = addPack(draft, source);
   expect(isJackpot(draft.packs[1])).toBe(true);
   const chosen = choosePack(draft, 1);
   expect(chosen.currentRoll).toEqual(draft.packs[1]);
   expect(chosen.actions.at(-1)).toEqual({ type: 'choose-pack', pack: 1 });
   expect(validateDraft(chosen, source)).toEqual(chosen);
  } finally {
   spy.mockRestore();
  }
 });
});
