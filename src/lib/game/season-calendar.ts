import type { GameResult } from '../sim/types.ts';
import { randomStream } from './random.ts';

/** Opening day is a Thursday late in March; the year only fixes weekdays and is never shown. */
const OPENING_DAY = Date.UTC(2026, 2, 26);
const DAY_MS = 86_400_000;
/** A big-league season has about two dozen open dates. */
export const OFF_DAYS = 24;
/** Makeup doubleheaders; each one returns a date to the open-date budget. */
export const DOUBLEHEADERS = 3;

export interface CalendarDay {
	/** Day of the month, 1-based. */
	day: number;
	/** No games on an open date, two on a doubleheader. */
	games: GameResult[];
}

export interface CalendarMonth {
	/** UTC month index, 0 = January. */
	month: number;
	name: string;
	/** Blank cells before the first of the month in a Sunday-first week. */
	lead: number;
	days: CalendarDay[];
	wins: number;
	losses: number;
}

export interface DatedGame {
	game: GameResult;
	date: Date;
}

export interface OpponentSeries {
	opponentId: string;
	opponentName: string;
	games: GameResult[];
	wins: number;
	losses: number;
	runsFor: number;
	runsAgainst: number;
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const LONG_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Formats a schedule date as "Thu, Apr 30". */
export function formatGameDate(date: Date): string {
	return LONG_DATE.format(date);
}

/**
 * Lays the season onto a calendar. Games run on consecutive days within a series; an off day falls
 * at a travel break where a series at one venue gives way to a series at the other. When there are
 * more travel breaks than off days, the off days are spread evenly across them. A few series, drawn
 * from the season seed away from opening and closing weeks, play their first two games as a
 * doubleheader, and each one adds an off day so the season still spans the same dates.
 */
export function dateGames(games: readonly GameResult[], seed: number): DatedGame[] {
	const breaks: number[] = [];
	const seriesStarts: number[] = [];
	for (let index = 1; index < games.length; index++) {
		if (games[index].isHome !== games[index - 1].isHome) breaks.push(index);
		if (games[index].isHome !== games[index - 1].isHome || games[index].opponentId !== games[index - 1].opponentId) seriesStarts.push(index);
	}
	// Doubleheaders need a series of three or more, clear of the first and last month of play.
	const eligible = seriesStarts.filter((start, at) => {
		const end = seriesStarts[at + 1] ?? games.length;
		return end - start >= 3 && start > 25 && end < games.length - 25;
	});
	const random = randomStream(seed, 'calendar');
	const doubled = new Set<number>();
	while (doubled.size < Math.min(DOUBLEHEADERS, eligible.length)) doubled.add(eligible[Math.floor(random() * eligible.length)] + 1);
	const budget = OFF_DAYS + doubled.size;
	const offBefore = new Set<number>();
	if (breaks.length <= budget) for (const index of breaks) offBefore.add(index);
	else for (let pick = 0; pick < budget; pick++) offBefore.add(breaks[Math.floor((pick * breaks.length) / budget)]);
	let day = 0;
	return games.map((game, index) => {
		if (index > 0) day += doubled.has(index) ? 0 : offBefore.has(index) ? 2 : 1;
		return { game, date: new Date(OPENING_DAY + day * DAY_MS) };
	});
}

/** Groups dated games into full calendar months from opening day through the final game. */
export function seasonMonths(games: readonly GameResult[], seed: number): CalendarMonth[] {
	const dated = dateGames(games, seed);
	if (!dated.length) return [];
	const byDay = new Map<number, GameResult[]>();
	for (const entry of dated) byDay.set(entry.date.getTime(), [...byDay.get(entry.date.getTime()) ?? [], entry.game]);
	const first = dated[0].date;
	const last = dated[dated.length - 1].date;
	const months: CalendarMonth[] = [];
	for (let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1); cursor <= last.getTime();) {
		const start = new Date(cursor);
		const year = start.getUTCFullYear();
		const month = start.getUTCMonth();
		const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		const days: CalendarDay[] = Array.from({ length }, (_, index) => ({
			day: index + 1,
			games: byDay.get(Date.UTC(year, month, index + 1)) ?? []
		}));
		const played = days.flatMap(entry => entry.games);
		months.push({
			month,
			name: MONTH.format(start),
			lead: start.getUTCDay(),
			days,
			wins: played.filter(game => game.win).length,
			losses: played.filter(game => !game.win).length
		});
		cursor = Date.UTC(year, month + 1, 1);
	}
	return months;
}

/** Each opponent's season series in schedule order, sorted by opponent name. */
export function opponentSeries(games: readonly GameResult[]): OpponentSeries[] {
	const byOpponent = new Map<string, OpponentSeries>();
	for (const game of games) {
		let series = byOpponent.get(game.opponentId);
		if (!series) {
			series = { opponentId: game.opponentId, opponentName: game.opponentName, games: [], wins: 0, losses: 0, runsFor: 0, runsAgainst: 0 };
			byOpponent.set(game.opponentId, series);
		}
		series.games.push(game);
		if (game.win) series.wins++;
		else series.losses++;
		series.runsFor += game.challengeRuns;
		series.runsAgainst += game.opponentRuns;
	}
	return [...byOpponent.values()].sort((a, b) => a.opponentName.localeCompare(b.opponentName) || a.opponentId.localeCompare(b.opponentId));
}

/** A run of consecutive wins or losses, marked on the game that ended it. */
export interface Streak { win: boolean; length: number }

/** Streaks of at least `minimum` games, keyed by the number of each streak's last game. */
export function streakEnds(games: readonly GameResult[], minimum = 3): Map<number, Streak> {
 const ordered = [...games].sort((a, b) => a.number - b.number);
 const ends = new Map<number, Streak>();
 let length = 0;
 ordered.forEach((game, index) => {
  length = index > 0 && ordered[index - 1].win === game.win ? length + 1 : 1;
  const next = ordered[index + 1];
  if ((!next || next.win !== game.win) && length >= minimum) ends.set(game.number, { win: game.win, length });
 });
 return ends;
}

/** Wins and losses at home and on the road. */
export function venueRecords(games: readonly GameResult[]): { home: { wins: number; losses: number }; away: { wins: number; losses: number } } {
 const records = { home: { wins: 0, losses: 0 }, away: { wins: 0, losses: 0 } };
 for (const game of games) records[game.isHome ? 'home' : 'away'][game.win ? 'wins' : 'losses']++;
 return records;
}
