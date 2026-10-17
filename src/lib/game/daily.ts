import { randomStream, streamSeed } from './random.ts';
import { compareId, type Manifest } from './types.ts';
import type { StadiumSummary } from '../sim/park-types.ts';

/**
 * The daily run: one seed and one home stadium per calendar day, the same for every player. The day
 * turns over at midnight in New York, daylight saving included, so one daily is live worldwide at a time.
 */
const DAILY_ZONE = 'America/New_York';
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateParts = new Intl.DateTimeFormat('en-US', {
 timeZone: DAILY_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
});

/** New York wall-clock fields of an instant. */
function wallClock(at: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
 const parts = Object.fromEntries(dateParts.formatToParts(at).map(part => [part.type, Number(part.value)]));
 return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The daily live at `now`, as `YYYY-MM-DD`. */
export function dailyDate(now = new Date()): string {
 const { year, month, day } = wallClock(now);
 return `${year}-${pad(month)}-${pad(day)}`;
}

/** A real calendar date in `YYYY-MM-DD` form. */
export function isDailyDate(value: unknown): value is string {
 if (typeof value !== 'string') return false;
 const match = DATE.exec(value);
 if (!match) return false;
 const [year, month, day] = match.slice(1).map(Number);
 const date = new Date(Date.UTC(year, month - 1, day));
 return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The draft seed every player gets on `date`. */
export function dailySeed(date: string): number {
 if (!isDailyDate(date)) throw new Error('Invalid daily date');
 return streamSeed(0, `daily:${date}`);
}

/** The home stadium every player gets on `date`, drawn from the whole deck in a fixed order. */
export function dailyStadium(date: string, manifest: Pick<Manifest, 'stadiums'>): StadiumSummary {
 if (!manifest.stadiums.length) throw new Error('The stadium deck is empty');
 const deck = [...manifest.stadiums].sort((a, b) => compareId(a.ref.id, b.ref.id));
 return deck[Math.floor(randomStream(dailySeed(date), 'daily-stadium')() * deck.length)];
}

/** Milliseconds New York's wall clock is ahead of UTC at `at` (negative in the Americas). */
function zoneOffset(at: Date): number {
 const { year, month, day, hour, minute, second } = wallClock(at);
 return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant the next daily goes live. */
export function nextDailyAt(now = new Date()): Date {
 const { year, month, day } = wallClock(now);
 const midnight = Date.UTC(year, month - 1, day + 1);
 // The offset at `now` can differ from the one at midnight across a daylight-saving change; one refinement settles it.
 const guess = midnight - zoneOffset(now);
 return new Date(midnight - zoneOffset(new Date(guess)));
}

/** A daily's date for display, such as `Oct 17`. */
export function dailyLabel(date: string): string {
 const [year, month, day] = date.split('-').map(Number);
 return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Time left until `at`, such as `6h 12m` or `45s`. */
export function countdown(at: Date, now = new Date()): string {
 const seconds = Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000));
 const hours = Math.floor(seconds / 3600);
 const minutes = Math.floor(seconds % 3600 / 60);
 if (hours) return `${hours}h ${minutes}m`;
 if (minutes) return `${minutes}m`;
 return `${seconds}s`;
}
