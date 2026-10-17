import { replayInput } from './draft.ts';
import { collectionStatements } from '../collection/collection.ts';
import { completionReward, firstSeasonBonus } from '../cosmetics/ledger.ts';
import { seasonEntries, seasonStatements, type CardRow, type SeasonRow } from '../storage/season-rows.ts';
import type { Db, Statement } from '../storage/sql.ts';
import { decodeReplay, encodeReplay } from './share.ts';
import { compareId, CURRENT_REPLAY_SCHEMA_VERSION, MODEL_VERSION, type Draft, type Manifest, type Profile, type RosterSlot } from './types.ts';
import { estimatedHitterWar, estimatedPitcherWar } from '../sim/value.ts';
import type { SeasonResult } from '../sim/types.ts';

export const STORAGE_NOTICE = 'Your season library is unavailable: browser storage is blocked or full.';

/**
 * A hitter's simulated season line as the library keeps it; `war` is the estimated hitter WAR.
 * Seasons saved before single-game feats were counted lack the optional feat fields.
 */
export interface SavedBatter {
 seasonId: string; label: string; slot: RosterSlot;
 PA: number; AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SF: number; RBI: number; SB: number;
 cycles?: number; mostHomeRunsInGame?: number; grandSlams?: number; walkOffHomeRuns?: number;
 war: number;
}
/** A drafted pitcher's simulated season line; the pooled support bullpen is not kept. Seasons saved before feats were counted lack the optional fields. */
export interface SavedPitcher {
 seasonId: string; label: string; slot: RosterSlot;
 outs: number; H: number; BB: number; SO: number; R: number; starts: number;
 noHitters?: number; perfectGames?: number; shutouts?: number; twentyStrikeoutGames?: number;
 saves?: number; blownSaves?: number; saveOpportunities?: number;
 war: number;
}

export interface BattingFeats { cycles: number; mostHomeRunsInGame: number }
export interface PitchingFeats { noHitters: number; perfectGames: number; shutouts: number; twentyStrikeoutGames: number }

/**
 * Single-game feats by the club's players. A hitter hits for the cycle with a single, double, triple
 * and home run in one game. A complete game is one pitcher working every out the club recorded, at
 * least nine innings: with no runs it is a shutout, with no hits a no-hitter, and a no-hitter where
 * every batter faced was out is a perfect game. A 20-strikeout game need not be complete.
 */
export function gameFeats(result: Pick<SeasonResult, 'games'>): { batting: Map<string, BattingFeats>; pitching: Map<string, PitchingFeats> } {
 const batting = new Map<string, BattingFeats>(), pitching = new Map<string, PitchingFeats>();
 const hitter = (seasonId: string) => batting.get(seasonId) ?? batting.set(seasonId, { cycles: 0, mostHomeRunsInGame: 0 }).get(seasonId)!;
 const arm = (seasonId: string) => pitching.get(seasonId) ?? pitching.set(seasonId, { noHitters: 0, perfectGames: 0, shutouts: 0, twentyStrikeoutGames: 0 }).get(seasonId)!;
 for (const game of result.games) {
  const club = game.isHome ? game.home : game.away;
  for (const line of club.batting) {
   const singles = line.H - line.doubles - line.triples - line.HR;
   if (singles > 0 && line.doubles > 0 && line.triples > 0 && line.HR > 0) hitter(line.seasonId).cycles++;
   if (line.HR > (batting.get(line.seasonId)?.mostHomeRunsInGame ?? 0)) hitter(line.seasonId).mostHomeRunsInGame = line.HR;
  }
  const pitched = club.pitching.filter(line => line.outs > 0 || line.BF > 0);
  for (const line of pitched) if (line.SO >= 20) arm(line.seasonId).twentyStrikeoutGames++;
  if (pitched.length !== 1 || pitched[0].outs < 27) continue;
  const [line] = pitched;
  if (line.R === 0) arm(line.seasonId).shutouts++;
  if (line.H > 0) continue;
  arm(line.seasonId).noHitters++;
  if (line.BB === 0 && line.HBP === 0 && line.BF === line.outs) arm(line.seasonId).perfectGames++;
 }
 return { batting, pitching };
}

/**
 * A completed season saved on this device. `token` is the inline replay, so a saved season
 * needs no server; roster, record, MVP and season lines are display snapshots that survive version changes.
 */
