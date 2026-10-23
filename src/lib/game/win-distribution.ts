/** Runs at each win total as `[wins, count]`, in any order. */
export type WinDistribution = readonly (readonly [number, number])[];

/** A stadium's numbers need at least this many runs before a percentile or typical record means anything. */
export const MIN_RUNS = 10;

export const runCount = (distribution: WinDistribution) => distribution.reduce((sum, [, count]) => sum + count, 0);

/**
 * The win total reached by the best `share` of runs, by nearest rank from the top: at least that share of
 * runs won this many or more. `share` 0.5 is the median; 0.1 is the top-10% line. Null with no runs.
 */
export function winsAtShare(distribution: WinDistribution, share: number): number | null {
	const total = runCount(distribution);
	if (!total) return null;
	const rank = Math.max(1, Math.ceil(share * total));
	let seen = 0;
	for (const [wins, count] of [...distribution].sort((a, b) => b[0] - a[0])) {
		seen += count;
		if (seen >= rank) return wins;
	}
	return null;
}

/** Where `wins` places among the runs: ties share the better rank, and `topPercent` is `ceil(100 × rank / total)`. */
export function placeAmong(distribution: WinDistribution, wins: number): { rank: number; total: number; topPercent: number } {
	const better = distribution.reduce((sum, [w, count]) => sum + (w > wins ? count : 0), 0);
	// A run not yet counted is placed among the others for its own view.
	const total = runCount(distribution) + (distribution.some(([w]) => w === wins) ? 0 : 1);
	const rank = 1 + better;
	return { rank, total, topPercent: Math.ceil(100 * rank / total) };
}

/** "Top 7%" in the upper half; below the median a percentage undersells the place, so it reads as a rank. */
export function placeLabel(place: { rank: number; topPercent: number }): string {
	return place.topPercent <= 50 ? `Top ${place.topPercent}%` : `#${place.rank.toLocaleString('en-US')}`;
}
