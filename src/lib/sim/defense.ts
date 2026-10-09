import {
 POSITIONS,
 type DefensiveEnvironment,
 type DefensivePosition,
 type DefensiveSkills,
 type Position,
 type Rates
} from '../game/types.ts';
import { forcedBaseTransition, homeRunRuns } from './advancement.ts';
import {
 contactKernelDoublePlayValue,
 contactKernelErrorValue,
 contactKernelHitValue,
 contactKernelOutValue,
 createContactExpectationKernel,
 type ContactExpectationKernel
} from './contact.ts';
import {
 FIELD_WEIGHTS,
 OUTFIELD_WEIGHTS,
 doublePlayProbability,
 fieldingErrorProbability,
 hitConversionProbability,
 stealSuccessProbability,
 teamDoublePlaySkill
} from './defense-rules.ts';
import { neutralRunExpectancy, neutralStateVisits } from './win-expectancy.ts';


const INFINITY_TARGET = 4;
const ZERO_SKILLS: DefensiveSkills = {
 hitPrevention: 0,
 doublePlay: 0,
 outfieldThrowing: 0,
 errorAvoidance: 0,
 catcherThrowing: 0
};

export interface DefensiveReference {
 readonly environment: DefensiveEnvironment;
 readonly rates: Rates;
 readonly runExpectancy: Float64Array;
 readonly stateVisits: Float64Array;
 readonly contactKernel: ContactExpectationKernel;
 readonly neutralCycleCosts: Float64Array;
 readonly positionCaches: Map<string, number>[];
}

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

function targetIndex(runsNeeded: number): number {
 if (!Number.isFinite(runsNeeded) || runsNeeded > 4) return INFINITY_TARGET;
 return Math.max(0, Math.ceil(runsNeeded) - 1);
}

function expectancy(reference: DefensiveReference, outs: number, bases: number): number {
 return outs >= 3 ? 0 : reference.runExpectancy[outs * 8 + bases];
}

function averagedHitValue(reference: DefensiveReference, target: number, state: number, event: number, targetPosition: number, skills: DefensiveSkills): number {
 let value = 0;
 for (let outfielder = 5; outfielder < 8; outfielder++) {
  const arm = outfielder === targetPosition ? skills.outfieldThrowing : 0;
  value += OUTFIELD_WEIGHTS[outfielder - 5] * contactKernelHitValue(reference.contactKernel, target, state, event, arm);
 }
 return value;
}

function ordinaryOutValue(reference: DefensiveReference, target: number, state: number, fielder: number, targetPosition: number, skills: DefensiveSkills): number {
 const outs = Math.floor(state / 8);
 const bases = state & 7;
 const errorSkill = fielder === targetPosition ? skills.errorAvoidance : 0;
 const errorProbability = fieldingErrorProbability(reference.environment.leagueErrorRates[POSITIONS[fielder]], errorSkill);
 const errorValue = contactKernelErrorValue(reference.contactKernel, target, state);
 const arm = fielder === targetPosition ? skills.outfieldThrowing : 0;
 const caughtValue = contactKernelOutValue(reference.contactKernel, target, state, fielder >= 5, arm);
 let doublePlay = 0;
 if (fielder >= 1 && fielder <= 4 && (bases & 1) !== 0 && outs < 2) {
  doublePlay = doublePlayProbability(reference.environment.leagueDoublePlay, teamDoublePlaySkill(fielder, targetPosition, skills));
 }
 const cleanValue = doublePlay * contactKernelDoublePlayValue(reference.contactKernel, target, state) +
  (1 - doublePlay) * caughtValue;
 return errorProbability * errorValue + (1 - errorProbability) * cleanValue;
}

function plateAppearanceCost(reference: DefensiveReference, state: number, targetPosition: number, skills: DefensiveSkills, runsNeeded = Infinity): number {
 const outs = Math.floor(state / 8);
 const bases = state & 7;
 const target = targetIndex(runsNeeded);
 let expected = 0;
 for (let event = 0; event < 8; event++) {
  const probability = reference.rates[event];
  if (probability === 0) continue;
  if (event === 0 || event === 1) {
   const transition = forcedBaseTransition(bases);
   const runs = transition >> 3;
   const value = runs >= runsNeeded ? runsNeeded : runs + expectancy(reference, outs, transition & 7);
   expected += probability * value;
  } else if (event === 2) {
   expected += probability * expectancy(reference, outs + 1, bases);
  } else if (event === 6) {
   const runs = homeRunRuns(bases);
   const continuation = runs >= runsNeeded ? 0 : expectancy(reference, outs, 0);
   expected += probability * (runs + continuation);
  } else if (event >= 3 && event <= 5) {
   const hitValue = averagedHitValue(reference, target, state, event, targetPosition, skills);
   const caughtValue = contactKernelOutValue(reference.contactKernel, target, state, false, 0);
   let eventValue = hitValue;
   if (targetPosition >= 0) {
    const conversion = hitConversionProbability(reference.rates, event, skills.hitPrevention);
    eventValue += FIELD_WEIGHTS[targetPosition] * conversion * (caughtValue - hitValue);
   }
   expected += probability * eventValue;
  } else {
   const singleValue = averagedHitValue(reference, target, state, 3, targetPosition, skills);
   let eventValue = 0;
   for (let fielder = 0; fielder < POSITIONS.length; fielder++) {
    const ordinary = ordinaryOutValue(reference, target, state, fielder, targetPosition, skills);
    if (fielder === targetPosition) {
     const conversion = hitConversionProbability(reference.rates, event, skills.hitPrevention);
     eventValue += FIELD_WEIGHTS[fielder] * (conversion * singleValue + (1 - conversion) * ordinary);
    } else {
     eventValue += FIELD_WEIGHTS[fielder] * ordinary;
    }
   }
   expected += probability * eventValue;
  }
 }
 return expected;
}

