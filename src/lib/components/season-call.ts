import type { SeasonMoment, SeasonMomentOutcome } from '../sim/types.ts';

/** Template inputs: B is the batter's surname, P the pitcher's, and runs the scoring tail. */
type Call = (names: { B: string; P: string; runs: string }) => string;

const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
const RUN_WORDS = ['', 'One run scores!', 'Two runs score!', 'Three runs score!', 'Four runs score!'];

const CALLS: Record<SeasonMomentOutcome, readonly Call[]> = {
	homeRun: [
		({ B }) => `${B} swings — and there's a long drive to deep left… it is GONE!`,
		({ B, P }) => `${P} deals, ${B} hits it high, hits it deep… OUTTA HERE!`,
		({ B }) => `${B} turns on one… way back, way back… GOODBYE, baseball!`
	],
	single: [
		({ B, runs }) => `${B} lines one up the middle — base hit! ${runs}`,
		({ B, runs }) => `Ground ball through the hole, and ${B} has a single! ${runs}`
	],
	double: [
		({ B, runs }) => `Into the gap, it'll go to the wall — ${B} cruises into second! ${runs}`,
		({ B, runs }) => `Ripped down the line, fair ball! ${B} with a double! ${runs}`
	],
	triple: [
		({ B, runs }) => `Into the corner, it's rattling around — ${B} is going for three… in standing up! ${runs}`
	],
	walk: [
		({ B, runs }) => `Ball four. ${B} takes his base. ${runs ? `And that forces in a run!` : ''}`,
		({ B, P, runs }) => `${P} can't find the zone, and ${B} draws the walk. ${runs}`
	],
	hitByPitch: [
		({ B, runs }) => `Ooh, that one got him! ${B} is hit by the pitch. ${runs}`
	],
	strikeout: [
		({ B, P }) => `${P} sets, the pitch… swing and a miss! ${B} goes down swinging!`,
		({ B, P }) => `${P} paints the corner — STRUCK HIM OUT! ${B} can only stare.`
	],
	groundedIntoDoublePlay: [
		({ runs }) => `Ground ball, short to second to first — DOUBLE PLAY! ${runs}`
	],
	sacrificeFly: [
		({ B, runs }) => `Fly ball from ${B}, deep enough… the runner tags… and scores! ${runs}`
	],
	out: [
		({ B, runs }) => `${B} hits it in the air… and it's caught. ${runs}`,
		({ B, runs }) => `${B} bounces one to the infield, and they get him at first. ${runs}`
	],
	reachedOnError: [
		({ B, runs }) => `Routine grounder… bobbled! ${B} is safe on the error! ${runs}`
	],
	stolenBase: [
		() => `There goes the runner… the throw… SAFE! Stolen base!`
	],
	caughtStealing: [
		() => `Runner goes, here's the throw… OUT! Caught stealing!`
	]
};

/** A stable small hash, so the same moment always draws the same call. */
function pick<T>(items: readonly T[], moment: SeasonMoment): T {
	let hash = moment.gameNumber * 31 + moment.inning * 7 + moment.outsBefore * 3 + moment.basesBefore;
	for (const char of moment.outcome) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
	return items[hash % items.length];
}

function homeRunName(runs: number): string {
	return runs === 4 ? 'GRAND SLAM!' : runs === 3 ? 'A three-run shot!' : runs === 2 ? 'Two-run homer!' : 'A solo shot!';
}

/**
 * A radio play-by-play call for a season turning point. A walk-off ends the call on the game; a
 * Nick Castellanos home run gets the broadcast booth's most famous interruption.
 */
export function radioCall(moment: SeasonMoment, walkOff: boolean): string {
	const B = surname(moment.batterName);
	const P = surname(moment.pitcherName);
	if (moment.outcome === 'homeRun' && /\bNick Castellanos\b/.test(moment.batterName)) {
		return `…and I just want to take a moment, as a man who tries to do things the right way, to say to everyone listening— and there's a drive into deep left field by Castellanos, that'll be a home run.${walkOff ? ' And that will end the ballgame.' : ''}`;
	}
	const runs = moment.outcome === 'homeRun' ? homeRunName(moment.runsScored) : RUN_WORDS[moment.runsScored] ?? `${moment.runsScored} runs score!`;
	const call = pick(CALLS[moment.outcome], moment)({ B, P, runs }).replace(/\s+/g, ' ').trim();
	const finish = moment.outcome === 'homeRun' ? ` ${runs}` : '';
	return `${call}${finish}${walkOff ? ' And this ballgame is OVER!' : ''}`;
}
