import type { SeasonGrade } from '../game/grade.ts';

/** One step of a sticker ladder: the threshold `at`, its kind and its printing. Ladders run lowest first. */
export interface LadderStep { kind: string; at: number; label: [string, string]; title: string }

const counting = (prefix: string, values: readonly number[], unit: string, title: (value: number) => string): LadderStep[] =>
 values.map(at => ({ kind: `${prefix}-${at}`, at, label: [String(at), unit], title: title(at) }));
const runs = (value: number) => value.toFixed(2);
/** A count of single-game feats in one season: the first step names the feat, later steps print the count. */
const feats = (kind: string, values: readonly number[], first: [string, string], plural: string, title: (count: number) => string): LadderStep[] =>
 values.map((at, index) => ({ kind: index ? `${kind}-${at}` : kind, at, label: index ? [`${at}×`, plural] : first, title: title(at) }));
const times = (count: number) => (['', 'one', 'two', 'three', 'four', 'five'][count] ?? String(count));

/** Grade sticker kinds, best first; a card shows the best grade it has earned. */
export const GRADE_STICKERS: readonly { grade: SeasonGrade; kind: string }[] = [
 { grade: 'Perfect', kind: 'grade-perfect' }, { grade: 'S+', kind: 'grade-s-plus' }, { grade: 'S', kind: 'grade-s' },
 { grade: 'AA', kind: 'grade-aa' }, { grade: 'A', kind: 'grade-a' }, { grade: 'B', kind: 'grade-b' },
 { grade: 'C', kind: 'grade-c' }, { grade: 'D', kind: 'grade-d' }, { grade: 'F', kind: 'grade-f' }
];

/** Team-record win thresholds, lowest first: every 20 to 120, then 130, 140, and every 5 to 160; 162–0 tops them as `perfect`. */
export const TEAM_WIN_STICKERS: readonly number[] = [20, 40, 60, 80, 100, 120, 130, 140, 145, 150, 155, 160];

export const POWER_STICKERS = counting('hr', [20, 30, 40, 50, 60, 70], 'HR', value => `${value} home runs`);
export const CONTACT_STICKERS = counting('hits', [150, 175, 200, 225, 250], 'hits', value => `${value} hits`);
export const PRODUCTION_STICKERS = counting('rbi', [100, 115, 130, 145, 160], 'RBI', value => `${value} runs batted in`);
export const SPEED_STICKERS = counting('sb', [20, 30, 40, 50, 75, 100], 'SB', value => `${value} stolen bases`);
export const STRIKEOUT_STICKERS = counting('k', [200, 300, 400, 500, 600], 'K', value => `${value} strikeouts`);
/** On-base percentage over a qualifying season. */
export const EYE_STICKERS: readonly LadderStep[] = [350, 400, 450, 500].map(at => ({
 kind: `obp-${at}`, at: at / 1000, label: [`.${at}`, 'OBP'], title: `A .${at} on-base percentage over a qualifying season`
}));
/** Home runs and stolen bases both at `at` or more in one season. */
export const CLUB_STICKERS: readonly LadderStep[] = [30, 40, 50].map(at => ({
 kind: `club-${at}`, at, label: [`${at}–${at}`, 'club'], title: `${at} home runs and ${at} stolen bases in one season`
}));
/** Runs allowed per nine under `at`, over a qualifying season; lower is a higher tier. */
export const ACE_STICKERS: readonly LadderStep[] = [3, 2.5, 2, 1.5, 1].map(at => ({
 kind: at === 2.5 ? 'ace' : `ace-${Math.round(at * 100)}`, at, label: ['Sub', runs(at)], title: `Under ${runs(at)} runs allowed per nine over a qualifying season`
}));
/** A closer under 2.00 runs allowed per nine over 30 innings. */
export const CLOSER_STICKERS: readonly LadderStep[] = [
 { kind: 'closer', at: 2, label: ['Lights', 'out'], title: 'A closer under 2.00 runs allowed per nine over 30 innings' }
];
export const SAVE_STICKERS = counting('saves', [30, 40, 50], 'saves', value => `${value} saves`);
/** Save opportunities a closer must have to be perfect: about a full closer's season of chances. */
export const PERFECT_CLOSER_OPPORTUNITIES = 20;
export const PERFECT_CLOSER_STICKERS: readonly LadderStep[] = [
 { kind: 'perfect-closer', at: PERFECT_CLOSER_OPPORTUNITIES, label: ['Perfect', 'closer'], title: `No blown saves in at least ${PERFECT_CLOSER_OPPORTUNITIES} save opportunities` }
];
export const CYCLE_STICKERS = feats('cycle', [1, 2], ['Cycle', '1B 2B 3B HR'], 'cycles', count => count === 1 ? 'Hit for the cycle' : `Hit for the cycle ${times(count)} times in a season`);
/** Games with three or more home runs; the top step is a four-homer game. */
export const HOMER_GAME_STICKERS: readonly LadderStep[] = [
 { kind: 'hr-game-3', at: 3, label: ['3 HR', 'game'], title: 'Three home runs in one game' },
 { kind: 'hr-game-4', at: 4, label: ['4 HR', 'game'], title: 'Four home runs in one game' }
];
export const GRAND_SLAM_STICKERS = feats('grand-slam', [1, 2, 3], ['Grand', 'slam'], 'slams', count => count === 1 ? 'Hit a grand slam' : `Hit ${times(count)} grand slams in a season`);
export const WALK_OFF_STICKERS = feats('walk-off', [1, 2, 3], ['Walk', 'off HR'], 'walk-off', count => count === 1 ? 'Hit a walk-off home run' : `Hit ${times(count)} walk-off home runs in a season`);
export const NO_HITTER_STICKERS = feats('no-hitter', [1, 2, 3], ['No', 'hitter'], 'no-hit', count => count === 1 ? 'Threw a complete-game no-hitter' : `Threw ${times(count)} complete-game no-hitters in a season`);
export const PERFECT_GAME_STICKERS = feats('perfect-game', [1, 2], ['1×', 'perfect'], 'perfect', count => count === 1 ? 'Threw a perfect game' : `Threw ${times(count)} perfect games in a season`);
export const SHUTOUT_STICKERS = feats('shutout', [1, 3, 5], ['Shut', 'out'], 'shutouts', count => count === 1 ? 'Threw a complete-game shutout' : `Threw ${times(count)} complete-game shutouts in a season`);
export const STRIKEOUT_GAME_STICKERS: readonly LadderStep[] = [
 { kind: 'k-game-20', at: 1, label: ['20 K', 'game'], title: 'Struck out 20 in one game' }
];
/** Times-drafted thresholds; the database awards these from its rostering history. */
export const LOYALTY_STICKERS: readonly LadderStep[] = [3, 5, 10, 25, 50, 100].map(at => ({
 kind: `drafted-${at}`, at, label: [`${at}×`, 'drafted'], title: `Drafted onto ${at} of your teams`
}));
