import type { LibraryEntry } from '../game/library.ts';
import type { SeriesRecord, SeriesSide } from '../game/series-history.ts';

/** localStorage keys that held device saves before the SQLite database; migration 1 imports them once. */
export const LEGACY_KEYS = Object.freeze({
 draft: '162-zero:v1',
 library: '162-zero:library:v2',
 series: '162-zero:series:v1'
});

/** The raw legacy values, read on the main thread because the database worker cannot see localStorage. */
export interface LegacySaves { draft: string | null; library: string | null; series: string | null }
export const NO_LEGACY: LegacySaves = Object.freeze({ draft: null, library: null, series: null });

export function readLegacy(storage: Pick<Storage, 'getItem'>): LegacySaves {
 return { draft: storage.getItem(LEGACY_KEYS.draft), library: storage.getItem(LEGACY_KEYS.library), series: storage.getItem(LEGACY_KEYS.series) };
}

function array(text: string | null): unknown[] {
 if (text === null) return [];
 try {
  const value: unknown = JSON.parse(text);
  return Array.isArray(value) ? value : [];
 } catch { return []; }
}

/** Whether a value has the structure the library displays; anything else is skipped, never repaired. */
export function isLibraryEntry(entry: unknown): entry is LibraryEntry {
 if (!entry || typeof entry !== 'object') return false;
 const item = entry as Partial<LibraryEntry>;
 return typeof item.key === 'string' && typeof item.token === 'string' && typeof item.savedAt === 'string' &&
   typeof item.schemaVersion === 'number' && typeof item.modelVersion === 'string' && typeof item.dataVersion === 'string' &&
   Array.isArray(item.roster) && item.roster.every(card => !!card && typeof card.seasonId === 'string' && typeof card.slot === 'string' && typeof card.label === 'string') &&
   Array.isArray(item.batting) && item.batting.every(line => !!line && typeof line.seasonId === 'string') &&
   Array.isArray(item.pitching) && item.pitching.every(line => !!line && typeof line.seasonId === 'string') &&
   !!item.runs && Number.isFinite(item.runs.scored) && Number.isFinite(item.runs.allowed) &&
   !!item.record && Number.isInteger(item.record.wins) && Number.isInteger(item.record.losses);
}

export const parseLegacyLibrary = (text: string | null): LibraryEntry[] => array(text).filter(isLibraryEntry);

export function isSeriesRecord(entry: unknown): entry is SeriesRecord {
 if (!entry || typeof entry !== 'object') return false;
 const item = entry as Partial<SeriesRecord>;
 return typeof item.id === 'string' && typeof item.playedAt === 'string' && typeof item.link === 'string' && typeof item.championKey === 'string' &&
   Array.isArray(item.teams) && item.teams.length === 2 &&
   item.teams.every((side: SeriesSide) => !!side && typeof side.libraryKey === 'string' && typeof side.name === 'string' && Number.isInteger(side.wins));
}

export const parseLegacySeries = (text: string | null): SeriesRecord[] => array(text).filter(isSeriesRecord);
