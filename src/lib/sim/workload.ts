import type { Profile } from '../game/types.ts';

export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
export function starterBudget(profile: Profile): number {
 const counts = profile.pitching;
 if (!counts || counts.GS <= 0) throw new Error('Starter requires positive starts');
 return Math.round(clamp(counts.IPouts / counts.GS, 12, 24));
}
/** A reliever's source relief outs scaled to 162 games. Draft pricing reads it; the engine sets no relief season cap. */
export function closerBudget(profile: Profile): number {
 if (!profile.pitching || profile.teamGames <= 0) throw new Error('Closer requires pitching workload');
 return Math.floor(profile.pitching.IPouts * 162 / profile.teamGames);
}
