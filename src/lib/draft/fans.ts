import type { Crowd, LeagueGame } from '../sim/league-types.ts';
import { RIVALS } from './franchises.ts';

/**
 * Draft Mode's crowds. Each club's fans hold an expectation (a winning percentage) and a sentiment
 * from -1 (hostile) to 1 (euphoric). Sentiment follows wins against that expectation, sets the
 * share of seats filled, and the filled seats lean the strike zone at home and sell tickets.
 *
 * Every number here is provisional. Sources: MLB home teams win about .540 over the long run, and
 * the 2020 season without spectators showed no significant drop (Chiu and Chang, 13,044 games,
 * home-win odds ratio 1.068, 95% CI 0.932-1.224), so the crowd owns only a small share of home
 * advantage; soccer's ghost games tie the lost advantage to occupancy, with clubs used to thin
 * crowds losing least (Fischer and Haucap), so the crowd's effect saturates with the share of seats
 * filled. `engine league-crowd` on drafted real-data leagues (38,880 games an edge) measured home
 * teams winning .497 with no edge and about .066 more per 0.1 of edge, nearly linear through 0.2;
 * so the non-crowd edge puts an empty park near .525 and a neutral crowd at 70% full near .540.
 * Euphoric full houses reach about .574 and hostile crowds fall to about .513. Volatility at
 * 0.06 moved the home record by .001, within one standard error.
 */
export const FANS_VERSION = 'fans-v1' as const;

export interface FanState {
 /** The winning percentage the roster's visible stars promise, before results. */
 prior: number;
 /** The winning percentage fans hold the club to now. */
 expectation: number;
 sentiment: number;
}

/** A franchise's crowd: seats it fills when sentiment is neutral, how strongly it leans, and how hard it swings. */
export interface FanProfile { baseFill: number; crowdScale: number; fairWeather: number; expectationBias: number }

const DEFAULT_PROFILE: FanProfile = { baseFill: .7, crowdScale: 1, fairWeather: 1, expectationBias: 0 };
/** Catalog traits: Atlanta's remote park draws thinner, quieter crowds; Baltimore's fans expect little; LA and New York are fair-weather. */
const PROFILES: Readonly<Record<string, Partial<FanProfile>>> = {
 ATL: { baseFill: .6, crowdScale: .6 },
 BAL: { expectationBias: -.04 },
 LAD: { baseFill: .78, fairWeather: 1.6 },
 NYY: { baseFill: .75, fairWeather: 1.6 }
};

export const fanProfile = (franchiseId: string): FanProfile => ({ ...DEFAULT_PROFILE, ...PROFILES[franchiseId] });

/** Expected winning percentage per standard deviation of active payroll above the league mean. */
export const EXPECTATION_SPREAD = .05;
export const EXPECTATION_RANGE = [.3, .75] as const;
/** Each segment the expectation moves this share of the way to the season record... */
export const EXPECTATION_DRIFT = .15;
/** ...until the record misses it by this much after at least two segments, when it resets to the record. */
export const EXPECTATION_RESET = .07;
const RESET_AFTER_GAMES = 18;
/** Sentiment kept from one segment to the next. */
export const SENTIMENT_PERSISTENCE = .75;
/** Sentiment per win above (or below) the expectation in a segment, before the franchise's fair-weather factor. */
export const SENTIMENT_PER_WIN = .1;
/** Sentiment from beating, and losing to, a recognized rival. */
export const RIVAL_WIN = .04;
export const RIVAL_LOSS = -.02;
/** Seats filled per point of sentiment, the floor, and the extra share a rival draws. */
export const FILL_PER_SENTIMENT = .3;
export const MIN_FILL = .25;
export const RIVAL_FILL = .1;
/** Home edge that has nothing to do with the crowd, and the crowd's edge at a full, neutral house. */
export const BASE_EDGE = .042;
export const CROWD_EDGE = .025;
/** Occupancy scale of the crowd's saturating effect: half of it arrives by about a quarter full. */
const SATURATION = .35;
/** Game-to-game spread of the edge at a full house; thinner crowds spread less. */
export const MAX_VOLATILITY = .06;
/**
 * Payday, about 20 a stop on average: a fixed salary (about half), the gate (about a quarter: 1.6 a
 * home game at a full house, about 4.5 home games at 70% full), and the win bonus (about a
 * quarter). Like a blind cleared with hands to spare, a win pays more the wider its margin: 0.7,
 * plus 0.25 for each run beyond the first up to four. `engine league-crowd` measured 30% of
 * league wins by one run and a mean margin of 3.2, so a win pays about 1.15 and a .500 stop about 5.
 */
export const SALARY = 10;
export const GATE_PER_FULL_HOUSE = 1.6;
export const WIN_BASE = .7;
export const WIN_PER_RUN = .25;
export const MARGIN_RUNS_PAID = 4;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;

export const isRivalry = (a: string, b: string): boolean => (RIVALS[a] ?? []).includes(b) || (RIVALS[b] ?? []).includes(a);

