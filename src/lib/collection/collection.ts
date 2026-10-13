import type { LibraryEntry, SavedBatter, SavedPitcher } from '../game/library.ts';
import type { RosterSlot } from '../game/types.ts';
import { json, parseJson, type Db, type Row, type Statement } from '../storage/sql.ts';
import { LOYALTY_STICKERS, seasonStickers, STICKER_BY_KIND, STICKER_SPOTS, type PlacedSticker, type StickerFamily } from './stickers.ts';

/**
 * Statements that add one saved season to the collection: a rostering row per card (kept when the
 * season is later deleted from the library) and the stickers it earned. A re-save of the same
 * season updates its lines without counting twice, and an earned sticker keeps its first date and
 * any placement the player chose.
 */
export function collectionStatements(entry: LibraryEntry, earnedAt: string): Statement[] {
 const lines = new Map<string, SavedBatter | SavedPitcher>([...entry.batting, ...entry.pitching].map(line => [line.seasonId, line]));
 const statements: Statement[] = entry.roster.map(card => ({
  sql: `INSERT INTO rostered (season_id, season_key, rostered_at, label, slot, wins, losses, line_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT (season_id, season_key) DO UPDATE SET label = excluded.label, slot = excluded.slot, wins = excluded.wins, losses = excluded.losses, line_json = excluded.line_json`,
  bind: [card.seasonId, entry.key, entry.savedAt, card.label, card.slot, entry.record.wins, entry.record.losses, lines.has(card.seasonId) ? json(lines.get(card.seasonId)) : null]
 }));
 const award = (kind: string): { x: number; y: number } => STICKER_SPOTS[STICKER_BY_KIND.get(kind)!.family];
 for (const { seasonId, kind } of seasonStickers(entry)) {
  const spot = award(kind);
  statements.push({ sql: 'INSERT OR IGNORE INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden) VALUES (?, ?, ?, ?, ?, ?, 0)', bind: [seasonId, kind, earnedAt, entry.key, spot.x, spot.y] });
 }
 for (const { kind, at: times } of LOYALTY_STICKERS) {
  const spot = award(kind);
  statements.push({
   sql: `INSERT OR IGNORE INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden)
    SELECT season_id, ?, ?, ?, ?, ?, 0 FROM rostered WHERE season_id IN (SELECT season_id FROM rostered WHERE season_key = ?) GROUP BY season_id HAVING count(*) >= ?`,
   bind: [kind, earnedAt, entry.key, spot.x, spot.y, entry.key, times]
  });
 }
 return statements;
}

interface StickerRow extends Row { season_id: string; kind: string; earned_at: string; season_key: string | null; x: number; y: number; hidden: number }

const placed = (row: StickerRow): PlacedSticker => ({ kind: row.kind, x: row.x, y: row.y, hidden: row.hidden !== 0, earnedAt: row.earned_at });

/** Every card's stickers, keyed by player-season. */
export async function loadStickers(db: Db): Promise<Map<string, PlacedSticker[]>> {
 const rows = await db.all<StickerRow>('SELECT * FROM stickers ORDER BY season_id, earned_at, kind');
 const byCard = new Map<string, PlacedSticker[]>();
 for (const row of rows) byCard.set(row.season_id, [...(byCard.get(row.season_id) ?? []), placed(row)]);
 return byCard;
}

/** Stickers one saved season earned, for its results. */
export async function stickersFromSeason(db: Db, seasonKey: string): Promise<{ seasonId: string; sticker: PlacedSticker }[]> {
 const rows = await db.all<StickerRow>('SELECT * FROM stickers WHERE season_key = ? ORDER BY season_id, kind', [seasonKey]);
 return rows.map(row => ({ seasonId: row.season_id, sticker: placed(row) }));
}

const familyKinds = (family: StickerFamily): string[] => [...STICKER_BY_KIND.values()].filter(item => item.family === family).map(item => item.kind);
const clamp = (value: number) => Math.min(0.92, Math.max(0.08, value));

/** Moves a family's sticker on its own card; every tier of the family moves together. */
export async function moveSticker(db: Db, seasonId: string, family: StickerFamily, x: number, y: number): Promise<void> {
 const kinds = familyKinds(family);
 await db.run([{ sql: `UPDATE stickers SET x = ?, y = ? WHERE season_id = ? AND kind IN (${kinds.map(() => '?').join(', ')})`, bind: [clamp(x), clamp(y), seasonId, ...kinds] }]);
}

