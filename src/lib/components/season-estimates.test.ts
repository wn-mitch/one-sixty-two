import { describe, expect, it } from 'vitest';
import type { DefensiveEvidence, DefensivePosition, DefensiveSkillName, Position, Profile } from '../game/types.ts';
import { seasonEstimates } from './season-estimates.ts';

const notApplicable: DefensiveEvidence = { status: 'notApplicable', exposure: 0 };
const exact = (exposure: number): DefensiveEvidence => ({ status: 'exact', exposure });

function defensivePosition(overrides: Partial<DefensivePosition> = {}): DefensivePosition {
 const evidence: Record<DefensiveSkillName, DefensiveEvidence> = {
  hitPrevention: notApplicable,
  doublePlay: notApplicable,
  outfieldThrowing: notApplicable,
  errorAvoidance: notApplicable,
  catcherThrowing: notApplicable
 };
 return {
  hitPrevention: 0,
  doublePlay: 0,
  outfieldThrowing: 0,
  errorAvoidance: 0,
  catcherThrowing: 0,
  evidence,
  expectedRunsSaved162: null,
  residualClamped: false,
  ...overrides
 };
}

function estimateProfile(
 estimatedFields: string[],
 positions: Partial<Record<Position, DefensivePosition>> = {}
): Pick<Profile, 'estimatedFields' | 'defense'> {
 return { estimatedFields, defense: { positions } };
}

describe('role-relevant season estimates', () => {
 it('narrows compiler-wide estimates and defensive positions to the represented role', () => {
  const source = estimateProfile(
   ['bats.neutral', 'throws.neutral', 'BPF.neutral', 'PPF.neutral'],
   {
    C: defensivePosition({ expectedRunsSaved162: 3 }),
    '1B': defensivePosition({ expectedRunsSaved162: -2 })
   }
  );

  expect(seasonEstimates(source, ['C', '1B', 'DH', 'CL'], 'C')).toEqual(seasonEstimates(source, ['C']));
  expect(seasonEstimates(source, ['C', '1B', 'DH', 'CL'], 'DH')).toEqual(seasonEstimates(source, ['DH']));
  expect(seasonEstimates(source, ['C', '1B', 'DH', 'CL'], 'CL')).toEqual(seasonEstimates(source, ['CL']));
  expect(seasonEstimates(source, ['DH'], 'C')).toEqual(seasonEstimates(source, ['DH']));
 });

 it('uses the shared DEF rounding rule for negative halves and negative zero', () => {
  const notes = seasonEstimates(estimateProfile([], {
   LF: defensivePosition({ expectedRunsSaved162: -2.5 }),
   CF: defensivePosition({ expectedRunsSaved162: -0.2 })
  }), ['LF', 'CF']);
  const leftField = notes.find(note => note.startsWith('At left field, DEF est.'));
  const centerField = notes.find(note => note.startsWith('At center field, DEF est.'));

  expect(leftField).toContain('DEF est. is -3 runs');
  expect(centerField).toContain('DEF est. is 0 runs');
  expect(centerField).not.toContain('-0 runs');
 });

 it('distinguishes unavailable aggregate evidence from measured zero and an absent record', () => {
  const unavailable = defensivePosition({
   evidence: {
    hitPrevention: { status: 'neutralMissingEvidence', exposure: 0, reason: 'joined fielding runs unavailable' },
    errorAvoidance: exact(410),
    doublePlay: notApplicable,
    outfieldThrowing: notApplicable,
    catcherThrowing: notApplicable
   }
  });
  const notes = seasonEstimates(estimateProfile([], {
   C: defensivePosition({ expectedRunsSaved162: 0 }),
   '1B': unavailable
  }), ['C', '1B']);

  expect(notes.find(note => note.startsWith('At catcher, DEF est.'))).toContain('DEF est. is 0 runs');
  expect(notes.find(note => note.startsWith('At first base, aggregate DEF'))).toContain('aggregate DEF is unavailable');
  expect(seasonEstimates(estimateProfile([]), ['SS']).some(note => note.includes('required pre-season defensive record is unavailable'))).toBe(true);
 });

 it('reports the canonical normalized skill values and their source exposures', () => {
  const defense = defensivePosition({
   hitPrevention: 0.42,
   errorAvoidance: -0.08,
   outfieldThrowing: 0.25,
   expectedRunsSaved162: 7.6,
   evidence: {
    hitPrevention: exact(5100),
    errorAvoidance: exact(720),
    doublePlay: notApplicable,
    outfieldThrowing: { status: 'genericOutfield', exposure: 4800, reason: 'split-position assists unavailable' },
    catcherThrowing: notApplicable
   }
  });
  const notes = seasonEstimates(estimateProfile([], { LF: defense }), ['LF']);
  const skills = notes.find(note => note.startsWith('At left field, normalized defensive skills'));

  expect(skills).toContain('estimated hit prevention +0.42');
  expect(skills).toContain('exposure 5100 fielding outs');
  expect(skills).toContain('error avoidance -0.08');
  expect(skills).toContain('exposure 720 handled chances');
  expect(skills).toContain('outfield throwing +0.25');
  expect(skills).toContain('exposure 4800 fielding outs');
 });
});
