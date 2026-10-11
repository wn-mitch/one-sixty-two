import { buildContactBasis as wasmContactBasis, DataPrep } from './pkg/engine.js';
import type { DefensiveEnvironment, DefensiveSkills, Position, Rates } from '../game/types.ts';
import type { ContactBasis, ContactShape } from '../sim/contact-profile.ts';
import { neutralPark } from '../sim/park.ts';

/** Linear run value of one plate-appearance event, averaged over league base-out state visits. */
export interface EventRunWeights { walk: number; strikeout: number; classes: number[]; classOuts: number[] }

/** One batter/pitcher pairing; `unknownSide` fits at unknown side instead of the platoon side. */
export interface MatchupQuery {
 battingRates: Rates; bats: string; pitchingRates: Rates; throws: string; speed: number;
 unknownSide?: boolean;
 /** Prefixes any engine error, typically the season id being priced. */
 label?: string;
}

/** Platoon-adjusted eight-event rates, the contact fit's misses, and its neutral outcome classes. */
export interface MatchupFit { rates: Rates; error: number; tripleError: number; classes: number[] }

/** The engine's neutral league reference for data preparation and draft pricing. */
export interface ContactReference {
 eventRunWeights(): EventRunWeights;
 /** League state visits per inning, by base-out state. */
 stateVisits(): number[];
 /** Season runs saved at `position` relative to a neutral defender. */
 expectedDefensiveRuns(position: Position, skills: DefensiveSkills): number;
 fitMatchups(queries: readonly MatchupQuery[]): MatchupFit[];
}

function environmentJson(environment: DefensiveEnvironment): string {
 const { leagueRates, leagueErrorRates, leagueStealAttempt, leagueStealSuccess, leagueDoublePlay, contactModel } = environment;
 return JSON.stringify({ leagueRates, leagueErrorRates, leagueStealAttempt, leagueStealSuccess, leagueDoublePlay, contactModel });
}

/** Builds the reference once per environment; the wasm module must already be initialized. */
export function createContactReference(environment: DefensiveEnvironment): ContactReference {
 const prep = new DataPrep(environmentJson(environment), JSON.stringify(neutralPark()));
 return {
  eventRunWeights: () => JSON.parse(prep.eventRunWeights()) as EventRunWeights,
  stateVisits: () => [...prep.stateVisits()],
  expectedDefensiveRuns: (position, skills) =>
   prep.expectedDefensiveRuns(position, skills.hitPrevention, skills.doublePlay, skills.outfieldThrowing, skills.errorAvoidance, skills.catcherThrowing),
  fitMatchups: queries => JSON.parse(prep.fitMatchups(JSON.stringify(queries))) as MatchupFit[]
 };
}

/** Traces the full neutral lattice into the response basis stored with the contact model. */
export function buildContactBasis(shape: ContactShape): ContactBasis {
 return JSON.parse(wasmContactBasis(JSON.stringify(shape), JSON.stringify(neutralPark()))) as ContactBasis;
}
