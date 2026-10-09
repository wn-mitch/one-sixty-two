import { describe, expect, it } from 'vitest';
import type { CardEra } from '../cards/view-model.ts';
import { arrangeHomeWall } from './home-wall.ts';

const eras: CardEra[] = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

function showcase() {
	return eras.flatMap((era, index) => Array.from({ length: 4 }, (_, card) => ({
		playerId: `player-${index}-${card}`,
		seasonId: `season-${index}-${card}`,
		model: { era }
	})));
}

function expectDifferentBorders(rows: ReturnType<typeof showcase>[]) {
	for (let row = 0; row < rows.length; row++) {
		const cards = rows[row]!;
		expect(cards.length).toBeGreaterThan(1);
		for (let index = 0; index < cards.length; index++) {
			expect(cards[index]!.model.era).not.toBe(cards[(index + 1) % cards.length]!.model.era);
		}
		// Any pair can line up as neighboring rows drift at independent speeds.
		for (const card of cards) {
			for (const below of rows[row + 1] ?? []) expect(card.model.era).not.toBe(below.model.era);
		}
	}
}

describe('Home wall arrangement', () => {
	it.each([3, 4] as const)('keeps era borders distinct and every player in one row with %i rows', rowCount => {
		const cards = showcase();
		const rows = arrangeHomeWall(cards, rowCount);
		expectDifferentBorders(rows);
		expect(rows.flat().map(card => card.playerId).sort()).toEqual(cards.map(card => card.playerId).sort());
	});

	it.each([3, 4] as const)('removes repeat seasons of one player without breaking an odd-length loop with %i rows', rowCount => {
		const cards = showcase();
		cards[19]!.playerId = cards[17]!.playerId;
		const rows = arrangeHomeWall(cards, rowCount);
		expectDifferentBorders(rows);
		expect(rows.some(row => row.length % 2 === 1)).toBe(true);
		const players = rows.flat().map(card => card.playerId);
		expect(players.sort()).toEqual([...new Set(cards.map(card => card.playerId))].sort());
	});

	it('does not repeat one player in different era palettes', () => {
		const cards = showcase();
		cards[4]!.playerId = cards[0]!.playerId;
		const rows = arrangeHomeWall(cards, 4);
		expectDifferentBorders(rows);
		expect(rows.flat().filter(card => card.playerId === cards[0]!.playerId).map(card => card.seasonId))
			.toEqual([cards[0]!.seasonId]);
	});

	it('omits impossible single-era rows rather than joining matching card borders', () => {
		const cards = showcase().filter(card => card.model.era === '1950s');
		expect(arrangeHomeWall(cards, 4)).toEqual([[], [], [], []]);
		expect(arrangeHomeWall([], 3)).toEqual([[], [], []]);
	});
});
