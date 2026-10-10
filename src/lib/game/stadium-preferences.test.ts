import { describe, expect, it } from 'vitest';
import { loadStadiumPreferences, orderStadiums, saveStadiumPreferences, STADIUM_PREFERENCES_STORAGE_KEY } from './stadium-preferences.ts';

const park = (id: string, name: string, franchiseId: string) => ({ ref: { id, year: 2025 }, name, franchiseId });
const CLUBS: Record<string, string> = { NYY: 'New York Yankees', BOS: 'Boston Red Sox', CHC: 'Chicago Cubs', CHW: 'Chicago White Sox' };
const club = (id: string) => CLUBS[id] ?? id;
const PARKS = [
	park('yankee', 'Yankee Stadium', 'NYY'),
	park('fenway', 'Fenway Park', 'BOS'),
	park('wrigley', 'Wrigley Field', 'CHC'),
	park('rate', 'Rate Field', 'CHW')
];
const ids = (list: { ref: { id: string } }[]) => list.map(entry => entry.ref.id);

function memory(initial?: string) {
	const values = new Map<string, string>(initial === undefined ? [] : [[STADIUM_PREFERENCES_STORAGE_KEY, initial]]);
	return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
}

describe('stadium deck order', () => {
	it('sorts by park name, or by club name when asked', () => {
		expect(ids(orderStadiums(PARKS, 'stadium', new Set(), club))).toEqual(['fenway', 'rate', 'wrigley', 'yankee']);
		// Club order differs from park order: Cubs (Wrigley) before White Sox (Rate) despite R < W.
		expect(ids(orderStadiums(PARKS, 'team', new Set(), club))).toEqual(['fenway', 'wrigley', 'rate', 'yankee']);
	});

	it('pins favorites first under either sort and keeps the chosen order within each group', () => {
		const favorites = new Set(['yankee', 'rate']);
		expect(ids(orderStadiums(PARKS, 'stadium', favorites, club))).toEqual(['rate', 'yankee', 'fenway', 'wrigley']);
		expect(ids(orderStadiums(PARKS, 'team', favorites, club))).toEqual(['rate', 'yankee', 'fenway', 'wrigley']);
		expect(ids(orderStadiums(PARKS, 'team', new Set(['wrigley']), club))).toEqual(['wrigley', 'fenway', 'rate', 'yankee']);
	});
});

describe('stadium deck preferences', () => {
	it('round-trips sort and favorites', () => {
		const storage = memory();
		expect(saveStadiumPreferences({ sort: 'team', favorites: ['fenway'] }, storage)).toBe(true);
		expect(loadStadiumPreferences(storage)).toEqual({ sort: 'team', favorites: ['fenway'] });
	});

	it('falls back to defaults for missing, malformed or blocked storage', () => {
		expect(loadStadiumPreferences(memory())).toEqual({ sort: 'stadium', favorites: [] });
		expect(loadStadiumPreferences(memory('{not json'))).toEqual({ sort: 'stadium', favorites: [] });
		expect(loadStadiumPreferences(memory('{"sort":"elevation","favorites":["fenway",7]}'))).toEqual({ sort: 'stadium', favorites: ['fenway'] });
		const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
		expect(loadStadiumPreferences(blocked)).toEqual({ sort: 'stadium', favorites: [] });
		expect(saveStadiumPreferences({ sort: 'team', favorites: [] }, blocked)).toBe(false);
		expect(saveStadiumPreferences({ sort: 'team', favorites: [] }, null)).toBe(false);
	});
});
