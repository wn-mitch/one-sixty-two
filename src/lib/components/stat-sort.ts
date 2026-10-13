import { average, innings } from '../game/format.ts';
import type { BatterLine, PitcherLine } from '../sim/types.ts';
import { estimatedHitterWar, estimatedPitcherWar } from '../sim/value.ts';

export type SortDirection = 'ascending' | 'descending';

/** One sortable season-totals column. `better` is the direction a first click sorts, best first. */
export interface StatColumn<T> {
	key: string;
	label: string;
	/** Full name for the sort button's accessible label. */
	title: string;
	value: (line: T) => number | null;
	format: (line: T) => string;
	better: SortDirection;
	className?: string;
}

const ratio = (numerator: number, denominator: number): number | null => denominator > 0 ? numerator / denominator : null;
const battingAverage = (line: BatterLine) => ratio(line.H, line.AB);
const onBase = (line: BatterLine) => ratio(line.H + line.BB + line.HBP, line.AB + line.BB + line.HBP + line.SF);
const slugging = (line: BatterLine) => ratio(line.H + line.doubles + 2 * line.triples + 3 * line.HR, line.AB);
const ops = (line: BatterLine) => {
	const obp = onBase(line);
	const slg = slugging(line);
	return obp === null || slg === null ? null : obp + slg;
};
const ra9 = (line: PitcherLine) => ratio(line.R * 27, line.outs);
const rate = (value: number | null, format: (value: number) => string) => value === null ? '–' : format(value);
const count = <T>(key: string, label: string, title: string, read: (line: T) => number, className?: string): StatColumn<T> =>
	({ key, label, title, value: read, format: line => String(read(line)), better: 'descending', className });

export const BATTING_COLUMNS: readonly StatColumn<BatterLine>[] = [
	{ key: 'war', label: 'WAR', title: 'Estimated WAR', value: estimatedHitterWar, format: line => estimatedHitterWar(line).toFixed(1), better: 'descending', className: 'stat-key' },
	{ key: 'avg', label: 'AVG', title: 'Batting average', value: battingAverage, format: line => rate(battingAverage(line), average), better: 'descending', className: 'stat-key' },
	{ key: 'obp', label: 'OBP', title: 'On-base percentage', value: onBase, format: line => rate(onBase(line), average), better: 'descending' },
	{ key: 'slg', label: 'SLG', title: 'Slugging percentage', value: slugging, format: line => rate(slugging(line), average), better: 'descending' },
	{ key: 'ops', label: 'OPS', title: 'On-base plus slugging', value: ops, format: line => rate(ops(line), average), better: 'descending', className: 'stat-key' },
	count('pa', 'PA', 'Plate appearances', line => line.PA, 'stat-group'),
	count('ab', 'AB', 'At bats', line => line.AB),
	count('h', 'H', 'Hits', line => line.H),
	count('2b', '2B', 'Doubles', line => line.doubles),
	count('3b', '3B', 'Triples', line => line.triples),
	count('hr', 'HR', 'Home runs', line => line.HR, 'stat-key'),
	count('bb', 'BB', 'Walks', line => line.BB, 'stat-group'),
	count('hbp', 'HBP', 'Hit by pitch', line => line.HBP),
	{ ...count<BatterLine>('so', 'SO', 'Strikeouts', line => line.SO), better: 'ascending' },
	count('r', 'R', 'Runs', line => line.R, 'stat-group'),
	count('rbi', 'RBI', 'Runs batted in', line => line.RBI, 'stat-key'),
	count('sb', 'SB', 'Stolen bases', line => line.SB, 'stat-group'),
	{ ...count<BatterLine>('cs', 'CS', 'Caught stealing', line => line.CS), better: 'ascending' },
	count('sf', 'SF', 'Sacrifice flies', line => line.SF)
];

export const PITCHING_COLUMNS: readonly StatColumn<PitcherLine>[] = [
	{ key: 'war', label: 'WAR', title: 'Estimated WAR', value: estimatedPitcherWar, format: line => estimatedPitcherWar(line).toFixed(1), better: 'descending', className: 'stat-key' },
	{ key: 'ip', label: 'IP', title: 'Innings pitched', value: line => line.outs, format: line => innings(line.outs), better: 'descending', className: 'stat-group' },
	{ ...count<PitcherLine>('h', 'H', 'Hits allowed', line => line.H), better: 'ascending' },
	{ ...count<PitcherLine>('bb', 'BB', 'Walks allowed', line => line.BB), better: 'ascending' },
	{ ...count<PitcherLine>('hbp', 'HBP', 'Batters hit', line => line.HBP), better: 'ascending' },
	count('so', 'SO', 'Strikeouts', line => line.SO),
	{ ...count<PitcherLine>('r', 'R', 'Runs allowed', line => line.R, 'stat-group'), better: 'ascending' },
	{ key: 'ra9', label: 'RA9', title: 'Runs allowed per nine', value: ra9, format: line => rate(ra9(line), value => value.toFixed(2)), better: 'ascending', className: 'stat-key' },
	count('starts', 'Starts', 'Starts', line => line.starts, 'stat-group'),
	count('app', 'App.', 'Appearances', line => line.appearances)
];

/** Lines ordered by one column; ties and missing values keep their original order, missing values last. */
export function sortLines<T>(lines: readonly T[], column: StatColumn<T>, direction: SortDirection): T[] {
	const sign = direction === 'ascending' ? 1 : -1;
	return lines
		.map((line, index) => ({ line, index, value: column.value(line) }))
		.sort((a, b) => {
			if (a.value === null || b.value === null) return (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) || a.index - b.index;
			return (a.value - b.value) * sign || a.index - b.index;
		})
		.map(entry => entry.line);
}

/** The next sort after a header click: a new column starts best first, the same column flips. */
export function nextSort<T>(current: { key: string; direction: SortDirection }, column: StatColumn<T>): { key: string; direction: SortDirection } {
	if (current.key !== column.key) return { key: column.key, direction: column.better };
	return { key: column.key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
}
