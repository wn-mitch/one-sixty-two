import { describe, expect, it } from 'vitest';
import { teamRanks } from './team-ranks.ts';

describe('teamRanks', () => {
	it('uses competition ranks and marks tied best and tied worst values', () => {
		const ranks = teamRanks([
			{ id: 'a', value: 9 },
			{ id: 'b', value: 9 },
			{ id: 'c', value: 4 },
			{ id: 'd', value: 4 }
		], 'higher');
		expect(ranks.get('a')).toEqual({ rank: 1, total: 4, ties: 2, best: true, worst: false });
		expect(ranks.get('b')).toEqual({ rank: 1, total: 4, ties: 2, best: true, worst: false });
		expect(ranks.get('c')).toEqual({ rank: 3, total: 4, ties: 2, best: false, worst: true });
		expect(ranks.get('d')).toEqual({ rank: 3, total: 4, ties: 2, best: false, worst: true });
	});

	it('supports lower-is-better metrics without reversing tie semantics', () => {
		const ranks = teamRanks([
			{ id: 'a', value: 2 },
			{ id: 'b', value: 3 },
			{ id: 'c', value: 3 },
			{ id: 'd', value: 8 }
		], 'lower');
		expect(ranks.get('a')).toMatchObject({ rank: 1, best: true, worst: false });
		expect(ranks.get('b')).toMatchObject({ rank: 2, ties: 2, best: false, worst: false });
		expect(ranks.get('c')).toMatchObject({ rank: 2, ties: 2, best: false, worst: false });
		expect(ranks.get('d')).toMatchObject({ rank: 4, best: false, worst: true });
	});

	it('excludes missing and nonfinite values and suppresses one-value comparisons', () => {
		const ranks = teamRanks([
			{ id: 'valid', value: 2 },
			{ id: 'missing', value: null },
			{ id: 'nan', value: Number.NaN },
			{ id: 'infinite', value: Number.POSITIVE_INFINITY }
		], 'higher');
		expect([...ranks.entries()]).toEqual([
			['valid', null],
			['missing', null],
			['nan', null],
			['infinite', null]
		]);
	});

	it('makes all-equal cohorts tied first without also marking them worst', () => {
		const ranks = teamRanks([
			{ id: 'a', value: 0 },
			{ id: 'b', value: -0 },
			{ id: 'c', value: 0 }
		], 'higher');
		for (const rank of ranks.values()) {
			expect(rank).toEqual({ rank: 1, total: 3, ties: 3, best: true, worst: false });
		}
	});

	it('compares unrounded values that collide when displayed', () => {
		const ranks = teamRanks([
			{ id: 'a', value: 0.3334 },
			{ id: 'b', value: 0.3333 }
		], 'higher');
		expect(ranks.get('a')).toMatchObject({ rank: 1, best: true });
		expect(ranks.get('b')).toMatchObject({ rank: 2, worst: true });
	});
});
