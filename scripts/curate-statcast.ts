import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './data/acquire.ts';

/**
 * One-time curation of the 2025 Statcast batted-ball shape. Downloads regular-season
 * balls in play from Baseball Savant in short date windows (cached under .cache/), then
 * writes the compact aggregate `scripts/data/statcast-2025.json`. Run with --offline to
 * rebuild the aggregate from the cache only.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(ROOT, '.cache/statcast/2025');
const OUTPUT = join(ROOT, 'scripts/data/statcast-2025.json');
const SEASON_START = '2025-03-18';
const SEASON_END = '2025-09-28';
const WINDOW_DAYS = 3;
const QUERY = 'https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&player_type=batter&hfGT=R%7C&hfSea=2025%7C&hfBBT=fly%5C.%5C.ball%7Cground%5C.%5C.ball%7Cline%5C.%5C.drive%7Cpopup%7C';

export const STATCAST_BINS = {
 ev: { min: 35, width: 2.5, count: 36 },
 launch: { min: -40, width: 4, count: 32 },
 spray: { min: -45, width: 5, count: 18 },
 outcomeEv: { min: 40, width: 5, count: 18 },
 outcomeLaunch: { min: -40, width: 5, count: 26 }
} as const;
export const LAUNCH_CLASSES = ['GB', 'LD', 'FB', 'PU'] as const;
export const launchClass = (launch: number): number => launch < 10 ? 0 : launch < 25 ? 1 : launch < 50 ? 2 : 3;
const HITS: Record<string, number> = { single: 0, double: 1, triple: 2, home_run: 3 };
const EXCLUDED = new Set(['sac_bunt', 'sac_bunt_double_play', 'catcher_interf']);

const bin = (value: number, spec: { min: number; width: number; count: number }): number =>
 Math.min(spec.count - 1, Math.max(0, Math.floor((value - spec.min) / spec.width)));

function windows(): [string, string][] {
 const result: [string, string][] = [];
 const day = 86_400_000;
 for (let start = Date.parse(SEASON_START); start <= Date.parse(SEASON_END); start += WINDOW_DAYS * day) {
  const end = Math.min(start + (WINDOW_DAYS - 1) * day, Date.parse(SEASON_END));
  result.push([new Date(start).toISOString().slice(0, 10), new Date(end).toISOString().slice(0, 10)]);
 }
 return result;
}

async function windowBytes(start: string, end: string, offline: boolean): Promise<Buffer> {
 const path = join(CACHE, `${start}_${end}.csv`);
 try { return await readFile(path); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
 }
 if (offline) throw new Error(`Offline curation requires cached Statcast window ${start}..${end}`);
 const dayBefore = new Date(Date.parse(start) - 86_400_000).toISOString().slice(0, 10);
 const dayAfter = new Date(Date.parse(end) + 86_400_000).toISOString().slice(0, 10);
 const url = `${QUERY}&game_date_gt=${dayBefore}&game_date_lt=${dayAfter}`;
 for (let attempt = 1; ; attempt++) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (response.ok) {
   const bytes = Buffer.from(await response.arrayBuffer());
   if (!bytes.subarray(0, 64).toString('utf8').includes('pitch_type')) throw new Error(`Unexpected Statcast response for ${start}..${end}`);
   await mkdir(CACHE, { recursive: true });
   await writeFile(path, bytes);
   await new Promise(resolve => setTimeout(resolve, 1500));
   return bytes;
  }
  if (attempt >= 4) throw new Error(`Statcast download failed for ${start}..${end}: HTTP ${response.status}`);
  await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
 }
}

async function main(): Promise<void> {
 const offline = process.argv.includes('--offline');
 const ev = STATCAST_BINS.ev, launch = STATCAST_BINS.launch, spray = STATCAST_BINS.spray;
 const histogram = new Array(ev.count * launch.count).fill(0);
 const sprayCounts: Record<'L' | 'R', number[][]> = { L: LAUNCH_CLASSES.map(() => new Array(spray.count).fill(0)), R: LAUNCH_CLASSES.map(() => new Array(spray.count).fill(0)) };
 const outcomes = new Array(STATCAST_BINS.outcomeEv.count * STATCAST_BINS.outcomeLaunch.count * 5).fill(0);
 const files: { window: string; sha256: string }[] = [];
 const seen = new Set<string>();
 let balls = 0, skipped = 0, duplicates = 0;
 for (const [start, end] of windows()) {
  const bytes = await windowBytes(start, end, offline);
  files.push({ window: `${start}..${end}`, sha256: createHash('sha256').update(bytes).digest('hex') });
  for (const row of parseCsv(`${start}_${end}.csv`, bytes)) {
   if (row.type !== 'X' || row.game_type !== 'R' || EXCLUDED.has(row.events) || !row.events) continue;
   const key = `${row.game_pk}:${row.at_bat_number}:${row.pitch_number}`;
   if (seen.has(key)) { duplicates++; continue; }
   seen.add(key);
   const speed = Number(row.launch_speed), angle = Number(row.launch_angle);
   if (!row.launch_speed || !row.launch_angle || !Number.isFinite(speed) || !Number.isFinite(angle)) { skipped++; continue; }
   balls++;
   histogram[bin(speed, ev) * launch.count + bin(angle, launch)]++;
   const outcome = HITS[row.events] ?? 4;
   outcomes[(bin(speed, STATCAST_BINS.outcomeEv) * STATCAST_BINS.outcomeLaunch.count + bin(angle, STATCAST_BINS.outcomeLaunch)) * 5 + outcome]++;
   const x = Number(row.hc_x), y = Number(row.hc_y);
   if ((row.stand === 'L' || row.stand === 'R') && row.hc_x && row.hc_y && Number.isFinite(x) && Number.isFinite(y)) {
    const degrees = Math.atan2(x - 125.42, 198.27 - y) * 180 / Math.PI;
    sprayCounts[row.stand][launchClass(angle)][bin(degrees, spray)]++;
   }
  }
 }
 if (balls < 100_000) throw new Error(`Expected a full season of balls in play, found ${balls}`);
 const output = {
  source: {
   title: 'Baseball Savant Statcast search, 2025 regular season balls in play',
   url: 'https://baseballsavant.mlb.com/statcast_search',
   query: `${QUERY}&game_date_gt=..&game_date_lt=..`,
   credit: 'Statcast data courtesy of MLB Advanced Media via Baseball Savant; aggregated counts only.',
   windows: files,
   notes: [
    'Balls in play (type X) with recorded launch speed and angle; sacrifice bunts and catcher interference excluded.',
    'Values outside the bin ranges are counted in the nearest edge bin.',
    'Spray angle uses atan2(hc_x - 125.42, 198.27 - hc_y): positive toward right field.'
   ]
  },
  bins: STATCAST_BINS,
  launchClasses: LAUNCH_CLASSES,
  balls, skippedMissingTracking: skipped, duplicates,
  histogram,
  spray: sprayCounts,
  outcomeColumns: ['1B', '2B', '3B', 'HR', 'OUT'],
  outcomes
 };
 await mkdir(dirname(OUTPUT), { recursive: true });
 await writeFile(OUTPUT, `${JSON.stringify(output)}\n`);
 console.log(JSON.stringify({ balls, skipped, duplicates, windows: files.length, output: OUTPUT }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
 main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