export async function setStickerHidden(db: Db, seasonId: string, family: StickerFamily, hidden: boolean): Promise<void> {
 const kinds = familyKinds(family);
 await db.run([{ sql: `UPDATE stickers SET hidden = ? WHERE season_id = ? AND kind IN (${kinds.map(() => '?').join(', ')})`, bind: [hidden ? 1 : 0, seasonId, ...kinds] }]);
}

/** One player-season as the collection keeps it. */
export interface CollectedCard {
 seasonId: string;
 label: string;
 slots: RosterSlot[];
 times: number;
 firstAt: string;
 lastAt: string;
 /** Best team record the card was rostered on, and its line that season. */
 best: { wins: number; losses: number; line: SavedBatter | SavedPitcher | null };
 stickers: PlacedSticker[];
}

interface RosteredRow extends Row { season_id: string; season_key: string; rostered_at: string; label: string; slot: string; wins: number; losses: number; line_json: string | null }

/** The binder: every player-season ever rostered on this device, most recently rostered first. */
export async function loadCollection(db: Db): Promise<CollectedCard[]> {
 const [rows, stickers] = await Promise.all([db.all<RosteredRow>('SELECT * FROM rostered ORDER BY rostered_at, season_key'), loadStickers(db)]);
 const cards = new Map<string, CollectedCard>();
 for (const row of rows) {
  const card = cards.get(row.season_id);
  const line = parseJson<SavedBatter | SavedPitcher>(row.line_json) ?? null;
  if (!card) {
   cards.set(row.season_id, {
    seasonId: row.season_id, label: row.label, slots: [row.slot as RosterSlot], times: 1, firstAt: row.rostered_at, lastAt: row.rostered_at,
    best: { wins: row.wins, losses: row.losses, line }, stickers: stickers.get(row.season_id) ?? []
   });
   continue;
  }
  card.times++;
  card.lastAt = row.rostered_at;
  card.label = row.label;
  if (!card.slots.includes(row.slot as RosterSlot)) card.slots.push(row.slot as RosterSlot);
  if (row.wins > card.best.wins) card.best = { wins: row.wins, losses: row.losses, line };
 }
 return [...cards.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.seasonId.localeCompare(b.seasonId));
}

/** A sticker a season earned for the first time, with the card's name for Results. */
export interface NewSticker { seasonId: string; label: string; kind: string; title: string }

export interface NewCard { seasonId: string; label: string }

/** Player-seasons the season saved under `seasonKey` added to the collection: no other saved season rostered them. */
export async function newCards(db: Db, seasonKey: string, profiles: readonly { seasonId: string; displayName: string; year: number }[]): Promise<NewCard[]> {
 const names = new Map(profiles.map(profile => [profile.seasonId, `${profile.displayName} ${profile.year}`]));
 const rows = await db.all<Row & { season_id: string }>(
  'SELECT season_id FROM rostered r WHERE season_key = ? AND NOT EXISTS (SELECT 1 FROM rostered o WHERE o.season_id = r.season_id AND o.season_key <> r.season_key) ORDER BY season_id',
  [seasonKey]
 );
 return rows.map(row => ({ seasonId: row.season_id, label: names.get(row.season_id) ?? row.season_id }));
}

/** Stickers first earned by the season saved under `seasonKey` at `earnedAt`. */
export async function newStickers(db: Db, seasonKey: string, earnedAt: string, profiles: readonly { seasonId: string; displayName: string; year: number }[]): Promise<NewSticker[]> {
 const names = new Map(profiles.map(profile => [profile.seasonId, `${profile.displayName} ${profile.year}`]));
 const rows = await db.all<StickerRow>('SELECT * FROM stickers WHERE season_key = ? AND earned_at = ? ORDER BY season_id, kind', [seasonKey, earnedAt]);
 return rows.flatMap(row => {
  const definition = STICKER_BY_KIND.get(row.kind);
  return definition ? [{ seasonId: row.season_id, label: names.get(row.season_id) ?? row.season_id, kind: row.kind, title: definition.title }] : [];
 });
}