/** Each club's prior from its active payroll, the visible measure of its stars. */
export function priors(franchiseIds: readonly string[], payrolls: readonly number[]): number[] {
 const mean = payrolls.reduce((sum, value) => sum + value, 0) / payrolls.length;
 const sd = Math.sqrt(payrolls.reduce((sum, value) => sum + (value - mean) ** 2, 0) / payrolls.length) || 1;
 return payrolls.map((payroll, seat) => round(clamp(.5 + EXPECTATION_SPREAD * (payroll - mean) / sd + fanProfile(franchiseIds[seat]).expectationBias, ...EXPECTATION_RANGE)));
}

export const openingFans = (prior: number): FanState => ({ prior, expectation: prior, sentiment: 0 });

/** Share of seats filled at a club's ordinary home game. */
export const fill = (franchiseId: string, fans: FanState): number => round(clamp(fanProfile(franchiseId).baseFill + FILL_PER_SENTIMENT * fans.sentiment, MIN_FILL, 1));

/** The crowd's lean grows with occupancy and flattens near a full house; scaled so a full house is 1. */
const saturation = (share: number) => (1 - Math.exp(-share / SATURATION)) / (1 - Math.exp(-1 / SATURATION));

/**
 * The home crowd for the next segment. Neutral fans add their lean to the home side; euphoric fans
 * triple it; hostile fans turn it against the home side. Volatility grows with the crowd's size.
 */
export function crowd(franchiseId: string, fans: FanState): Crowd {
 const profile = fanProfile(franchiseId);
 const share = fill(franchiseId, fans);
 const mood = clamp(1 + 2 * fans.sentiment, -1, 3);
 return { edge: round(BASE_EDGE + CROWD_EDGE * profile.crowdScale * saturation(share) * mood), volatility: round(MAX_VOLATILITY * profile.crowdScale * share ** 3) };
}

export interface Payday { salary: number; gate: number; winBonus: number; homeGames: number; wins: number; attendance: number }

export const paydayTotal = (payday: Payday): number => payday.salary + payday.gate + payday.winBonus;

/** A win's bonus by its run margin. */
export const winBonus = (margin: number): number => WIN_BASE + WIN_PER_RUN * Math.min(margin - 1, MARGIN_RUNS_PAID);

/** A club's segment payday: its salary, the gate from each home game's filled seats, and a bonus for each win by its margin. */
export function payday(seat: number, franchiseIds: readonly string[], fans: FanState, games: readonly LeagueGame[]): Payday {
 const franchiseId = franchiseIds[seat];
 const base = fill(franchiseId, fans);
 const shares = games.filter(game => game.home === seat).map(game => Math.min(1, base + (isRivalry(franchiseId, franchiseIds[game.away]) ? RIVAL_FILL : 0)));
 const seats = shares.reduce((sum, share) => sum + share, 0);
 const margins = games.flatMap(game => game.home === seat ? [game.homeRuns - game.awayRuns] : game.away === seat ? [game.awayRuns - game.homeRuns] : []).filter(margin => margin > 0);
 return {
  salary: SALARY, gate: Math.round(GATE_PER_FULL_HOUSE * seats), winBonus: Math.round(margins.reduce((sum, margin) => sum + winBonus(margin), 0)),
  homeGames: shares.length, wins: margins.length, attendance: shares.length ? round(seats / shares.length, 3) : 0
 };
}

/**
 * Fans after a segment. Sentiment decays toward neutral and moves with wins against the
 * expectation, more for fair-weather franchises, plus a bounded swing from games against rivals.
 * The expectation drifts toward the season record, then jumps to it once the gap is obvious.
 */
export function afterSegment(seat: number, franchiseIds: readonly string[], fans: FanState, segment: readonly LeagueGame[], season: { wins: number; games: number }): FanState {
 const franchiseId = franchiseIds[seat];
 let swing = 0;
 let wins = 0;
 let games = 0;
 for (const game of segment) {
  if (game.home !== seat && game.away !== seat) continue;
  const won = game.home === seat ? game.homeRuns > game.awayRuns : game.awayRuns > game.homeRuns;
  games++;
  if (won) wins++;
  if (isRivalry(franchiseId, franchiseIds[game.home === seat ? game.away : game.home])) swing += won ? RIVAL_WIN : RIVAL_LOSS;
 }
 const surprise = (wins - games * fans.expectation) * SENTIMENT_PER_WIN * fanProfile(franchiseId).fairWeather;
 const sentiment = round(clamp(SENTIMENT_PERSISTENCE * fans.sentiment + surprise + swing, -1, 1));
 const record = season.games ? season.wins / season.games : fans.expectation;
 const gap = record - fans.expectation;
 const expectation = season.games >= RESET_AFTER_GAMES && Math.abs(gap) > EXPECTATION_RESET ? record : fans.expectation + EXPECTATION_DRIFT * gap;
 return { prior: fans.prior, expectation: round(clamp(expectation, ...EXPECTATION_RANGE)), sentiment };
}