function cycleCost(reference: DefensiveReference, state: number, targetPosition: number, skills: DefensiveSkills): number {
 const outs = Math.floor(state / 8);
 const bases = state & 7;
 if ((bases & 1) === 0 || (bases & 2) !== 0) return plateAppearanceCost(reference, state, targetPosition, skills);
 const attempt = reference.environment.leagueStealAttempt;
 const catcherSkill = targetPosition === 0 ? skills.catcherThrowing : 0;
 const success = stealSuccessProbability(reference.environment.leagueStealSuccess, catcherSkill);
 const successState = outs * 8 + ((bases & ~1) | 2);
 const caughtOuts = outs + 1;
 const caughtCost = caughtOuts >= 3 ? 0 : plateAppearanceCost(reference, caughtOuts * 8 + (bases & ~1), targetPosition, skills);
 return (1 - attempt) * plateAppearanceCost(reference, state, targetPosition, skills) +
  attempt * (success * plateAppearanceCost(reference, successState, targetPosition, skills) + (1 - success) * caughtCost);
}

/** Neutral PA value, including current defensive event rules and walkoff stopping. */
export function expectedNeutralPlateAppearanceValue(reference: DefensiveReference, state: number, runsNeeded = Infinity): number {
 if (!Number.isInteger(state) || state < 0 || state >= 24 ||
  (!Number.isFinite(runsNeeded) && runsNeeded !== Infinity) || runsNeeded <= 0) {
  throw new Error('Invalid neutral plate appearance state');
 }
 const normalizedTarget = runsNeeded > 4 ? Infinity : runsNeeded;
 return plateAppearanceCost(reference, state, -1, ZERO_SKILLS, normalizedTarget);
}

export function createDefensiveReference(environment: DefensiveEnvironment): DefensiveReference {
 const rates = environment.leagueRates;
 const values = [environment.leagueStealAttempt, environment.leagueStealSuccess, environment.leagueDoublePlay];
 const invalidErrorRate = POSITIONS.some(position => {
  const value = environment.leagueErrorRates[position];
  return !Number.isFinite(value) || value < 0 || value > 0.12;
 });
 if (values.some(value => !Number.isFinite(value) || value < 0 || value > 1) || invalidErrorRate) throw new Error('Invalid defensive environment');
 const runExpectancy = neutralRunExpectancy(rates);
 const reference: DefensiveReference = {
  environment,
  rates,
  runExpectancy,
  stateVisits: neutralStateVisits(rates),
  contactKernel: createContactExpectationKernel(rates, runExpectancy),
  neutralCycleCosts: new Float64Array(24),
  positionCaches: Array.from({ length: POSITIONS.length }, () => new Map<string, number>())
 };
 for (let state = 0; state < 24; state++) reference.neutralCycleCosts[state] = cycleCost(reference, state, -1, ZERO_SKILLS);
 return reference;
}

function invalidDefensiveSkills(skills: DefensiveSkills): boolean {
 const { hitPrevention, doublePlay, outfieldThrowing, errorAvoidance, catcherThrowing } = skills;
 return !Number.isFinite(hitPrevention) || hitPrevention < -1 || hitPrevention > 1 ||
  !Number.isFinite(doublePlay) || doublePlay < -1 || doublePlay > 1 ||
  !Number.isFinite(outfieldThrowing) || outfieldThrowing < -1 || outfieldThrowing > 1 ||
  !Number.isFinite(errorAvoidance) || errorAvoidance < -1 || errorAvoidance > 1 ||
  !Number.isFinite(catcherThrowing) || catcherThrowing < -1 || catcherThrowing > 1;
}

export function expectedDefensiveRuns(reference: DefensiveReference, position: Position, skills: DefensiveSkills): number {
 const target = POSITIONS.indexOf(position);
 if (target < 0 || invalidDefensiveSkills(skills)) throw new Error('Invalid defensive skill input');
 const key = `${skills.hitPrevention}|${skills.doublePlay}|${skills.outfieldThrowing}|${skills.errorAvoidance}|${skills.catcherThrowing}`;
 const cached = reference.positionCaches[target].get(key);
 if (cached !== undefined) return cached;
 let runsSaved = 0;
 for (let state = 0; state < reference.stateVisits.length; state++) {
  const visits = reference.stateVisits[state];
  if (visits === 0) continue;
  runsSaved += 1458 * visits * (reference.neutralCycleCosts[state] - cycleCost(reference, state, target, skills));
 }
 if (!Number.isFinite(runsSaved)) throw new Error('Defensive reference produced a non-finite value');
 reference.positionCaches[target].set(key, runsSaved);
 return runsSaved;
}
