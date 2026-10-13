import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEASON_GRADES } from '../game/grade.ts';
import { parsePhraseTable } from './phrase-table.ts';
import { LEAN_WINS, pickSeasonPhrase, SEASON_PHRASES, type SeasonPhrase } from './phrases.ts';

const header = '| phrase | band | context | publication | date | page | headline | author | url | verified | notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
const row = (cells: Partial<Record<'phrase' | 'band' | 'date' | 'url' | 'verified' | 'notes', string>>) =>
	`| ${cells.phrase ?? 'a solid club'} | ${cells.band ?? 'B'} | was a solid club | Daily Star | ${cells.date ?? '1950-09-30'} | 12 | Season Ends |  | ${cells.url ?? '[Source](https://example.org/page)'} | ${cells.verified ?? 'yes'} | ${cells.notes ?? 'Unchanged.'} |\n`;

describe('phrase table import', () => {
	it('keeps only verified, dated, linked rows and says why the rest were dropped', () => {
		const table = parsePhraseTable(header
			+ row({})
			+ row({ phrase: 'hearsay', verified: 'secondhand' })
			+ row({ phrase: 'undated', date: 'September 1950' })
			+ row({ phrase: 'unlinked', url: 'http://example.org/page' })
			+ row({ phrase: 'stray', band: 'E' })
			+ '\n## Unverified\n\n' + header + row({ phrase: 'never imported' }));
		expect(table.phrases.map(phrase => phrase.phrase)).toEqual(['a solid club']);
		expect(table.phrases[0]).toMatchObject({ grades: ['B'], url: 'https://example.org/page', page: '12', author: null, lean: null });
		expect(table.rejected.map(item => item.reason)).toEqual(['not verified (secondhand)', 'date September 1950 is not YYYY-MM-DD', 'no https source link', 'unknown band E']);
	});

	it('maps the paired research bands onto both grades', () => {
		const [phrase] = parsePhraseTable(header + row({ band: 'S+ / S', notes: 'Headline; overperformance.' })).phrases;
		expect(phrase.grades).toEqual(['S+', 'S']);
		expect(phrase.lean).toBe('over');
	});

	it('ships the checked-in data exactly as the research table imports it', () => {
		// A hand edit to the JSON, or a research refresh without re-running the import, fails here.
		expect(parsePhraseTable(readFileSync('research/season-phrases.md', 'utf8')).phrases).toEqual(SEASON_PHRASES);
		for (const grade of SEASON_GRADES) expect(SEASON_PHRASES.some(phrase => phrase.grades.includes(grade)), grade).toBe(true);
	});
});

describe('picking a season phrase', () => {
	const phrase = (text: string, lean: SeasonPhrase['lean'], grades: SeasonPhrase['grades'] = ['B']): SeasonPhrase =>
		({ phrase: text, grades, context: text, publication: 'Daily Star', date: '1950-09-30', page: null, headline: null, author: null, url: 'https://example.org', lean });
	const phrases = [phrase('solid', null), phrase('steady', null), phrase('surprise', 'over'), phrase('letdown', 'under'), phrase('juggernaut', null, ['S'])];

	it('reads the grade band, leaning by how far the season beat or missed its draft', () => {
		expect(pickSeasonPhrase('B', LEAN_WINS, 1, phrases)?.phrase).toBe('surprise');
		expect(pickSeasonPhrase('B', -LEAN_WINS, 1, phrases)?.phrase).toBe('letdown');
		// Inside the margin, or with no draft estimate, the season gets a phrase that judges nothing.
		for (const luck of [LEAN_WINS - 1, -(LEAN_WINS - 1), null]) expect(['solid', 'steady']).toContain(pickSeasonPhrase('B', luck, 1, phrases)?.phrase);
		// A band without a leaning phrase falls back to the whole band rather than printing nothing.
		expect(pickSeasonPhrase('S', 20, 1, phrases)?.phrase).toBe('juggernaut');
		expect(pickSeasonPhrase('F', 0, 1, phrases)).toBeNull();
	});

	it('prints the same phrase for the same season and varies it across seasons', () => {
		expect(pickSeasonPhrase('B', 0, 42)).toEqual(pickSeasonPhrase('B', 0, 42));
		const seen = new Set(Array.from({ length: 40 }, (_, seed) => pickSeasonPhrase('B', 0, seed)?.phrase));
		expect(seen.size).toBeGreaterThan(10);
	});
});
