import { describe, expect, it } from 'vitest';
import { aggregateWarRows } from '../../../scripts/rankings/compile.ts';
import type { CsvRow } from '../../../scripts/data/acquire.ts';

function row(overrides: Partial<CsvRow> = {}): CsvRow {
	return {
		key_bbref: 'source-player', year_ID: '1970', team_ID: 'OLD', stint_ID: '1', lg_ID: 'AL', franch_ID: 'OLD-F',
		pa: '300', innings: '0', bwar162: '2.5', pwar162: 'NA', ...overrides
	};
}

const input = {
	people: [{ playerID: 'lahman-player', bbrefID: 'source-player' }],
	teams: [{ yearID: '1970', lgID: 'AL', teamID: 'OLD', franchID: 'OLD-F' }]
};

describe('WAR source joins', () => {
	it('sums distinct stints but ignores an identical duplicate export', () => {
		const result = aggregateWarRows([
			row(),
			row({ stint_ID: '2', bwar162: '1.25' }),
			row()
		], input);
		expect(result.values.get('lahman-player:1970:AL:OLD')).toEqual({ battingWAR162: 3.75, pitchingWAR162: null });
		expect(result.diagnostics.duplicateRows).toBe(1);
	});
	it('uses the Lahman historical franchise when source labels disagree', () => {
		const result = aggregateWarRows([row({ franch_ID: 'WRONG' })], input);
		expect(result.values.get('lahman-player:1970:AL:OLD')?.battingWAR162).toBe(2.5);
		expect(result.diagnostics.franchiseMismatches).toBe(1);
	});
	it('joins the 1950 boundary and ignores pre-era source rows', () => {
		const result = aggregateWarRows([
			row({ year_ID: '1950' }),
			row({ year_ID: '1949', stint_ID: '2' })
		], {
			people: input.people,
			teams: [{ yearID: '1950', lgID: 'AL', teamID: 'OLD', franchID: 'OLD-F' }]
		});
		expect(result.values.get('lahman-player:1950:AL:OLD')?.battingWAR162).toBe(2.5);
		expect([...result.values.keys()]).not.toContain('lahman-player:1949:AL:OLD');
		expect(result.diagnostics.unmatchedTeams).toBe(0);
	});


	it('keeps negative and zero WAR and treats blanks and NA as unavailable', () => {
		const result = aggregateWarRows([
			row({ bwar162: '-0.5' }),
			row({ stint_ID: '2', bwar162: '0' }),
			row({ stint_ID: '3', bwar162: '' })
		], input);
		expect(result.values.get('lahman-player:1970:AL:OLD')?.battingWAR162).toBeNull();
		const available = aggregateWarRows([row({ bwar162: '-0.5' })], input);
		expect(available.values.get('lahman-player:1970:AL:OLD')?.battingWAR162).toBe(-0.5);
	});

	it('does not mix traded team-seasons or alternate leagues', () => {
		const result = aggregateWarRows([
			row(),
			row({ team_ID: 'TRADE', stint_ID: '1' }),
			row({ lg_ID: 'NL', stint_ID: '1' })
		], input);
		expect([...result.values.keys()]).toEqual(['lahman-player:1970:AL:OLD']);
		// The traded team and the alternate-league row are both unmatched, so
		// neither can contribute to the OLD/AL season.
		expect(result.diagnostics.unmatchedTeams).toBe(2);
	});
});
