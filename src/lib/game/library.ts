import { replayInput } from './draft.ts';
import type { StorageAccess } from './persistence.ts';
import { decodeReplay, encodeReplay } from './share.ts';
import { compareId, CURRENT_REPLAY_SCHEMA_VERSION, MODEL_VERSION, type Draft, type Manifest, type Profile, type Slot } from './types.ts';
import { estimatedHitterWar, estimatedPitcherWar } from '../sim/value.ts';
import type { SeasonResult } from '../sim/types.ts';

export const LIBRARY_KEY = '162-zero:library:v1';
export const LIBRARY_LIMIT = 50;
const STORAGE_NOTICE = 'Your season library is unavailable: browser storage is blocked or full.';

/**
 * A completed season saved on this device. `token` is the inline replay, so a saved season
 * needs no server; roster, record and MVP are display snapshots that survive version changes.
 */
export interface LibraryEntry {
 key: string;
 savedAt: string;
 token: string;
 schemaVersion: number;
 modelVersion: string;
 dataVersion: string;
 record: { wins: number; losses: number };
 stadium: { id: string; name: string } | null;
 roster: { seasonId: string; label: string; slot: Slot }[];
 mvp?: { seasonId: string; label: string };
 nickname?: string;
}

/** `playable` entries validate under the current manifest; `retired` ones are mementos only. */
export interface LibraryView extends LibraryEntry { status: 'playable' | 'retired' }

function read(storage: StorageAccess): LibraryEntry[] {
 const bytes = storage.getItem(LIBRARY_KEY);
 if (bytes === null) return [];
 try {
  const value: unknown = JSON.parse(bytes);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is LibraryEntry => !!entry && typeof entry === 'object' && typeof entry.key === 'string' && typeof entry.token === 'string' &&
   typeof entry.savedAt === 'string' && Array.isArray(entry.roster) && !!entry.record && Number.isInteger(entry.record.wins) && Number.isInteger(entry.record.losses));
 } catch { return []; }
}

function write(storage: StorageAccess, entries: LibraryEntry[]): string | null {
 try { storage.setItem(LIBRARY_KEY, JSON.stringify(entries)); return null; }
 catch { return STORAGE_NOTICE; }
}

/** Stable identity of a completed draft: SHA-256 of its canonical replay input. */
export async function libraryKey(draft: Draft): Promise<string> {
 const bytes = new TextEncoder().encode(JSON.stringify(replayInput(draft)));
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

/** Drops the oldest unnamed entries beyond the cap; named entries are never evicted. */
function capped(entries: LibraryEntry[]): LibraryEntry[] {
 const kept = [...entries];
 while (kept.length > LIBRARY_LIMIT) {
  let oldest = -1;
  kept.forEach((entry, index) => { if (!entry.nickname && (oldest < 0 || entry.savedAt < kept[oldest].savedAt)) oldest = index; });
  if (oldest < 0) break;
  kept.splice(oldest, 1);
 }
 return kept;
}

/** Saves a completed season; saving the same draft again keeps one entry. Returns a notice on storage failure. */
export async function saveSeason(storage: StorageAccess, draft: Draft, result: SeasonResult, profiles: readonly Profile[], manifest: Manifest, now = new Date()): Promise<string | null> {
 try {
  const key = await libraryKey(draft);
  const entries = read(storage);
  const existing = entries.find(entry => entry.key === key);
  const byId = new Map(profiles.map(profile => [profile.seasonId, profile]));
  const stadium = draft.homeStadium && manifest.stadiums.find(item => item.ref.id === draft.homeStadium!.id);
  const entry: LibraryEntry = {
   key, savedAt: existing?.savedAt ?? now.toISOString(), token: encodeReplay(draft),
   schemaVersion: draft.schemaVersion, modelVersion: draft.modelVersion, dataVersion: draft.dataVersion,
   record: { wins: result.wins, losses: result.losses },
   stadium: stadium ? { id: stadium.ref.id, name: stadium.name } : null,
   roster: draft.picks.map(pick => ({ seasonId: pick.seasonId, slot: pick.slot, label: byId.get(pick.seasonId) ? label(byId.get(pick.seasonId)!) : pick.seasonId })),
   mvp: seasonMvp(result, byId),
   ...(existing?.nickname ? { nickname: existing.nickname } : {})
  };
  return write(storage, capped([entry, ...entries.filter(item => item.key !== key)]));
 } catch { return STORAGE_NOTICE; }
}

/** Every saved season with its current status; status is computed here and never stored. */
export function loadLibrary(storage: StorageAccess, manifest: Manifest): { entries: LibraryView[]; notice: string | null } {
 let entries: LibraryEntry[];
 try { entries = read(storage); }
 catch { return { entries: [], notice: STORAGE_NOTICE }; }
 return {
  notice: null,
  entries: entries.map(entry => {
   let playable = entry.schemaVersion === CURRENT_REPLAY_SCHEMA_VERSION && entry.modelVersion === MODEL_VERSION && entry.dataVersion === manifest.dataVersion;
   if (playable) {
    try { decodeReplay(entry.token, manifest); }
    catch { playable = false; }
   }
   return { ...entry, status: playable ? 'playable' : 'retired' };
  })
 };
}

export function renameSeason(storage: StorageAccess, key: string, nickname: string): string | null {
 try {
  const trimmed = nickname.trim().slice(0, 60);
  return write(storage, read(storage).map(entry => {
   if (entry.key !== key) return entry;
   const { nickname: _previous, ...rest } = entry;
   return trimmed ? { ...rest, nickname: trimmed } : rest;
  }));
 } catch { return STORAGE_NOTICE; }
}

export function deleteSeason(storage: StorageAccess, key: string): string | null {
 try { return write(storage, read(storage).filter(entry => entry.key !== key)); }
 catch { return STORAGE_NOTICE; }
}

/** The inline replay link for an entry, relative to the site. */
export function libraryLink(entry: Pick<LibraryEntry, 'token'>): string {
 return `/#replay=${entry.token}`;
}
