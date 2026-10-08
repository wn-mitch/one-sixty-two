import { buildMatchups } from './matchup.ts';
import { createInningContext, playHalf, type InningEvent, type InningObserver } from './inning.ts';
import type { GameInput, GameResult, SeasonMoment, TeamBox, TeamInput } from './types.ts';
import { validateDefensiveEnvironment, validateTeam } from './validation.ts';
import { WinExpectancyModel } from './win-expectancy.ts';
import { createDefensiveRunComponents } from './value.ts';
import { beginHalf, createWorkload } from './workload.ts';

export function createBox(team: TeamInput): TeamBox {
 return {
  id: team.id, name: team.name, runs: 0, innings: [],
  batting: team.hitters.map(profile => ({ seasonId: profile.seasonId, playerId: profile.playerId, displayName: profile.displayName,
   PA: 0, AB: 0, H: 0, doubles: 0, triples: 0, HR: 0, BB: 0, HBP: 0, SO: 0, R: 0, RBI: 0, SB: 0, CS: 0, SF: 0,
   battingRuns: 0, stealRuns: 0, defensiveRuns: 0, defensiveComponents: createDefensiveRunComponents(), fieldingOuts: 0, caughtAdvancing: 0 })),
  pitching: team.pitchers.map((profile, index) => ({ seasonId: profile.seasonId, playerId: profile.playerId, displayName: profile.displayName,
   role: index === team.bullpenIndex ? 'support' : index === team.closerIndex ? 'closer' : 'starter',
   outs: 0, H: 0, BB: 0, HBP: 0, SO: 0, R: 0, starts: index === team.starterIndex ? 1 : 0, appearances: index === team.starterIndex ? 1 : 0,
   BF: 0, pitchingRunsAboveNeutral: 0 })),
  battingRuns: 0, stealRuns: 0, defensiveRuns: 0, defensiveComponents: createDefensiveRunComponents(), pitchingRunsAboveNeutral: 0
 };
}

