import type { SeasonGrade } from '../game/grade.ts';
import data from './season-phrases.json' with { type: 'json' };

/** Whether a phrase judged its club above or below what was expected of it. */
export type PhraseLean = 'over' | 'under';

/** A real newspaper phrase about a team's season, with the printing it was copied from. */
export interface SeasonPhrase {
	phrase: string;
	/** Season grades whose tone the phrase fits. */
	grades: SeasonGrade[];
	/** The surrounding words as printed. */
	context: string;
	publication: string;
	/** Issue date, YYYY-MM-DD. */
	date: string;
	page: string | null;
	headline: string | null;
	author: string | null;
	url: string;
	lean: PhraseLean | null;
}

export const SEASON_PHRASES: readonly SeasonPhrase[] = data as SeasonPhrase[];

/** Wins above or below the draft's expectation at which a season reads as over- or underachieving. */
export const LEAN_WINS = 6;

/**
 * The phrase a finished season prints. The grade picks the band. A season that beat or missed its
 * draft's expected wins by `LEAN_WINS` or more prefers phrases about overachieving or falling
 * short; an expected season prefers phrases that make no such judgement. The season seed picks
 * within the band, so a replay prints the same phrase.
 */
export function pickSeasonPhrase(grade: SeasonGrade, luck: number | null, seed: number, phrases: readonly SeasonPhrase[] = SEASON_PHRASES): SeasonPhrase | null {
	const band = phrases.filter(phrase => phrase.grades.includes(grade));
	const lean: PhraseLean | null = luck === null ? null : luck >= LEAN_WINS ? 'over' : luck <= -LEAN_WINS ? 'under' : null;
	const preferred = band.filter(phrase => phrase.lean === lean);
	const pool = preferred.length ? preferred : band;
	if (!pool.length) return null;
	return pool[mix(seed) % pool.length];
}

/** Spreads neighbouring seeds across the band (a 32-bit integer hash). */
function mix(seed: number): number {
	let value = (seed >>> 0) ^ 0x9e3779b9;
	value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
	value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
	return (value ^ (value >>> 16)) >>> 0;
}
