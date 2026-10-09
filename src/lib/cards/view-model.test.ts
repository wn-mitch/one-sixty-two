import { describe, expect, it } from 'vitest';
import type { BattingCounts, DefensiveEvidence, DefensivePosition, DefensiveSkillName, Profile } from '../game/types.ts';
import { createCardViewModel } from './view-model.ts';
import type { CardViewModel } from './view-model.ts';

const notApplicable: DefensiveEvidence = { status: 'notApplicable', exposure: 0 };

function defensivePosition(expectedRunsSaved162: number | null, overrides: Partial<DefensivePosition> = {}): DefensivePosition {
 const evidence: Record<DefensiveSkillName, DefensiveEvidence> = {
  hitPrevention: { status: 'exact', exposure: 4800 },
  doublePlay: notApplicable,
  outfieldThrowing: notApplicable,
  errorAvoidance: { status: 'exact', exposure: 600 },
  catcherThrowing: notApplicable
 };
 return {
  hitPrevention: 0.2,
  doublePlay: 0,
  outfieldThrowing: 0,
  errorAvoidance: 0.1,
  catcherThrowing: 0,
  evidence,
  expectedRunsSaved162,
  residualClamped: false,
  ...overrides
 };
}

const batting: BattingCounts = {
 AB: 10,
 H: 4,
 doubles: 1,
 triples: 1,
 HR: 1,
 BB: 2,
 HBP: 1,
 SO: 2,
 SH: 0,
 SF: 1,
 SB: 1,
 CS: 0,
 GIDP: 0,
 PA: 14
};

function profile(overrides: Partial<Profile> = {}): Profile {
 return {
  seasonId: 'example:2022:AL:AAA',
  playerId: 'example',
  displayName: 'Example Athlete',
  franchiseId: 'AAA',
  teamId: 'AAA',
  year: 2022,
  league: 'AL',
  historicalTeam: 'Example Club',
  teamGames: 162,
  bats: 'L',
  throws: 'R',
  eligibleSlots: ['LF', 'CF', 'DH'],
  primaryHitterSlot: 'CF',
  appearances: { LF: 40, CF: 80 },
  batting,
  fielding: {},
  defense: {
   positions: {
    LF: defensivePosition(4.6),
    CF: defensivePosition(-0.2)
   }
  },
  speed: 0.5,
  stealAttempt: 0.05,
  stealSuccess: 0.7,
  doublePlay: 0.1,
  estimatedFields: [],
  ...overrides
 };
}

function ops(model: CardViewModel): string | undefined {
 return model.b.fams.find(family => family.title.startsWith('Batting'))?.key.find(stat => stat.l === 'OPS')?.v;
}

