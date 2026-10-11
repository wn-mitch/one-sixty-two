import { replayInput } from './draft.ts';
import { collectionStatements } from '../collection/collection.ts';
import { seasonEntries, seasonStatements, type CardRow, type SeasonRow } from '../storage/season-rows.ts';
import type { Db } from '../storage/sql.ts';
import { decodeReplay, encodeReplay } from './share.ts';
import { compareId, CURRENT_REPLAY_SCHEMA_VERSION, MODEL_VERSION, type Draft, type Manifest, type Profile, type Slot } from './types.ts';
import { estimatedHitterWar, estimatedPitcherWar } from '../sim/value.ts';
import type { SeasonResult } from '../sim/types.ts';

export const STORAGE_NOTICE = 'Your season library is unavailable: browser storage is blocked or full.';

/** A hitter's simulated season line as the library keeps it; `war` is the estimated hitter WAR. */
export interface SavedBatter {
 seasonId: string; label: string; slot: Slot;
 PA: number; AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SF: number; RBI: number; SB: number;
 war: number;
}
/** A drafted pitcher's simulated season line; the pooled support bullpen is not kept. */
export interface SavedPitcher {
 seasonId: string; label: string; slot: Slot;
 outs: number; H: number; BB: number; SO: number; R: number; starts: number;
 war: number;
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
 roster: { seasonId: string; label: string; slot: Slot }[];
 mvp?: { seasonId: string; label: string };
 nickname?: string;
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

const label = (profile: Profile) => `${profile.displayName} ${profile.year}`;

function seasonMvp(result: SeasonResult, profiles: Map<string, Profile>): LibraryEntry['mvp'] {
 const values = [
  ...result.batting.filter(line => line.PA > 0).map(line => ({ seasonId: line.seasonId, war: estimatedHitterWar(line) })),
  ...result.pitching.filter(line => line.role !== 'support' && line.outs > 0).map(line => ({ seasonId: line.seasonId, war: estimatedPitcherWar(line) }))
 ].sort((a, b) => b.war - a.war || compareId(a.seasonId, b.seasonId));
 const profile = values[0] && profiles.get(values[0].seasonId);
 return profile ? { seasonId: profile.seasonId, label: label(profile) } : undefined;
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
  batting: result.batting.filter(line => slots.has(line.seasonId)).map(line => ({
   seasonId: line.seasonId, label: name(line.seasonId), slot: slots.get(line.seasonId)!,
   PA: line.PA, AB: line.AB, H: line.H, doubles: line.doubles, triples: line.triples, HR: line.HR, BB: line.BB, HBP: line.HBP, SF: line.SF, RBI: line.RBI, SB: line.SB,
   war: estimatedHitterWar(line)
  })),
  pitching: result.pitching.filter(line => line.role !== 'support' && slots.has(line.seasonId)).map(line => ({
   seasonId: line.seasonId, label: name(line.seasonId), slot: slots.get(line.seasonId)!,
   outs: line.outs, H: line.H, BB: line.BB, SO: line.SO, R: line.R, starts: line.starts,
   war: estimatedPitcherWar(line)
  })),
  stadium: stadium ? { id: stadium.ref.id, name: stadium.name } : null,
  roster: draft.picks.map(pick => ({ seasonId: pick.seasonId, slot: pick.slot, label: name(pick.seasonId) })),
  mvp: seasonMvp(result, byId)
 };
}

/** Saves a completed season; saving the same draft again keeps one entry, its first save date and its nickname. */
export async function saveSeason(db: Db, draft: Draft, result: SeasonResult, profiles: readonly Profile[], manifest: Manifest, now = new Date()): Promise<string | null> {
 try {
  const key = await libraryKey(draft);
  const entry = libraryEntry(key, now.toISOString(), draft, result, profiles, manifest);
  await db.run([...seasonStatements(entry, now.toISOString()), ...collectionStatements(entry, now.toISOString())]);
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
