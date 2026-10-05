import type { Profile } from '../game/types.ts';
import type { PitcherLine, TeamInput } from './types.ts';

export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
export function starterBudget(profile: Profile): number {
 const counts = profile.pitching;
 if (!counts || counts.GS <= 0) throw new Error('Starter requires positive starts');
 return Math.round(clamp(counts.IPouts / counts.GS, 12, 24));
}
export function closerBudget(profile: Profile): number {
 if (!profile.pitching || profile.teamGames <= 0) throw new Error('Closer requires pitching workload');
 return Math.floor(profile.pitching.IPouts * 162 / profile.teamGames);
}
export interface Workload {
 current: number; starterDone: boolean; closerUsed: boolean; budget: number;
}
export function createWorkload(team: TeamInput): Workload {
 return { current: team.starterIndex, starterDone: false, closerUsed: false, budget: starterBudget(team.pitchers[team.starterIndex]) };
}
export function beginHalf(team: TeamInput, lines: PitcherLine[], state: Workload, inning: number, lead: number): void {
 if (lines[team.starterIndex].R >= 6 || lines[team.starterIndex].outs >= state.budget) state.starterDone = true;
 state.current = state.starterDone ? team.bullpenIndex : team.starterIndex;
 if (inning >= 9 && lead >= 0 && lead <= 3 && !state.closerUsed && team.closerAvailable && team.closerOutsRemaining >= 3) {
  state.current = team.closerIndex;
  state.starterDone = true;
  state.closerUsed = true;
 }
}
export function beforePlateAppearance(team: TeamInput, lines: PitcherLine[], state: Workload): void {
 if (state.current === team.starterIndex && lines[state.current].outs >= state.budget) {
  state.starterDone = true;
  state.current = team.bullpenIndex;
 }
}
export interface CloserUsage { outs: number; last: number; previous: number }
export function closerReady(usage: CloserUsage, game: number, cap: number): boolean {
 return cap - usage.outs >= 3 && !(usage.last === game - 1 && usage.previous === game - 2);
}
export function recordCloser(usage: CloserUsage, game: number, outs: number, appeared: boolean): void {
 usage.outs += outs;
 if (appeared) { usage.previous = usage.last; usage.last = game; }
}
