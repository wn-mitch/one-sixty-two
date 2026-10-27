import type { GameResult } from '../sim/types.ts';

/**
 * One of the club's games kept for the report: a highlight win or a lowlight loss. `swing` is the
 * deficit overcome or the lead blown, in runs; `walkOff` marks a game decided in its last half.
 */
export interface DraftMoment { game: GameResult; segment: number; walkOff: boolean; swing: number; margin: number }
export interface SeasonMoments { highlight: DraftMoment | null; lowlight: DraftMoment | null }

/** The club's game number (1-162) for a league game result. */
export const momentGameNumber = (moment: DraftMoment): number => Math.floor((moment.game.number - 1) / 4) + 1;

/**
 * Reads a game from the club's side, half inning by half inning: the most it trailed and led by
 * at any half's end, and whether the last half settled it from a tie or the other side of it.
 */
function shape(game: GameResult): { worst: number; best: number; walkOff: boolean; margin: number } {
 const sign = game.isHome ? 1 : -1;
 const innings = Math.max(game.away.innings.length, game.home.innings.length);
 let diff = 0, worst = 0, best = 0, before = 0;
 for (let inning = 0; inning < innings; inning++) {
  for (const [box, side] of [[game.away, -1], [game.home, 1]] as const) {
   const runs = box.innings[inning];
   if (runs == null) continue;
   before = diff;
   diff += sign * side * runs;
   worst = Math.min(worst, diff);
   best = Math.max(best, diff);
  }
 }
 // A walk-off ends in the home half that turned a tie or a deficit (for the side batting) into the result.
 const lastHome = game.home.innings[innings - 1];
 const endedInHomeHalf = lastHome != null && lastHome > 0;
 const walkOff = endedInHomeHalf && (game.isHome ? game.win && before <= 0 : !game.win && before >= 0);
 return { worst, best, walkOff, margin: Math.abs(game.challengeRuns - game.opponentRuns) };
}

const outranks = (a: DraftMoment, b: DraftMoment | null): boolean =>
 !b || (a.walkOff !== b.walkOff ? a.walkOff : a.swing !== b.swing ? a.swing > b.swing : a.margin !== b.margin ? a.margin > b.margin : a.game.number < b.game.number);

/**
 * Keeps the season's best and worst game through segment `segment`'s club games: the highlight is a
 * walk-off win first, then the biggest comeback, then the widest win; the lowlight mirrors it with
 * walk-off losses and blown leads.
 */
export function updateMoments(moments: SeasonMoments, games: readonly GameResult[], segment: number): SeasonMoments {
 let { highlight, lowlight } = moments;
 for (const game of games) {
  const { worst, best, walkOff, margin } = shape(game);
  const moment: DraftMoment = { game, segment, walkOff, swing: game.win ? -worst : best, margin };
  if (game.win && outranks(moment, highlight)) highlight = moment;
  if (!game.win && outranks(moment, lowlight)) lowlight = moment;
 }
 return { highlight, lowlight };
}

/** A one-line account of a moment, from the club's side. */
export function momentTitle(moment: DraftMoment): string {
 const { game, walkOff, swing, margin } = moment;
 const at = `${game.isHome ? 'vs' : 'at'} ${game.opponentName}, game ${momentGameNumber(moment)}`;
 if (game.win) {
  if (walkOff) return `Walk-off win${swing ? ` from ${swing} down` : ''} ${at}`;
  return swing ? `Came back from ${swing} down ${at}` : `Won by ${margin} ${at}`;
 }
 if (walkOff) return `Walk-off loss${swing ? ` after leading by ${swing}` : ''} ${at}`;
 return swing ? `Blew a ${swing}-run lead ${at}` : `Lost by ${margin} ${at}`;
}

