import type { TeamRank } from './results-types.ts';

export type RankDirection = 'higher' | 'lower';
export interface TeamRankValue { id: string; value: number | null }

/**
 * Competition ranks over exact, unrounded values. Invalid entries and cohorts
 * too small to compare deliberately receive no rank.
 */
export function teamRanks(
	values: readonly TeamRankValue[],
	direction: RankDirection
): Map<string, TeamRank | null> {
	const result = new Map<string, TeamRank | null>(values.map(({ id }) => [id, null]));
	const valid = values.filter((entry): entry is { id: string; value: number } =>
		typeof entry.value === 'number' && Number.isFinite(entry.value)
	);
	if (valid.length < 2) return result;

	const distinct = new Set(valid.map(entry => entry.value)).size > 1;
	for (const entry of valid) {
		let better = 0;
		let ties = 0;
		let worse = 0;
		for (const candidate of valid) {
			if (candidate.value === entry.value) {
				ties++;
			} else if (direction === 'higher'
				? candidate.value > entry.value
				: candidate.value < entry.value) {
				better++;
			} else {
				worse++;
			}
		}
		result.set(entry.id, {
			rank: better + 1,
			total: valid.length,
			ties,
			best: better === 0,
			worst: distinct && worse === 0
		});
	}
	return result;
}
