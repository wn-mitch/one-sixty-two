import type { SeasonMoment, WinPoint } from '../sim/types.ts';

/** Half-inning x positions: plays share their half-inning evenly and the pre-game point sits at the left edge. */
export function tracePositions(trace: readonly Pick<WinPoint, 'half'>[]): number[] {
	const counts = new Map<number, number>();
	for (const point of trace.slice(1)) counts.set(point.half, (counts.get(point.half) ?? 0) + 1);
	const seen = new Map<number, number>();
	return trace.map((point, index) => {
		if (index === 0) return 0;
		const order = (seen.get(point.half) ?? 0) + 1;
		seen.set(point.half, order);
		return point.half + order / counts.get(point.half)!;
	});
}

/** The trace point a moment's play produced, or -1 when the trace does not contain it. */
export function momentIndex(trace: readonly WinPoint[], moment: Pick<SeasonMoment, 'inning' | 'half' | 'winBefore' | 'winAfter'>): number {
	const half = (moment.inning - 1) * 2 + (moment.half === 'bottom' ? 1 : 0);
	return trace.findIndex((point, index) => index > 0 && point.half === half && point.win === moment.winAfter && trace[index - 1].win === moment.winBefore);
}
