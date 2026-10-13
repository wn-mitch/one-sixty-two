import type { SeasonGrade } from '../game/grade.ts';
import type { PhraseLean, SeasonPhrase } from './phrases.ts';

/** The research table's band labels and the season grades each one describes. */
const BANDS: Record<string, readonly SeasonGrade[]> = {
	Perfect: ['Perfect'],
	'S+ / S': ['S+', 'S'],
	'AA / A': ['AA', 'A'],
	B: ['B'],
	C: ['C'],
	D: ['D'],
	F: ['F']
};
const COLUMNS = ['phrase', 'band', 'context', 'publication', 'date', 'page', 'headline', 'author', 'url', 'verified', 'notes'] as const;

/** Reads the notes' judgement of a club against its expectations; most phrases make none. */
export function leanFromNotes(notes: string): PhraseLean | null {
	if (/overperform|overachiev|surpass|exceed|outperform|surpris/i.test(notes)) return 'over';
	if (/underperform|underachiev|fell short|short of expectations|below expectations|failed promise/i.test(notes)) return 'under';
	return null;
}

export interface PhraseTable { phrases: SeasonPhrase[]; rejected: { line: number; reason: string }[] }

/**
 * Parses the main table of `research/season-phrases.md`. Only verified rows with a known band, an
 * ISO date and an https source survive; every other row is reported with its line and reason, so
 * a research refresh cannot silently ship an uncited phrase. The "Unverified" section is ignored.
 */
export function parsePhraseTable(markdown: string): PhraseTable {
	const phrases: SeasonPhrase[] = [];
	const rejected: PhraseTable['rejected'] = [];
	const lines = markdown.split('\n');
	const end = lines.findIndex(line => /^##\s+Unverified/i.test(line));
	let header = false;
	lines.slice(0, end < 0 ? undefined : end).forEach((line, index) => {
		if (!line.startsWith('| ')) return;
		const cells = line.slice(2, line.endsWith(' |') ? -2 : undefined).split(' | ').map(cell => cell.trim());
		if (cells[0] === 'phrase') { header = true; return; }
		if (!header || /^-+$/.test(cells[0])) return;
		const reject = (reason: string) => rejected.push({ line: index + 1, reason });
		if (cells.length !== COLUMNS.length) return reject(`expected ${COLUMNS.length} columns, found ${cells.length}`);
		const row = Object.fromEntries(COLUMNS.map((column, at) => [column, cells[at]])) as Record<(typeof COLUMNS)[number], string>;
		const grades = BANDS[row.band];
		const url = row.url.match(/\]\((https:\/\/[^)\s]+)\)/)?.[1] ?? (/^https:\/\/\S+$/.test(row.url) ? row.url : null);
		if (!row.phrase) return reject('empty phrase');
		if (!grades) return reject(`unknown band ${row.band}`);
		if (row.verified !== 'yes') return reject(`not verified (${row.verified})`);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return reject(`date ${row.date} is not YYYY-MM-DD`);
		if (!url) return reject('no https source link');
		phrases.push({
			phrase: row.phrase, grades: [...grades], context: row.context, publication: row.publication, date: row.date,
			page: row.page || null, headline: row.headline || null, author: row.author || null, url, lean: leanFromNotes(row.notes)
		});
	});
	return { phrases, rejected };
}
