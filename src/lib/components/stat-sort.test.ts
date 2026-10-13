import { describe, expect, it } from 'vitest';
import type { BatterLine } from '../sim/types.ts';
import { BATTING_COLUMNS, nextSort, sortLines } from './stat-sort.ts';

const line = (seasonId: string, stats: Partial<BatterLine>): BatterLine => ({
	seasonId, playerId: seasonId, displayName: seasonId, position: 'LF', year: 2000,
	PA: 600, AB: 540, H: 150, doubles: 30, triples: 2, HR: 20, BB: 50, HBP: 5, SO: 100, R: 80, RBI: 80, SB: 5, CS: 2, SF: 5,
	battingRuns: 10, stealRuns: 0, defensiveRuns: 0,
	defensiveComponents: {} as BatterLine['defensiveComponents'], fieldingOuts: 0, caughtAdvancing: 0,
	...stats
});
const column = (key: string) => BATTING_COLUMNS.find(item => item.key === key)!;

describe('season totals sorting', () => {
	it('opens a new column best first and flips on a second click', () => {
		expect(nextSort({ key: 'war', direction: 'descending' }, column('so'))).toEqual({ key: 'so', direction: 'ascending' });
		expect(nextSort({ key: 'hr', direction: 'descending' }, column('hr'))).toEqual({ key: 'hr', direction: 'ascending' });
	});

	it('ranks by WAR rather than playing time, keeps ties stable and puts missing rates last', () => {
		const lines = [line('bench', { PA: 0, AB: 0, H: 0, doubles: 0, triples: 0, HR: 0, BB: 0, HBP: 0, SF: 0, battingRuns: 0 }), line('tie-a', {}), line('star', { battingRuns: 60, PA: 500 }), line('tie-b', {})];
		expect(sortLines(lines, column('war'), 'descending').map(item => item.seasonId)).toEqual(['star', 'tie-a', 'tie-b', 'bench']);
		expect(sortLines(lines, column('ops'), 'ascending').map(item => item.seasonId).at(-1)).toBe('bench');
		expect(sortLines(lines, column('ops'), 'descending').map(item => item.seasonId).at(-1)).toBe('bench');
	});

	it('shows the slash line from hits and at bats, not plate appearances', () => {
		// 150 H / 540 AB = .278; walks and sacrifice flies stay out of the average.
		const regular = line('regular', {});
		expect(column('avg').format(regular)).toBe('.278');
		expect(column('obp').format(regular)).toBe('.342');
		expect(column('slg').format(regular)).toBe('.452');
		expect(column('avg').format(line('bench', { AB: 0, H: 0 }))).toBe('–');
	});
});
