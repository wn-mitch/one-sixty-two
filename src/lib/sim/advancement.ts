import type { TeamBox } from './types.ts';

/** Numeric base slots retain both runner and responsible pitcher through changes. */
export interface Bases {
 runners: Int16Array; pitchers: Int16Array; offense: TeamBox; defense: TeamBox;
 target: number; winningAdvance: number; ended: boolean;
}
export function createBases(offense: TeamBox, defense: TeamBox): Bases {
 return { runners: new Int16Array(3).fill(-1), pitchers: new Int16Array(3).fill(-1), offense, defense, target: Infinity, winningAdvance: 0, ended: false };
}

/** Packs the forced destination mask and any run (bit 3) for a one-base award. */
export function forcedBaseTransition(mask: number): number {
 if ((mask & 1) === 0) return mask | 1;
 if ((mask & 2) === 0) return (mask & 4) | 3;
 if ((mask & 4) === 0) return 7;
 return 7 | 8;
}

export function homeRunRuns(mask: number): number {
 return 1 + (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
}
export function score(state: Bases, runner: number, pitcher: number, advanced: number, stop = true): boolean {
 state.offense.runs++;
 state.offense.batting[runner].R++;
 state.defense.pitching[pitcher].R++;
 if (stop && state.offense.runs >= state.target) {
  state.ended = true;
  state.winningAdvance = advanced;
 }
 return state.ended;
}
function scoreBase(state: Bases, base: number, stop = true): boolean {
 const runner = state.runners[base];
 const pitcher = state.pitchers[base];
 state.runners[base] = -1;
 state.pitchers[base] = -1;
 return score(state, runner, pitcher, 3 - base, stop);
}
function move(state: Bases, from: number, to: number): void {
 state.runners[to] = state.runners[from];
 state.pitchers[to] = state.pitchers[from];
 state.runners[from] = -1;
 state.pitchers[from] = -1;
}
export function force(state: Bases, hitter: number, pitcher: number): void {
 if (state.runners[0] !== -1) {
  if (state.runners[1] !== -1) {
   if (state.runners[2] !== -1 && scoreBase(state, 2)) return;
   move(state, 1, 2);
  }
  move(state, 0, 1);
 }
 state.runners[0] = hitter;
 state.pitchers[0] = pitcher;
}
/** Home runs always score every runner, including all runs after a walkoff threshold. */
export function homeRun(state: Bases, hitter: number, pitcher: number): void {
 for (let base = 2; base >= 0; base--) {
  if (state.runners[base] !== -1) scoreBase(state, base, false);
 }
 score(state, hitter, pitcher, 4, false);
 if (state.offense.runs >= state.target) state.ended = true;
}
