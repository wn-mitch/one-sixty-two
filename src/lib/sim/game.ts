import { buildMatchups } from './matchup.ts';
import { createInningContext, playHalf } from './inning.ts';
import type { GameInput, GameResult, TeamBox, TeamInput } from './types.ts';
import { validateRates, validateTeam } from './validation.ts';
import { beginHalf, createWorkload } from './workload.ts';

export function createBox(team: TeamInput): TeamBox {
 return {
  id: team.id, name: team.name, runs: 0, innings: [],
  batting: team.hitters.map(profile => ({ seasonId: profile.seasonId, playerId: profile.playerId, displayName: profile.displayName,
   PA: 0, AB: 0, H: 0, doubles: 0, triples: 0, HR: 0, BB: 0, HBP: 0, SO: 0, R: 0, RBI: 0, SB: 0, CS: 0, SF: 0 })),
  pitching: team.pitchers.map((profile, index) => ({ seasonId: profile.seasonId, playerId: profile.playerId, displayName: index === team.bullpenIndex ? 'Support bullpen' : profile.displayName,
   role: index === team.bullpenIndex ? 'support' : index === team.closerIndex ? 'closer' : 'starter',
   outs: 0, H: 0, BB: 0, HBP: 0, SO: 0, R: 0, starts: index === team.starterIndex ? 1 : 0, appearances: index === team.starterIndex ? 1 : 0 }))
 };
}

/** Full innings with no synthetic ties, ghost runners, or fallback winners. */
export function simulateGame(input: GameInput, random: () => number): GameResult {
 validateTeam(input.home);
 validateTeam(input.away);
 validateRates(input.leagueRates);
 if (!Number.isFinite(input.park) || input.park <= 0 || !Number.isFinite(input.leagueCatcherCS) || input.leagueCatcherCS < 0 || input.leagueCatcherCS > 1) throw new Error('Invalid game environment');
 const maxPA = input.limits?.maxPA ?? 1000;
 const maxInnings = input.limits?.maxInnings ?? 100;
 if (!Number.isInteger(maxPA) || maxPA < 1 || maxPA > 1000 || !Number.isInteger(maxInnings) || maxInnings < 9 || maxInnings > 100) throw new Error('Invalid simulation safety limits');
 const home = createBox(input.home);
 const away = createBox(input.away);
 const homeWorkload = createWorkload(input.home);
 const awayWorkload = createWorkload(input.away);
 const homeMatchups = input.homeMatchups ?? buildMatchups(input.home.hitters, input.away.pitchers, input.leagueRates, input.park);
 const awayMatchups = input.awayMatchups ?? buildMatchups(input.away.hitters, input.home.pitchers, input.leagueRates, input.park);
 if (homeMatchups.length !== 9 * input.away.pitchers.length * 8 || awayMatchups.length !== 9 * input.home.pitchers.length * 8) throw new Error('Invalid game matchup table');
 const top = createInningContext(input.away, input.home, away, home, homeWorkload, awayMatchups, input.leagueCatcherCS, maxPA);
 const bottom = createInningContext(input.home, input.away, home, away, awayWorkload, homeMatchups, input.leagueCatcherCS, maxPA);
 let finished = false;
 for (let inning = 1; inning <= maxInnings; inning++) {
  beginHalf(input.home, home.pitching, homeWorkload, inning, home.runs - away.runs);
  const awayBefore = away.runs;
  playHalf(top, Infinity, random);
  away.innings.push(away.runs - awayBefore);
  if (inning >= 9 && home.runs > away.runs) {
   home.innings.push(null);
   finished = true;
   break;
  }
  beginHalf(input.away, away.pitching, awayWorkload, inning, away.runs - home.runs);
  const homeBefore = home.runs;
  playHalf(bottom, inning >= 9 ? away.runs + 1 : Infinity, random);
  home.innings.push(home.runs - homeBefore);
  if (inning >= 9 && home.runs !== away.runs) { finished = true; break; }
 }
 if (!finished) throw new Error(`Simulation exceeded ${maxInnings} innings without a winner`);
 const challengeRuns = input.challengeIsHome ? home.runs : away.runs;
 const opponentRuns = input.challengeIsHome ? away.runs : home.runs;
 return { number: input.number, opponentId: input.opponentId, opponentName: input.opponentName, isHome: input.challengeIsHome, home, away, challengeRuns, opponentRuns, win: challengeRuns > opponentRuns };
}
