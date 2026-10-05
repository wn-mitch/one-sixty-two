import type { BattingCounts, PitchingCounts } from './types.ts';
/** Baseball innings notation counts remainder outs, not decimal innings. */
export function innings(outs: number): string { return `${Math.floor(outs / 3)}.${outs % 3}`; }
export function average(value: number): string { return value.toFixed(3).replace(/^0\./, '.'); }
export function historicalBatting(counts: BattingCounts): { avg: number; obp: number; slg: number; ops: number } {
 const avg = counts.AB ? counts.H / counts.AB : 0;
 const denominator = counts.AB + counts.BB + counts.HBP + counts.SF;
 const obp = denominator ? (counts.H + counts.BB + counts.HBP) / denominator : 0;
 const slg = counts.AB ? (counts.H + counts.doubles + 2 * counts.triples + 3 * counts.HR) / counts.AB : 0;
 return { avg, obp, slg, ops: obp + slg };
}
export function historicalEra(counts: PitchingCounts): number { return counts.IPouts ? counts.ER * 27 / counts.IPouts : 0; }
