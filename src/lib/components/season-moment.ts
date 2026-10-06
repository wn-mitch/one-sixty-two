import type { GameResult, SeasonMoment } from '../sim/types.ts';

export interface SeasonMomentCopy {
 matchup: string;
 situation: string;
 action: string;
 score: string;
 winChance: string;
 swing: string;
 final: string | null;
}

const numberWords = ['zero', 'one', 'two', 'three', 'four'];

function ordinal(value: number): string {
 const remainder = value % 100;
 if (remainder >= 11 && remainder <= 13) return `${value}th`;
 if (value % 10 === 1) return `${value}st`;
 if (value % 10 === 2) return `${value}nd`;
 if (value % 10 === 3) return `${value}rd`;
 return `${value}th`;
}

function outs(value: number): string {
 return `${numberWords[value] ?? value} ${value === 1 ? 'out' : 'outs'}`;
}

function bases(mask: number): string {
 switch (mask) {
  case 0: return 'bases empty';
  case 1: return 'runner on first';
  case 2: return 'runner on second';
  case 3: return 'runners on first and second';
  case 4: return 'runner on third';
  case 5: return 'runners on first and third';
  case 6: return 'runners on second and third';
  case 7: return 'bases loaded';
  default: return 'base state unavailable';
 }
}

function scoredRuns(runs: number): string {
 if (runs === 0) return '';
 return `, scoring ${numberWords[runs] ?? runs} ${runs === 1 ? 'run' : 'runs'}`;
}

function outcome(moment: SeasonMoment): string {
 const suffix = scoredRuns(moment.runsScored);
 switch (moment.outcome) {
  case 'walk': return `drew a walk${suffix}`;
  case 'hitByPitch': return `was hit by a pitch${suffix}`;
  case 'strikeout': return 'struck out';
  case 'single': return `singled${suffix}`;
  case 'double': return `doubled${suffix}`;
  case 'triple': return `tripled${suffix}`;
  case 'homeRun':
   if (moment.runsScored === 4) return 'hit a grand slam';
   if (moment.runsScored === 3) return 'hit a three-run home run';
   if (moment.runsScored === 2) return 'hit a two-run home run';
   if (moment.runsScored === 1) return 'hit a solo home run';
   return 'hit a home run';
  case 'groundedIntoDoublePlay': return `grounded into a double play${suffix}`;
  case 'sacrificeFly': return `hit a sacrifice fly${suffix}`;
  case 'out': return `made an out${suffix}`;
  case 'reachedOnError': return `reached on an error${suffix}`;
  case 'stolenBase': return `stole a base${suffix}`;
  case 'caughtStealing': return 'was caught stealing';
 }
}

function scoreState(challenge: number, opponent: number): string {
 if (challenge === opponent) return `the score was tied ${challenge}–${opponent}`;
 return `your club ${challenge > opponent ? 'led' : 'trailed'} ${challenge}–${opponent}`;
}

function isWalkOff(moment: SeasonMoment): boolean {
 const battingTeamIsHome = moment.challengeBatting === moment.isHome;
 if (!battingTeamIsHome || moment.half !== 'bottom' || moment.inning < 9) return false;
 const battingRunsBefore = moment.challengeBatting ? moment.challengeRunsBefore : moment.opponentRunsBefore;
 const fieldingRunsBefore = moment.challengeBatting ? moment.opponentRunsBefore : moment.challengeRunsBefore;
 const battingRunsAfter = moment.challengeBatting ? moment.challengeRunsAfter : moment.opponentRunsAfter;
 const fieldingRunsAfter = moment.challengeBatting ? moment.opponentRunsAfter : moment.challengeRunsAfter;
 return battingRunsBefore <= fieldingRunsBefore && battingRunsAfter > fieldingRunsAfter;
}

function percentage(value: number): string {
 return `${(value * 100).toFixed(1)}%`;
}

function percentagePoints(value: number): string {
 const points = value * 100;
 if (points === 0) return '0.0 pp';
 return `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)} pp`;
}

export function formatSeasonMoment(moment: SeasonMoment, game?: GameResult): SeasonMomentCopy {
 const actor = moment.challengeBatting ? moment.batterName : `Opponent hitter ${moment.batterName}`;
 const walkOff = isWalkOff(moment) ? ' It was a walk-off.' : '';
 return {
  matchup: `Game ${moment.gameNumber} · ${moment.isHome ? 'vs.' : 'at'} ${moment.opponentName}`,
  situation: `${moment.half === 'top' ? 'Top' : 'Bottom'} of the ${ordinal(moment.inning)} · ${outs(moment.outsBefore)} · ${bases(moment.basesBefore)}`,
  action: `${actor} ${outcome(moment)} against ${moment.pitcherName}.${walkOff}`,
  score: `Before the play, ${scoreState(moment.challengeRunsBefore, moment.opponentRunsBefore)}; after it, ${scoreState(moment.challengeRunsAfter, moment.opponentRunsAfter)}.`,
  winChance: `${percentage(moment.winBefore)} → ${percentage(moment.winAfter)}`,
  swing: percentagePoints(moment.swing),
  final: game ? `Final: ${game.win ? 'W' : 'L'}, ${game.challengeRuns}–${game.opponentRuns}` : null
 };
}
