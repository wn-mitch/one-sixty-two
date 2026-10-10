import { buildMatchupInputs } from './contact-profile.ts';
import { preparePark } from './flight.ts';
import { createInningContext, playHalf, type InningEvent, type InningObserver } from './inning.ts';
import { stadiumRef, validateStadium } from './park.ts';
import type { GameInput, GameRandomStreams, GameResult, SeasonMoment, TeamBox, TeamInput, WinPoint } from './types.ts';
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

/**
 * Full innings in the home team's venue, with no synthetic ties, ghost runners, or fallback winners.
 * A `trace` receives the pre-game win chance, the chance after every play, and the final 1 or 0, all from the challenge side.
 */
export function simulateGame(input: GameInput, streams: GameRandomStreams, winExpectancy: WinExpectancyModel | null = new WinExpectancyModel(input.defenseEnvironment), trace?: WinPoint[]): GameResult {
 validateTeam(input.home);
 validateTeam(input.away);
 validateDefensiveEnvironment(input.defenseEnvironment);
 validateStadium(input.stadium);
 const park = preparePark(input.stadium);
 const maxPA = input.limits?.maxPA ?? 1000;
 const maxInnings = input.limits?.maxInnings ?? 100;
 if (!Number.isInteger(maxPA) || maxPA < 1 || maxPA > 1000 || !Number.isInteger(maxInnings) || maxInnings < 9 || maxInnings > 100) throw new Error('Invalid simulation safety limits');
 const home = createBox(input.home);
 const away = createBox(input.away);
 const homeWorkload = createWorkload(input.home);
 const awayWorkload = createWorkload(input.away);
 const environment = input.defenseEnvironment;
 const homeMatchups = input.homeMatchups ?? buildMatchupInputs(input.home.hitters, input.away.pitchers, environment.leagueRates, environment.contactModel);
 const awayMatchups = input.awayMatchups ?? buildMatchupInputs(input.away.hitters, input.home.pitchers, environment.leagueRates, environment.contactModel);
 const top = createInningContext(input.away, input.home, away, home, homeWorkload, awayMatchups, environment, park, maxPA);
 const bottom = createInningContext(input.home, input.away, home, away, awayWorkload, homeMatchups, environment, park, maxPA);
 let highlight: SeasonMoment | null = null;
 let lowlight: SeasonMoment | null = null;
 let activeInning = 1;
 let activeHalf: 'top' | 'bottom' = 'top';
 const model = winExpectancy;
 /** Each play starts from the previous play's chance, so the trace and swings share one sequence across half-inning boundaries. */
 let previousWin = 0;
 if (model) {
  const homeWin = model.homeWinProbability(1, 'top', 0, 0, 0, 0);
  previousWin = input.challengeIsHome ? homeWin : 1 - homeWin;
  trace?.push({ half: 0, win: previousWin });
 }
 const observer: InningObserver | undefined = model ? (event: InningEvent) => {
  const homeRunsBefore = activeHalf === 'top' ? event.defenseRunsBefore : event.offenseRunsBefore;
  const awayRunsBefore = activeHalf === 'top' ? event.offenseRunsBefore : event.defenseRunsBefore;
  const homeRunsAfter = activeHalf === 'top' ? event.defenseRunsAfter : event.offenseRunsAfter;
  const awayRunsAfter = activeHalf === 'top' ? event.offenseRunsAfter : event.defenseRunsAfter;
  const homeWinAfter = model.homeWinProbability(activeInning, activeHalf, event.outsAfter, event.basesAfter, homeRunsAfter, awayRunsAfter);
  const winBefore = previousWin;
  const winAfter = input.challengeIsHome ? homeWinAfter : 1 - homeWinAfter;
  previousWin = winAfter;
  const swing = winAfter - winBefore;
  trace?.push({ half: (activeInning - 1) * 2 + (activeHalf === 'bottom' ? 1 : 0), win: winAfter });
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
  playHalf(top, Infinity, streams, observer);
  away.innings.push(away.runs - awayBefore);
  if (inning >= 9 && home.runs > away.runs) {
   home.innings.push(null);
   finished = true;
   break;
  }
  activeHalf = 'bottom';
  beginHalf(input.away, away.pitching, awayWorkload, inning, away.runs - home.runs);
  const homeBefore = home.runs;
  playHalf(bottom, inning >= 9 ? away.runs + 1 : Infinity, streams, observer);
  home.innings.push(home.runs - homeBefore);
  if (inning >= 9 && home.runs !== away.runs) { finished = true; break; }
 }
 if (!finished) throw new Error(`Simulation exceeded ${maxInnings} innings without a winner`);
 const challengeRuns = input.challengeIsHome ? home.runs : away.runs;
 const opponentRuns = input.challengeIsHome ? away.runs : home.runs;
 if (trace && model) trace.push({ half: (activeInning - 1) * 2 + (activeHalf === 'bottom' ? 1 : 0), win: challengeRuns > opponentRuns ? 1 : 0 });
 return { number: input.number, opponentId: input.opponentId, opponentName: input.opponentName, isHome: input.challengeIsHome,
  stadium: stadiumRef(input.stadium), stadiumName: input.stadium.name, home, away, challengeRuns, opponentRuns, win: challengeRuns > opponentRuns, highlight, lowlight };
}
