import { POSITIONS, type Position } from '../game/types.ts';
import { createBox } from './game.ts';
import type { SeasonInput, TeamBox, TeamInput } from './types.ts';
import { closerBudget } from './workload.ts';

/** The drafted club: batting order hitters, SP1-SP3 in starter order, then closer and support bullpen. */
export function createDraftTeam(input: SeasonInput, id: string, name: string): TeamInput {
 const profiles = new Map(input.roster.map(pick => [pick.profile.seasonId, pick.profile]));
 const hitters = input.battingOrder.map(seasonId => profiles.get(seasonId)!);
 const defense = {} as Record<Position, number>;
 for (const position of POSITIONS) {
  const pick = input.roster.find(item => item.slot === position)!;
  defense[position] = hitters.indexOf(pick.profile);
 }
 const closer = input.roster.find(pick => pick.slot === 'CL')!.profile;
 const support = input.roster.find(pick => pick.slot === 'BP')!.profile;
 return {
  id, name, hitters, defense,
  pitchers: [...input.starterOrder.map(seasonId => profiles.get(seasonId)!), closer, support],
  starterIndex: 0, closerIndex: 3, bullpenIndex: 4, closerAvailable: true, closerOutsRemaining: closerBudget(closer)
 };
}

/** A zeroed totals box; a fresh game box otherwise counts one starter appearance. */
export function createTotalsBox(team: TeamInput): TeamBox {
 const totals = createBox(team);
 for (const pitcher of totals.pitching) { pitcher.starts = 0; pitcher.appearances = 0; }
 return totals;
}

const BATTING_STATS = [
 'PA', 'AB', 'H', 'doubles', 'triples', 'HR', 'BB', 'HBP', 'SO', 'R', 'RBI', 'SB', 'CS', 'SF',
 'battingRuns', 'stealRuns', 'defensiveRuns', 'fieldingOuts', 'caughtAdvancing'
] as const;
const PITCHING_STATS = ['outs', 'H', 'BB', 'HBP', 'SO', 'R', 'starts', 'appearances', 'BF', 'pitchingRunsAboveNeutral'] as const;
const DEFENSIVE_COMPONENTS = ['hitPrevention', 'errorAvoidance', 'doublePlay', 'outfieldThrowing', 'catcherThrowing'] as const;
const TEAM_STATS = ['runs', 'battingRuns', 'stealRuns', 'defensiveRuns', 'pitchingRunsAboveNeutral'] as const;

/** Adds one game box into running totals for the same club; rosters must match in identity and order. */
export function accumulateBox(totals: TeamBox, box: TeamBox): void {
 if (totals.id !== box.id || totals.batting.length !== box.batting.length || totals.pitching.length !== box.pitching.length ||
  totals.batting.some((line, index) => line.seasonId !== box.batting[index].seasonId) ||
  totals.pitching.some((line, index) => line.seasonId !== box.pitching[index].seasonId)) {
  throw new Error('Cannot total boxes for different rosters');
 }
 for (let index = 0; index < totals.batting.length; index++) {
  for (const stat of BATTING_STATS) totals.batting[index][stat] += box.batting[index][stat];
  for (const component of DEFENSIVE_COMPONENTS) totals.batting[index].defensiveComponents[component] += box.batting[index].defensiveComponents[component];
 }
 for (let index = 0; index < totals.pitching.length; index++) for (const stat of PITCHING_STATS) totals.pitching[index][stat] += box.pitching[index][stat];
 for (const stat of TEAM_STATS) totals[stat] += box[stat];
 for (const component of DEFENSIVE_COMPONENTS) totals.defensiveComponents[component] += box.defensiveComponents[component];
}