/** Full innings with no synthetic ties, ghost runners, or fallback winners. */
export function simulateGame(input: GameInput, random: () => number, winExpectancy: WinExpectancyModel | null = new WinExpectancyModel(input.defenseEnvironment.leagueRates)): GameResult {
 validateTeam(input.home);
 validateTeam(input.away);
 validateDefensiveEnvironment(input.defenseEnvironment);
 if (!Number.isFinite(input.park) || input.park <= 0) throw new Error('Invalid game environment');
 const maxPA = input.limits?.maxPA ?? 1000;
 const maxInnings = input.limits?.maxInnings ?? 100;
 if (!Number.isInteger(maxPA) || maxPA < 1 || maxPA > 1000 || !Number.isInteger(maxInnings) || maxInnings < 9 || maxInnings > 100) throw new Error('Invalid simulation safety limits');
 const home = createBox(input.home);
 const away = createBox(input.away);
 const homeWorkload = createWorkload(input.home);
 const awayWorkload = createWorkload(input.away);
 const rates = input.defenseEnvironment.leagueRates;
 const homeMatchups = input.homeMatchups ?? buildMatchups(input.home.hitters, input.away.pitchers, rates, input.park);
 const awayMatchups = input.awayMatchups ?? buildMatchups(input.away.hitters, input.home.pitchers, rates, input.park);
 if (homeMatchups.length !== 9 * input.away.pitchers.length * 8 || awayMatchups.length !== 9 * input.home.pitchers.length * 8) throw new Error('Invalid game matchup table');
 const top = createInningContext(input.away, input.home, away, home, homeWorkload, awayMatchups, input.defenseEnvironment, maxPA);
 const bottom = createInningContext(input.home, input.away, home, away, awayWorkload, homeMatchups, input.defenseEnvironment, maxPA);
 let highlight: SeasonMoment | null = null;
 let lowlight: SeasonMoment | null = null;
 let activeInning = 1;
 let activeHalf: 'top' | 'bottom' = 'top';
 const model = winExpectancy;
 const observer: InningObserver | undefined = model ? (event: InningEvent) => {
  const homeRunsBefore = activeHalf === 'top' ? event.defenseRunsBefore : event.offenseRunsBefore;
  const awayRunsBefore = activeHalf === 'top' ? event.offenseRunsBefore : event.defenseRunsBefore;
  const homeRunsAfter = activeHalf === 'top' ? event.defenseRunsAfter : event.offenseRunsAfter;
  const awayRunsAfter = activeHalf === 'top' ? event.offenseRunsAfter : event.defenseRunsAfter;
  const homeWinBefore = model.homeWinProbability(activeInning, activeHalf, event.outsBefore, event.basesBefore, homeRunsBefore, awayRunsBefore);
  const homeWinAfter = model.homeWinProbability(activeInning, activeHalf, event.outsAfter, event.basesAfter, homeRunsAfter, awayRunsAfter);
  const winBefore = input.challengeIsHome ? homeWinBefore : 1 - homeWinBefore;
  const winAfter = input.challengeIsHome ? homeWinAfter : 1 - homeWinAfter;
  const swing = winAfter - winBefore;
  const replacesHighlight = swing > 0 && (!highlight || swing > highlight.swing);
  const replacesLowlight = swing < 0 && (!lowlight || swing < lowlight.swing);
  if (!replacesHighlight && !replacesLowlight) return;
  const moment: SeasonMoment = {
   gameNumber: input.number, opponentName: input.opponentName, isHome: input.challengeIsHome,
   inning: activeInning, half: activeHalf, outsBefore: event.outsBefore, basesBefore: event.basesBefore,
   challengeRunsBefore: input.challengeIsHome ? homeRunsBefore : awayRunsBefore,
   opponentRunsBefore: input.challengeIsHome ? awayRunsBefore : homeRunsBefore,
   challengeRunsAfter: input.challengeIsHome ? homeRunsAfter : awayRunsAfter,
   opponentRunsAfter: input.challengeIsHome ? awayRunsAfter : homeRunsAfter,
   batterName: event.batterName, batterSeasonId: event.batterSeasonId,
   pitcherName: event.pitcherName, pitcherSeasonId: event.pitcherSeasonId,
   challengeBatting: input.challengeIsHome === (activeHalf === 'bottom'),
   outcome: event.outcome, runsScored: event.runsScored,
   winBefore, winAfter, swing
  };
  if (replacesHighlight) highlight = moment;
  if (replacesLowlight) lowlight = moment;
 } : undefined;
 let finished = false;
 for (let inning = 1; inning <= maxInnings; inning++) {
  activeInning = inning;
  activeHalf = 'top';
  beginHalf(input.home, home.pitching, homeWorkload, inning, home.runs - away.runs);
  const awayBefore = away.runs;
  playHalf(top, Infinity, random, observer);
  away.innings.push(away.runs - awayBefore);
  if (inning >= 9 && home.runs > away.runs) {
   home.innings.push(null);
   finished = true;
   break;
  }
  activeHalf = 'bottom';
  beginHalf(input.away, away.pitching, awayWorkload, inning, away.runs - home.runs);
  const homeBefore = home.runs;
  playHalf(bottom, inning >= 9 ? away.runs + 1 : Infinity, random, observer);
  home.innings.push(home.runs - homeBefore);
  if (inning >= 9 && home.runs !== away.runs) { finished = true; break; }
 }
 if (!finished) throw new Error(`Simulation exceeded ${maxInnings} innings without a winner`);
 const challengeRuns = input.challengeIsHome ? home.runs : away.runs;
 const opponentRuns = input.challengeIsHome ? away.runs : home.runs;
 return { number: input.number, opponentId: input.opponentId, opponentName: input.opponentName, isHome: input.challengeIsHome, home, away, challengeRuns, opponentRuns, win: challengeRuns > opponentRuns, highlight, lowlight };
}
