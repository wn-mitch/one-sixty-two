import type { LibraryEntry, SavedBatter, SavedPitcher } from '../game/library.ts';
import { json, parseJson, type Row, type Statement } from './sql.ts';

/**
 * Statements that store one library entry: the season row (keeping the first save date and any
 * nickname already on it) and one card row per roster pick with its season line.
 */
export function seasonStatements(entry: LibraryEntry, touchedAt: string): Statement[] {
 const batting = new Map(entry.batting.map((line, index) => [line.seasonId, { line, index }]));
 const pitching = new Map(entry.pitching.map((line, index) => [line.seasonId, { line, index }]));
 return [
  {
   sql: `INSERT INTO seasons (key, saved_at, touched_at, token, schema_version, model_version, data_version, wins, losses, runs_scored, runs_allowed, stadium_json, mvp_json, nickname)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET touched_at = excluded.touched_at, token = excluded.token, schema_version = excluded.schema_version,
     model_version = excluded.model_version, data_version = excluded.data_version, wins = excluded.wins, losses = excluded.losses,
     runs_scored = excluded.runs_scored, runs_allowed = excluded.runs_allowed, stadium_json = excluded.stadium_json, mvp_json = excluded.mvp_json,
     nickname = coalesce(seasons.nickname, excluded.nickname)`,
   bind: [entry.key, entry.savedAt, touchedAt, entry.token, entry.schemaVersion, entry.modelVersion, entry.dataVersion, entry.record.wins, entry.record.losses,
    entry.runs.scored, entry.runs.allowed, entry.stadium ? json(entry.stadium) : null, entry.mvp ? json(entry.mvp) : null, entry.nickname ?? null]
  },
  { sql: 'DELETE FROM season_cards WHERE season_key = ?', bind: [entry.key] },
  ...entry.roster.map((card, position): Statement => {
   const hit = batting.get(card.seasonId);
   const pitch = pitching.get(card.seasonId);
   return {
    sql: `INSERT INTO season_cards (season_key, position, season_id, slot, label, batting_index, batting_json, pitching_index, pitching_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [entry.key, position, card.seasonId, card.slot, card.label, hit?.index ?? null, hit ? json(hit.line) : null, pitch?.index ?? null, pitch ? json(pitch.line) : null]
   };
  })
 ];
}

export interface SeasonRow extends Row {
 key: string; saved_at: string; token: string; schema_version: number; model_version: string; data_version: string;
 wins: number; losses: number; runs_scored: number; runs_allowed: number; stadium_json: string | null; mvp_json: string | null; nickname: string | null;
}
export interface CardRow extends Row {
 season_key: string; position: number; season_id: string; slot: string; label: string;
 batting_index: number | null; batting_json: string | null; pitching_index: number | null; pitching_json: string | null;
}

/** Rebuilds library entries from their rows, newest touched first as `rows` are ordered. */
export function seasonEntries(rows: readonly SeasonRow[], cards: readonly CardRow[]): LibraryEntry[] {
 const bySeason = Map.groupBy(cards, card => card.season_key);
 return rows.map(row => {
  const own = [...(bySeason.get(row.key) ?? [])].sort((a, b) => a.position - b.position);
  const lines = <T>(index: 'batting_index' | 'pitching_index', column: 'batting_json' | 'pitching_json') => own
   .filter(card => card[index] !== null).sort((a, b) => a[index]! - b[index]!)
   .flatMap(card => { const line = parseJson<T>(card[column]); return line ? [line] : []; });
  const stadium = parseJson<NonNullable<LibraryEntry['stadium']>>(row.stadium_json) ?? null;
  const mvp = parseJson<NonNullable<LibraryEntry['mvp']>>(row.mvp_json);
  return {
   key: row.key, savedAt: row.saved_at, token: row.token,
   schemaVersion: row.schema_version, modelVersion: row.model_version, dataVersion: row.data_version,
   record: { wins: row.wins, losses: row.losses }, runs: { scored: row.runs_scored, allowed: row.runs_allowed },
   batting: lines<SavedBatter>('batting_index', 'batting_json'),
   pitching: lines<SavedPitcher>('pitching_index', 'pitching_json'),
   stadium,
   roster: own.map(card => ({ seasonId: card.season_id, label: card.label, slot: card.slot as LibraryEntry['roster'][number]['slot'] })),
   ...(mvp ? { mvp } : {}),
   ...(row.nickname ? { nickname: row.nickname } : {})
  };
 });
}
