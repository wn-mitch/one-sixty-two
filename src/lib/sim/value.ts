import type { BatterLine, DefensiveRunComponents, PitcherLine } from './types.ts';

export function createDefensiveRunComponents(): DefensiveRunComponents {
 return { hitPrevention: 0, errorAvoidance: 0, doublePlay: 0, outfieldThrowing: 0, catcherThrowing: 0 };
}

export function estimatedHitterWar(line: BatterLine): number {
 return (line.battingRuns + line.stealRuns + line.defensiveRuns + 20 * line.PA / 600) / 10;
}

export function estimatedPitcherWar(line: PitcherLine): number {
 return (line.pitchingRunsAboveNeutral + 20 * line.outs / 600) / 10;
}
