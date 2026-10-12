import { describe, expect, it } from 'vitest';
import { buildSchedule } from '../engine/node.ts';
import type { GameResult } from '../sim/types.ts';
import { dateGames, DOUBLEHEADERS, OFF_DAYS, opponentSeries, seasonMonths, streakEnds, venueRecords } from './season-calendar.ts';

const IDS = Array.from({ length: 30 }, (_, index) => `T${String(index).padStart(2, '0')}`);

function season(seed: number): GameResult[] {
	return buildSchedule(seed, IDS).map((entry, index) => ({
		number: index + 1,
		opponentId: entry.opponentId,
		opponentName: `Club ${entry.opponentId}`,
		isHome: entry.isHome,
		challengeRuns: index % 3 === 0 ? 2 : 5,
		opponentRuns: 3,
		win: index % 3 !== 0
	}) as GameResult);
}

const DAY_MS = 86_400_000;

describe('season calendar', () => {
	it('plays series on consecutive days, doubles up a few, and spends every off day on a travel break', () => {
		for (const seed of [0, 15, 162, 9001]) {
			const games = season(seed);
			const dated = dateGames(games, seed);
			const gaps = dated.slice(1).map((entry, index) => ({
				days: (entry.date.getTime() - dated[index].date.getTime()) / DAY_MS,
				venueChange: entry.game.isHome !== dated[index].game.isHome,
				sameSeries: entry.game.isHome === dated[index].game.isHome && entry.game.opponentId === dated[index].game.opponentId
			}));
			expect(gaps.every(gap => gap.days >= 0 && gap.days <= 2)).toBe(true);
			const doubleheaders = gaps.filter(gap => gap.days === 0);
			expect(doubleheaders).toHaveLength(DOUBLEHEADERS);
			expect(doubleheaders.every(gap => gap.sameSeries)).toBe(true);
			expect(gaps.filter(gap => gap.days === 2).every(gap => gap.venueChange)).toBe(true);
			const breaks = gaps.filter(gap => gap.venueChange).length;
			expect(gaps.filter(gap => gap.days === 2)).toHaveLength(Math.min(breaks, OFF_DAYS + DOUBLEHEADERS));
			expect(dated[0].date.getUTCDay()).toBe(4);
			// Opening day in late March through the end of September at the latest.
			expect(dated.at(-1)!.date.getTime()).toBeLessThanOrEqual(Date.UTC(2026, 8, 30));
			expect(dateGames(games, seed)).toEqual(dated);
		}
	});

	it('lays every game into its month with that month\'s record', () => {
		const games = season(162);
		const months = seasonMonths(games, 162);
		expect(months[0].name).toBe('March');
		expect(months[0].lead).toBe(0);
		const placed = months.flatMap(month => month.days.flatMap(day => day.games.map(game => game.number)));
		expect(placed).toEqual(games.map(game => game.number));
		for (const month of months) {
			const played = month.days.flatMap(day => day.games);
			expect(month.wins).toBe(played.filter(game => game.win).length);
			expect(month.losses).toBe(played.length - month.wins);
		}
		expect(months.reduce((sum, month) => sum + month.wins, 0)).toBe(games.filter(game => game.win).length);
	});

	it('totals each opponent\'s season series', () => {
		const games = season(162);
		const series = opponentSeries(games);
		expect(series).toHaveLength(30);
		expect(series.reduce((sum, entry) => sum + entry.games.length, 0)).toBe(162);
		for (const entry of series) {
			expect(entry.games.every(game => game.opponentId === entry.opponentId)).toBe(true);
			expect(entry.wins + entry.losses).toBe(entry.games.length);
			expect(entry.runsFor).toBe(entry.games.reduce((sum, game) => sum + game.challengeRuns, 0));
		}
	});
});

describe('streaks and venue records', () => {
	const results = (pattern: string): GameResult[] => [...pattern].map((mark, index) => ({ number: index + 1, win: mark === 'W', isHome: index % 2 === 0 }) as GameResult);

	it('marks only the last game of each run of three or more', () => {
		expect([...streakEnds(results('WWWLLWWWWL'))]).toEqual([[3, { win: true, length: 3 }], [9, { win: true, length: 4 }]]);
		// A season-ending streak is closed by the final game.
		expect([...streakEnds(results('LWLLL'))]).toEqual([[5, { win: false, length: 3 }]]);
		expect(streakEnds(results('WLWLWL')).size).toBe(0);
	});

	it('splits the record by venue', () => {
		expect(venueRecords(results('WWWL'))).toEqual({ home: { wins: 2, losses: 0 }, away: { wins: 1, losses: 1 } });
	});
});