export interface LibraryEntry {
 key: string;
 savedAt: string;
 token: string;
 schemaVersion: number;
 modelVersion: string;
 dataVersion: string;
 record: { wins: number; losses: number };
 runs: { scored: number; allowed: number };
 batting: SavedBatter[];
 pitching: SavedPitcher[];
 stadium: { id: string; name: string } | null;
 roster: { seasonId: string; label: string; slot: RosterSlot }[];
 mvp?: { seasonId: string; label: string };
 nickname?: string;
 /** The day of the daily run this season played, `YYYY-MM-DD`. */
 daily?: string;
}

/** `playable` entries validate under the current manifest; `retired` ones are mementos only. */
export interface LibraryView extends LibraryEntry { status: 'playable' | 'retired' }

/** Stable identity of a completed draft: SHA-256 of its canonical replay input. */
export function libraryKey(draft: Draft): Promise<string> {
 return replayKeyDigest(JSON.stringify(replayInput(draft)));
}

/** SHA-256 of a canonical replay key (`JSON.stringify(replayInput(draft))`), as the library stores it. */
export async function replayKeyDigest(canonical: string): Promise<string> {
 const bytes = new TextEncoder().encode(canonical);
 const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
 return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

const label = (profile: Pick<Profile, 'displayName' | 'year'>) => `${profile.displayName} ${profile.year}`;

/** The roster's season MVP by estimated WAR, ties to the lower season id. */
export function seasonMvp(result: Pick<SeasonResult, 'batting' | 'pitching'>, profiles: ReadonlyMap<string, Pick<Profile, 'seasonId' | 'displayName' | 'year'>>): LibraryEntry['mvp'] {
 const values = [
  ...result.batting.filter(line => line.PA > 0).map(line => ({ seasonId: line.seasonId, war: estimatedHitterWar(line) })),
  ...result.pitching.filter(line => line.role !== 'support' && line.outs > 0).map(line => ({ seasonId: line.seasonId, war: estimatedPitcherWar(line) }))
 ].sort((a, b) => b.war - a.war || compareId(a.seasonId, b.seasonId));
 const profile = values[0] && profiles.get(values[0].seasonId);
 return profile ? { seasonId: profile.seasonId, label: label(profile) } : undefined;
}

/** The drafted players' saved season lines, with their single-game feats. */
export function savedLines(result: Pick<SeasonResult, 'games' | 'batting' | 'pitching'>, slots: ReadonlyMap<string, RosterSlot>, name: (seasonId: string) => string): Pick<LibraryEntry, 'batting' | 'pitching'> {
 const feats = gameFeats(result);
 return {
  batting: result.batting.filter(line => slots.has(line.seasonId)).map(line => ({
   seasonId: line.seasonId, label: name(line.seasonId), slot: slots.get(line.seasonId)!,
   PA: line.PA, AB: line.AB, H: line.H, doubles: line.doubles, triples: line.triples, HR: line.HR, BB: line.BB, HBP: line.HBP, SF: line.SF, RBI: line.RBI, SB: line.SB,
   cycles: feats.batting.get(line.seasonId)?.cycles ?? 0, mostHomeRunsInGame: feats.batting.get(line.seasonId)?.mostHomeRunsInGame ?? 0,
   grandSlams: line.grandSlams, walkOffHomeRuns: line.walkOffHomeRuns,
   war: estimatedHitterWar(line)
  })),
  pitching: result.pitching.filter(line => line.role !== 'support' && slots.has(line.seasonId)).map(line => ({
   seasonId: line.seasonId, label: name(line.seasonId), slot: slots.get(line.seasonId)!,
   outs: line.outs, H: line.H, BB: line.BB, SO: line.SO, R: line.R, starts: line.starts,
   ...(feats.pitching.get(line.seasonId) ?? { noHitters: 0, perfectGames: 0, shutouts: 0, twentyStrikeoutGames: 0 }),
   saves: line.saves, blownSaves: line.blownSaves, saveOpportunities: line.saveOpportunities,
   war: estimatedPitcherWar(line)
  }))
 };
}

/** The library snapshot of one completed season, before nickname and save date are carried over. */
export function libraryEntry(key: string, savedAt: string, draft: Draft, result: SeasonResult, profiles: readonly Profile[], manifest: Manifest): LibraryEntry {
 const byId = new Map(profiles.map(profile => [profile.seasonId, profile]));
 const slots = new Map(draft.picks.map(pick => [pick.seasonId, pick.slot]));
 const name = (seasonId: string) => byId.get(seasonId) ? label(byId.get(seasonId)!) : seasonId;
 const stadium = draft.homeStadium && manifest.stadiums.find(item => item.ref.id === draft.homeStadium!.id);
 return {
  key, savedAt, token: encodeReplay(draft),
  schemaVersion: draft.schemaVersion, modelVersion: draft.modelVersion, dataVersion: draft.dataVersion,
  record: { wins: result.wins, losses: result.losses },
  runs: { scored: result.runsFor, allowed: result.runsAgainst },
  ...savedLines(result, slots, name),
  stadium: stadium ? { id: stadium.ref.id, name: stadium.name } : null,
  roster: draft.picks.map(pick => ({ seasonId: pick.seasonId, slot: pick.slot, label: name(pick.seasonId) })),
  mvp: seasonMvp(result, byId),
  ...(draft.daily === undefined ? {} : { daily: draft.daily })
 };
}

/** The ledger key of a daily's completion bonus; one per day, whatever was drafted. */
export const dailyRewardKey = (date: string) => `daily:${date}`;

/** Records a daily's result on its run. A day already finished with another season keeps its first result. */
function dailyResult(date: string, key: string, result: Pick<SeasonResult, 'wins' | 'losses'>, stamp: string): Statement {
 return {
  sql: `INSERT INTO daily_runs (date, started_at, updated_at, json, season_key, wins, losses) VALUES (?, ?, ?, NULL, ?, ?, ?)
   ON CONFLICT (date) DO UPDATE SET updated_at = excluded.updated_at, json = NULL, season_key = excluded.season_key, wins = excluded.wins, losses = excluded.losses
   WHERE daily_runs.season_key IS NULL OR daily_runs.season_key = excluded.season_key`,
  bind: [date, stamp, stamp, key, result.wins, result.losses]
 };
}

/**
 * Saves an own season and its completion reward (plus a device's one-time first-season bonus) atomically; revisits keep the
 * first save and reward. A daily run also records its result and earns the day's bonus.
 */
export async function saveSeason(db: Db, draft: Draft, result: SeasonResult, profiles: readonly Profile[], manifest: Manifest, now = new Date()): Promise<string | null> {
 try {
  const key = await libraryKey(draft);
  const entry = libraryEntry(key, now.toISOString(), draft, result, profiles, manifest);
  const stamp = now.toISOString();
  const complete = Number.isInteger(result.wins) && Number.isInteger(result.losses) && result.wins >= 0 && result.losses >= 0 && result.wins + result.losses === 162;
  const daily = complete && draft.daily !== undefined ? [...completionReward(dailyRewardKey(draft.daily), stamp), dailyResult(draft.daily, key, result, stamp)] : [];
  await db.run([...seasonStatements(entry, stamp), ...collectionStatements(entry, stamp), ...(complete ? [...firstSeasonBonus(stamp), ...completionReward(`classic:${key}`, stamp)] : []), ...daily]);
  return null;
 } catch { return STORAGE_NOTICE; }
}

/** Every saved entry, most recently saved first. */
export async function readLibrary(db: Db): Promise<LibraryEntry[]> {
 const [rows, cards] = await Promise.all([
  db.all<SeasonRow>('SELECT * FROM seasons ORDER BY touched_at DESC, key'),
  db.all<CardRow>('SELECT * FROM season_cards')
 ]);
 return seasonEntries(rows, cards);
}

/** Whether an entry can still be replayed under the current game; computed on read, never stored. */
export function entryStatus(entry: LibraryEntry, manifest: Manifest): LibraryView['status'] {
 if (entry.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION || entry.modelVersion !== MODEL_VERSION || entry.dataVersion !== manifest.dataVersion) return 'retired';
 try { decodeReplay(entry.token, manifest); return 'playable'; }
 catch { return 'retired'; }
}

/** Every saved season with its current status. */
export async function loadLibrary(db: Db, manifest: Manifest): Promise<{ entries: LibraryView[]; notice: string | null }> {
 let entries: LibraryEntry[];
 try { entries = await readLibrary(db); }
 catch { return { entries: [], notice: STORAGE_NOTICE }; }
 return { notice: null, entries: entries.map(entry => ({ ...entry, status: entryStatus(entry, manifest) })) };
}

export async function renameSeason(db: Db, key: string, nickname: string): Promise<string | null> {
 try {
  const trimmed = nickname.trim().slice(0, 60);
  await db.run([{ sql: 'UPDATE seasons SET nickname = ? WHERE key = ?', bind: [trimmed || null, key] }]);
  return null;
 } catch { return STORAGE_NOTICE; }
}

export async function deleteSeason(db: Db, key: string): Promise<string | null> {
 try { await db.run([{ sql: 'DELETE FROM seasons WHERE key = ?', bind: [key] }]); return null; }
 catch { return STORAGE_NOTICE; }
}

/** The inline replay link for an entry, relative to the site. */
export function libraryLink(entry: Pick<LibraryEntry, 'token'>): string {
 return `/#replay=${entry.token}`;
}
