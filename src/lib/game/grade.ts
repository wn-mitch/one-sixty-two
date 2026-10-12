/**
 * Season grades from final wins. Bands come from sampled drafts (`just hill-climb` and draft-policy
 * sweeps): A is a strong best-card draft, S needs scarcity-aware drafting, S+ needs that plus a hot
 * season, and Perfect is 162-0, which even the best possible roster reaches about 1 in 270 seasons.
 */
export const SEASON_GRADES = ['Perfect', 'S+', 'S', 'AA', 'A', 'B', 'C', 'D', 'F'] as const;
export type SeasonGrade = (typeof SEASON_GRADES)[number];

/** Lowest win total for each grade, best first. */
const FLOORS: readonly [SeasonGrade, number][] = [
	['Perfect', 162], ['S+', 150], ['S', 144], ['AA', 136], ['A', 125], ['B', 110], ['C', 90], ['D', 70], ['F', 0]
];

/** The grade for a complete 162-game season, or null for any other record. */
export function seasonGrade(wins: number, losses: number): SeasonGrade | null {
	if (!Number.isInteger(wins) || !Number.isInteger(losses) || wins < 0 || losses < 0 || wins + losses !== 162) return null;
	return FLOORS.find(([, floor]) => wins >= floor)![0];
}

/** Win range of a grade, for legends and tooltips. */
export function gradeRange(grade: SeasonGrade): string {
	const index = FLOORS.findIndex(([name]) => name === grade);
	const floor = FLOORS[index][1];
	if (index === 0) return '162-0';
	const ceiling = FLOORS[index - 1][1] - 1;
	return floor === 0 ? `${ceiling} wins or fewer` : `${floor}–${ceiling} wins`;
}
