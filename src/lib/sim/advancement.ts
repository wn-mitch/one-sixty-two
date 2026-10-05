import type { Profile } from '../game/types.ts';
import type { TeamBox } from './types.ts';

/** Numeric base slots retain both runner and responsible pitcher through changes. */
export interface Bases {
 runners: Int16Array; pitchers: Int16Array; offense: TeamBox; defense: TeamBox;
 target: number; winningAdvance: number; ended: boolean;
}
export function createBases(offense: TeamBox, defense: TeamBox): Bases {
 return { runners: new Int16Array(3).fill(-1), pitchers: new Int16Array(3).fill(-1), offense, defense, target: Infinity, winningAdvance: 0, ended: false };
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
/** Lead runners advance first; non-HR walkoffs stop at the winning run. */
export function hit(state: Bases, bases: number, hitter: number, pitcher: number, profiles: Profile[], random: () => number): number {
 if (bases >= 3) {
  for (let base = 2; base >= 0; base--) {
   if (state.runners[base] !== -1 && scoreBase(state, base, bases !== 4)) return Math.min(bases, state.winningAdvance);
  }
  if (bases === 4) score(state, hitter, pitcher, 4, false);
  else { state.runners[2] = hitter; state.pitchers[2] = pitcher; }
 } else if (bases === 2) {
  for (let base = 2; base >= 1; base--) {
   if (state.runners[base] !== -1 && scoreBase(state, base)) return Math.min(bases, state.winningAdvance);
  }
  if (state.runners[0] !== -1) {
   if (random() < 0.35 + 0.40 * profiles[state.runners[0]].speed) {
    if (scoreBase(state, 0)) return Math.min(bases, state.winningAdvance);
   } else move(state, 0, 2);
  }
  state.runners[1] = hitter;
  state.pitchers[1] = pitcher;
 } else {
  if (state.runners[2] !== -1 && scoreBase(state, 2)) return 1;
  if (state.runners[1] !== -1) {
   if (random() < 0.45 + 0.40 * profiles[state.runners[1]].speed) {
    if (scoreBase(state, 1)) return 1;
   } else move(state, 1, 2);
  }
  if (state.runners[0] !== -1) {
   if (state.runners[2] === -1 && random() < 0.15 + 0.35 * profiles[state.runners[0]].speed) move(state, 0, 2);
   else move(state, 0, 1);
  }
  state.runners[0] = hitter;
  state.pitchers[0] = pitcher;
 }
 if (state.offense.runs >= state.target) state.ended = true;
 return bases;
}
export function tagUp(state: Bases): void { scoreBase(state, 2); }
