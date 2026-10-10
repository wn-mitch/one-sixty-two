import type { DefensiveEnvironment, DefensivePosition, DefensiveSkills, Position } from '../game/types.ts';
import {
 expectedDefensiveRuns as physicalDefensiveRuns,
 expectedNeutralPlateAppearanceValue,
 getPhysicalReference,
 type PhysicalReference
} from './physical-expectation.ts';

const ZERO_SKILLS: DefensiveSkills = {
 hitPrevention: 0,
 doublePlay: 0,
 outfieldThrowing: 0,
 errorAvoidance: 0,
 catcherThrowing: 0
};

/** The neutral physical reference shared by defense valuation, run value, and win expectancy. */
export type DefensiveReference = PhysicalReference;

export function neutralDefensivePosition(position?: Position): DefensivePosition {
 const unavailable = () => ({ status: 'notApplicable' as const, exposure: 0 });
 const missing = () => ({ status: 'neutralMissingEvidence' as const, exposure: 0, reason: 'No applicable historical evidence' });
 const applies = (skill: keyof DefensiveSkills): boolean => {
  if (!position) return false;
  if (skill === 'hitPrevention' || skill === 'errorAvoidance') return true;
  if (skill === 'doublePlay') return position === '1B' || position === '2B' || position === '3B' || position === 'SS';
  if (skill === 'outfieldThrowing') return position === 'LF' || position === 'CF' || position === 'RF';
  return position === 'C';
 };
 return {
  ...ZERO_SKILLS,
  evidence: {
   hitPrevention: applies('hitPrevention') ? missing() : unavailable(),
   doublePlay: applies('doublePlay') ? missing() : unavailable(),
   outfieldThrowing: applies('outfieldThrowing') ? missing() : unavailable(),
   errorAvoidance: applies('errorAvoidance') ? missing() : unavailable(),
   catcherThrowing: applies('catcherThrowing') ? missing() : unavailable()
  },
  expectedRunsSaved162: null,
  residualClamped: false
 };
}

export { expectedNeutralPlateAppearanceValue };

export function createDefensiveReference(environment: DefensiveEnvironment): DefensiveReference {
 const values = [environment.leagueStealAttempt, environment.leagueStealSuccess, environment.leagueDoublePlay];
 const invalidErrorRate = Object.values(environment.leagueErrorRates ?? {}).some(value => !Number.isFinite(value) || value < 0 || value > 0.12);
 if (values.some(value => !Number.isFinite(value) || value < 0 || value > 1) || invalidErrorRate || !environment.contactModel) throw new Error('Invalid defensive environment');
 return getPhysicalReference(environment);
}

/** Season runs saved by a defender's skills relative to a neutral defender at the same position. */
export function expectedDefensiveRuns(reference: DefensiveReference, position: Position, skills: DefensiveSkills): number {
 return physicalDefensiveRuns(reference, position, skills);
}
