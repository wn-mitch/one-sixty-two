import { SLOTS } from './types.ts';

/**
 * Season grades from final wins. Bands come from native calibration drafts (`just draft-spread` with
 * the random, best, vorp and packs policies, two guaranteed jackpots plus a one-in-five chance per
 * roll): random picks average about 106 wins and mostly grade F or D; taking the best-looking card
 * for the next slot averages about 136 and mostly grades B; drafting by runs above replacement
 * averages about 142 and mostly grades A, with AA a good pack or season away; well-spent extra
 * packs add about a win and a half; S and S+ need a lucky season on top. Perfect is 162-0, which
 * even the best possible roster reaches about 1 in 400 seasons.
 */
export const SEASON_GRADES = ['Perfect', 'S+', 'S', 'AA', 'A', 'B', 'C', 'D', 'F'] as const;
export type SeasonGrade = (typeof SEASON_GRADES)[number];

/** Lowest win total for each grade, best first. */
const FLOORS: readonly [SeasonGrade, number][] = [
	['Perfect', 162], ['S+', 153], ['S', 149], ['AA', 145], ['A', 139], ['B', 130], ['C', 120], ['D', 110], ['F', 0]
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

/**
 * Logistic fit of mean season wins on a roster's summed card `valueRuns`, from `just draft-spread`
 * over random, casual, runs-above-replacement and extra-pack drafts with jackpots. It lands within
 * about a win of each group's measured mean and puts the best possible roster near 155; refit when
 * card values, jackpot rules or the engine change.
 */
const DRAFT_FIT = { intercept: -0.8824, slope: 0.002391 } as const;

/** Mean wins a full roster earns over many seasons, or null unless every card has a value. */
export function expectedWins(roster: readonly { valueRuns?: number }[]): number | null {
	if (roster.length !== SLOTS.length) return null;
	let total = 0;
	for (const card of roster) {
		if (card.valueRuns === undefined) return null;
		total += card.valueRuns;
	}
	return 162 / (1 + Math.exp(-(DRAFT_FIT.intercept + DRAFT_FIT.slope * total)));
}

/** The grade a roster's expected wins earn. No roster expects to go 162-0, so it tops out at S+. */
export function draftGrade(expected: number): SeasonGrade {
	const wins = Math.min(161, Math.round(expected));
	return FLOORS.find(([, floor]) => wins >= floor)![0];
}
