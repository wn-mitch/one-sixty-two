import { describe, expect, it } from 'vitest';
import { gradeRange, seasonGrade } from './grade.ts';

describe('season grade', () => {
	it('places every band boundary on the documented side', () => {
		const cases: [number, string][] = [[162, 'Perfect'], [161, 'S+'], [150, 'S+'], [149, 'S'], [144, 'S'], [143, 'AA'], [136, 'AA'], [135, 'A'], [125, 'A'], [124, 'B'], [110, 'B'], [109, 'C'], [90, 'C'], [89, 'D'], [70, 'D'], [69, 'F'], [0, 'F']];
		for (const [wins, grade] of cases) expect(seasonGrade(wins, 162 - wins), `${wins} wins`).toBe(grade);
	});

	it('grades only complete seasons', () => {
		expect(seasonGrade(100, 61)).toBeNull();
		expect(seasonGrade(81.5, 80.5)).toBeNull();
	});

	it('describes each band as its win range', () => {
		expect(gradeRange('Perfect')).toBe('162-0');
		expect(gradeRange('S+')).toBe('150–161 wins');
		expect(gradeRange('F')).toBe('69 wins or fewer');
	});
});
