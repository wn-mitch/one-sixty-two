import { isSeriesRecord } from '../storage/legacy.ts';
import { json, parseJson, type Db } from '../storage/sql.ts';
import { replayKeyDigest } from './library.ts';
import type { SeriesResult, SeriesTeamId } from '../sim/series-types.ts';

/** One club in a recorded series; `libraryKey` matches the club's season library entry when it has one. */
export interface SeriesSide { libraryKey: string; name: string; seed: 1 | 2; wins: number }

/** A finished best-of-five kept on this device so the season library can show each club's head-to-head record. */
export interface SeriesRecord {
 id: string;
 playedAt: string;
 /** Site-relative `/h2h#…` link that replays this exact series. */
 link: string;
 teams: [SeriesSide, SeriesSide];
 championKey: string;
}

/** The record of a finished series; replaying the same pair gives the same id, so it is kept once. */
export async function seriesRecord(result: SeriesResult, link: string, playedAt: string): Promise<SeriesRecord> {
 const keys = await Promise.all(result.teams.map(team => replayKeyDigest(team.key)));
 const side = (index: 0 | 1): SeriesSide => {
  const team = result.teams[index];
  return { libraryKey: keys[index], name: team.name, seed: team.seed, wins: result.score[team.id as SeriesTeamId] };
 };
 const champion = result.teams.findIndex(team => team.id === result.championId);
 return { id: `${[...keys].sort().join(':')}:${result.seed}`, playedAt, link, teams: [side(0), side(1)], championKey: keys[champion] };
}

/** Every recorded series, most recently played first; rows that fail the structural check are skipped. */
export async function loadSeriesHistory(db: Db): Promise<SeriesRecord[]> {
 const rows = await db.all<{ json: string }>('SELECT json FROM series ORDER BY recorded_at DESC, id');
 return rows.map(row => parseJson<unknown>(row.json)).filter(isSeriesRecord);
}

/** Records a finished series; a replayed series is kept once and moves to the top. Returns a notice on storage failure. */
export async function recordSeries(db: Db, record: SeriesRecord, now = new Date()): Promise<string | null> {
 try {
  await db.run([{ sql: 'INSERT INTO series (id, recorded_at, json) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET recorded_at = excluded.recorded_at, json = excluded.json', bind: [record.id, now.toISOString(), json(record)] }]);
  return null;
 } catch { return 'This series could not be added to your head-to-head history: browser storage is blocked or full.'; }
}

/** Series won and lost by one library club. */
export function seriesTally(history: readonly SeriesRecord[], libraryKey: string): { won: number; lost: number } {
 let won = 0;
 let lost = 0;
 for (const record of history) {
  if (!record.teams.some(side => side.libraryKey === libraryKey)) continue;
  // A club against itself counts once, as a win.
  if (record.championKey === libraryKey) won++;
  else lost++;
 }
 return { won, lost };
}

/** Series between two library clubs, newest first. */
export function seriesBetween(history: readonly SeriesRecord[], a: string, b: string): SeriesRecord[] {
 return history.filter(record => {
  const keys = record.teams.map(side => side.libraryKey);
  return keys.includes(a) && keys.includes(b);
 });
}
