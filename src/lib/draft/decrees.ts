import { randomStream, shuffle } from '../game/random.ts';
import { LEAGUE_CHAPTERS, SEGMENTS_PER_CHAPTER, STANDARD_RULES, type GameRules } from '../sim/league-types.ts';

/**
 * The commissioner's decrees: one changes the rules of every game for a 27-game chapter, then the
 * next replaces it. The run seed draws a calendar of six without repeats from the decrees the
 * engine supports; the opening decree is shown before drafting and each later one at its chapter
 * market, before any spending. The rest of the calendar stays hidden.
 */
export interface Decree {
 id: string;
 name: string;
 /** Mad Fred's memorandum. */
 memo: string;
 /** The rule in plain terms. */
 rule: string;
 rules: Readonly<GameRules>;
}

export const COMMISSIONER = 'Mad Fred';

const decree = (id: string, name: string, memo: string, rule: string, change: Partial<GameRules>): Decree => ({ id, name, memo, rule, rules: { ...STANDARD_RULES, ...change } });

export const DECREES: readonly Decree[] = [
 decree('last-call', 'Last Call', 'Beer sales have become intolerable. Regulation games now end after seven innings.', 'Seven-inning games; a tie goes to extra innings. Setup men and closers move up two innings.', { innings: 7 }),
 decree('overtime-mandate', 'Overtime Mandate', 'Our broadcast partners have paid for more baseball. They will receive it.', 'Twelve-inning games; a tie goes to extra innings. Setup men and closers wait for the 10th to 12th.', { innings: 12 }),
 decree('four-out', 'Four-Out Baseball', 'Three outs were found insufficient. A fourth has been added at no cost to the clubs.', 'Four outs per half inning.', { outs: 4 }),
 decree('two-out', 'Two-Out Express', 'To improve pace of play, the third out has been retired.', 'Two outs per half inning.', { outs: 2 }),
 decree('singles', 'Singles Appreciation Night', 'No one likes a stolen heart.', 'Every hit, home runs included, is a single: the batter takes first and each runner moves up exactly one base, as on an error. No steals.', { singlesOnly: true }),
 decree('no-free-passes', 'No Free Passes', 'Nothing in this league is free. A walk will now cost the defense double.', 'A walk or hit batter takes second, and every runner moves up two bases.', { freePassTwo: true }),
 decree('double-jeopardy', 'Double Jeopardy', 'A club that hits into a double play has had enough for one inning.', 'A double play ends the half inning, and no run scores on it.', { doublePlayEnds: true }),
 decree('everybody-tags', 'Everybody Tags', 'In the interest of fairness, every runner may now tag up.', 'A caught fly to the outfield that is not the last out moves every runner up a base; a runner on third scores. Infield pop-ups move nobody.', { everybodyTags: true })
];

/** The run's six decrees in chapter order, the first being the opening decree. */
export function decreeCalendar(seed: number): Decree[] {
 return shuffle([...DECREES], randomStream(seed, 'draft:decrees')).slice(0, LEAGUE_CHAPTERS);
}

/** The decree in force for chapter `chapter` (0-5). */
export const decreeAt = (seed: number, chapter: number): Decree => decreeCalendar(seed)[chapter];

/** The decree in force for league segment `segment` (0-17). */
export const segmentDecree = (seed: number, segment: number): Decree => decreeAt(seed, Math.floor(segment / SEGMENTS_PER_CHAPTER));
