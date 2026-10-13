import { describe, expect, it } from 'vitest';
import { draftGrade, expectedWins, gradeRange, seasonGrade } from './grade.ts';
import { SLOTS } from './types.ts';

describe('season grade', () => {
	it('places every band boundary on the documented side', () => {
		const cases: [number, string][] = [[162, 'Perfect'], [161, 'S+'], [153, 'S+'], [152, 'S'], [149, 'S'], [148, 'AA'], [145, 'AA'], [144, 'A'], [139, 'A'], [138, 'B'], [130, 'B'], [129, 'C'], [120, 'C'], [119, 'D'], [110, 'D'], [109, 'F'], [0, 'F']];
		for (const [wins, grade] of cases) expect(seasonGrade(wins, 162 - wins), `${wins} wins`).toBe(grade);
	});

	it('grades only complete seasons', () => {
		expect(seasonGrade(100, 61)).toBeNull();
		expect(seasonGrade(81.5, 80.5)).toBeNull();
	});

	it('describes each band as its win range', () => {
		expect(gradeRange('Perfect')).toBe('162-0');
		expect(gradeRange('S+')).toBe('153–161 wins');
		expect(gradeRange('F')).toBe('109 wins or fewer');
	});
});

describe('draft grade', () => {
	const roster = (valueRuns: number) => SLOTS.map(() => ({ valueRuns }));

	it('maps summed card value to the fitted expected wins', () => {
		// Casual drafts sum about 1,050 runs above replacement and average about 136 wins; the best
		// possible roster sums about 1,645 and averages about 155.
		const casual = roster(1051 / SLOTS.length);
		expect(expectedWins(casual)).toBeCloseTo(135.5, 0);
		const best = roster(1645 / SLOTS.length);
		expect(expectedWins(best)).toBeCloseTo(154.7, 0);
		expect(expectedWins(best)).toBeLessThan(162);
	});

	it('needs a value for every one of the sixteen picks', () => {
		const cards = roster(40);
		expect(expectedWins(cards.slice(1))).toBeNull();
		expect(expectedWins([{}, ...cards.slice(1)])).toBeNull();
	});

	it('rounds expected wins onto the season bands but never awards Perfect', () => {
		expect(draftGrade(138.5)).toBe('A');
		expect(draftGrade(138.4)).toBe('B');
		expect(draftGrade(161.9)).toBe('S+');
	});
});
