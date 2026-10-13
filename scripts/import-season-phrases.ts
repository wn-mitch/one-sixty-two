import { readFile, writeFile } from 'node:fs/promises';
import { SEASON_GRADES } from '../src/lib/game/grade.ts';
import { parsePhraseTable } from '../src/lib/news/phrase-table.ts';

/**
 * Regenerates `src/lib/news/season-phrases.json` from the cited research table
 * (`research/season-phrases.md` by default). Rows that fail verification are listed and left out;
 * the import fails if any grade would be left without a phrase.
 */
const source = process.argv[2] ?? 'research/season-phrases.md';
const target = 'src/lib/news/season-phrases.json';
const { phrases, rejected } = parsePhraseTable(await readFile(source, 'utf8'));
for (const { line, reason } of rejected) console.warn(`${source}:${line}: skipped, ${reason}`);
const grades = SEASON_GRADES;
const counts = Object.fromEntries(grades.map(grade => [grade, phrases.filter(phrase => phrase.grades.includes(grade)).length]));
const empty = grades.filter(grade => !counts[grade]);
if (empty.length) throw new Error(`No phrases for ${empty.join(', ')}`);
await writeFile(target, `${JSON.stringify(phrases, null, '\t')}\n`);
const leans = { over: phrases.filter(phrase => phrase.lean === 'over').length, under: phrases.filter(phrase => phrase.lean === 'under').length };
console.log(JSON.stringify({ phrases: phrases.length, rejected: rejected.length, perGrade: counts, leans }));