describe('card front defensive estimate', () => {
 it('uses the assigned position before the explicit primary hitter position', () => {
  const source = profile();
  const primary = createCardViewModel({ profile: source });
  expect(primary.pos).toBe('CF');
  expect(primary.st3).toMatchObject({ l: 'DEF est.', v: '0' });
  expect(primary.st3.v).not.toBe('-0');
  expect(primary.st3.name).toMatch(/1,458 reference innings at CF/);

  const assigned = createCardViewModel({ profile: source, slot: 'LF' });
  expect(assigned.pos).toBe('LF');
  expect(assigned.st3).toMatchObject({ l: 'DEF est.', v: '+5' });
  const negative = createCardViewModel({
   profile: profile({ defense: { positions: { LF: defensivePosition(-2.5), CF: defensivePosition(1) } } }),
   slot: 'LF'
  });
  expect(negative.st3).toMatchObject({ l: 'DEF est.', v: '-3' });
 });

 it('keeps home runs at assigned or primary DH and distinguishes unavailable DEF from zero', () => {
  const source = profile({ primaryHitterSlot: 'DH' });
  expect(createCardViewModel({ profile: source }).st3).toMatchObject({ l: 'HR', v: '1' });
  expect(createCardViewModel({ profile: source, slot: 'DH' }).st3).toMatchObject({ l: 'HR', v: '1' });

  const missing = createCardViewModel({
   profile: profile({ defense: { positions: { CF: defensivePosition(null) } } }),
   slot: 'CF'
  });
  expect(missing.st3).toMatchObject({ l: 'DEF est.', v: '—' });
  expect(missing.st3.name).toMatch(/unavailable at CF.*aggregate fielding evidence is missing/);
  expect(() => createCardViewModel({
   profile: profile({ defense: { positions: {} } }),
   slot: 'CF'
  })).toThrow(/Missing defensive record.*at CF/);

  const noPrimary = createCardViewModel({ profile: profile({ primaryHitterSlot: null }), slot: null });
  expect(noPrimary.st3).toMatchObject({ l: 'DEF est.', v: '—' });
  expect(noPrimary.st3.name).toMatch(/no primary fielding position/);
 });

 it('leaves pitcher fronts and historical-WAR finish selection unchanged', () => {
  const twoWay = profile({
   eligibleSlots: ['DH', 'SP1'],
   primaryHitterSlot: 'DH',
   pitching: { G: 10, GS: 10, IPouts: 90, H: 20, HR: 2, BB: 5, HBP: 1, SO: 40, BFP: 110, ER: 10, SV: 0 }
  });
  const hitter = createCardViewModel({ profile: twoWay, slot: 'DH', ranking: { battingWAR162: 2.1, pitchingWAR162: 6.2 } });
  const pitcher = createCardViewModel({ profile: twoWay, slot: 'SP1', ranking: { battingWAR162: 2.1, pitchingWAR162: 6.2 } });
  expect(hitter.st3).toMatchObject({ l: 'HR', v: '1' });
  expect(pitcher.st1).toMatchObject({ l: 'PIT WAR/162', v: '6.20' });
  expect(pitcher.st2).toMatchObject({ l: 'ERA', v: '3.00' });
  expect(pitcher.st3).toMatchObject({ l: 'SO', v: '40' });
  expect(hitter.fin.tier).toBe('gem');
  expect(pitcher.fin.tier).toBe('gem');
 });
});

describe('shared historical OPS fallback', () => {
 it('uses HBP and SF in OBP and extra-base weighting in SLG through the real factory', () => {
  const model = createCardViewModel({ profile: profile({ primaryHitterSlot: 'DH' }), slot: 'DH' });
  expect(model.st2).toMatchObject({ l: 'OPS', v: '1.500' });
  expect(ops(model)).toBe('1.500');
 });

 it('does not present missing or compiler-estimated OPS inputs as measured values', () => {
  const estimated = createCardViewModel({ profile: profile({ estimatedFields: ['batting.SF.estimated'] }) });
  expect(estimated.st2).toMatchObject({ l: 'OPS', v: '—' });
  expect(ops(estimated)).toBe('—');

  const incomplete = createCardViewModel({
   profile: profile({ batting: { ...batting, HBP: undefined as unknown as number } })
  });
  expect(incomplete.st2).toMatchObject({ l: 'OPS', v: '—' });
  expect(ops(incomplete)).toBe('—');
 });

 it('handles a zero denominator and follows the assigned role for two-way seasons', () => {
  const zero = createCardViewModel({
   profile: profile({ batting: { ...batting, AB: 0, H: 0, doubles: 0, triples: 0, HR: 0, BB: 0, HBP: 0, SF: 0, PA: 0 } })
  });
  expect(zero.st2).toMatchObject({ l: 'OPS', v: '—' });

  const twoWay = profile({
   eligibleSlots: ['DH', 'SP1'],
   primaryHitterSlot: 'DH',
   pitching: { G: 10, GS: 10, IPouts: 90, H: 20, HR: 2, BB: 5, HBP: 1, SO: 40, BFP: 110, ER: 10, SV: 0 }
  });
  expect(createCardViewModel({ profile: twoWay, slot: 'DH' }).st2).toMatchObject({ l: 'OPS', v: '1.500' });
  expect(createCardViewModel({ profile: twoWay, slot: 'SP1' }).st2).toMatchObject({ l: 'ERA', v: '3.00' });
 });
});
