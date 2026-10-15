import { parseLegacyLibrary, parseLegacySeries, type LegacySaves } from './legacy.ts';
import { collectionStatements } from '../collection/collection.ts';
import { seasonEntries, seasonStatements, type CardRow, type SeasonRow } from './season-rows.ts';
import { json, query, type RawDb } from './sql.ts';

/**
 * One device-schema step. Steps run in order inside their own transaction together with the
 * `user_version` bump, so a failed step leaves the database at the previous version.
 * Never edit a released step; add the next one.
 */
export interface Migration { version: number; up(db: RawDb, legacy: LegacySaves): void }

function exec(db: RawDb, sql: string): void { db.exec({ sql }); }

export const MIGRATIONS: readonly Migration[] = [
 {
  version: 1,
  up(db, legacy) {
   exec(db, `CREATE TABLE draft (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
   )`);
   exec(db, `CREATE TABLE seasons (
    key TEXT PRIMARY KEY,
    saved_at TEXT NOT NULL,
    touched_at TEXT NOT NULL,
    token TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    data_version TEXT NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    runs_scored INTEGER NOT NULL,
    runs_allowed INTEGER NOT NULL,
    stadium_json TEXT,
    mvp_json TEXT,
    nickname TEXT
   )`);
   exec(db, `CREATE TABLE season_cards (
    season_key TEXT NOT NULL REFERENCES seasons (key) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    season_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    label TEXT NOT NULL,
    batting_index INTEGER,
    batting_json TEXT,
    pitching_index INTEGER,
    pitching_json TEXT,
    PRIMARY KEY (season_key, position)
   )`);
   exec(db, 'CREATE INDEX season_cards_by_card ON season_cards (season_id)');
   exec(db, `CREATE TABLE series (
    id TEXT PRIMARY KEY,
    recorded_at TEXT NOT NULL,
    json TEXT NOT NULL
   )`);

   // Import the localStorage saves. Legacy lists are newest first; older entries get earlier touch times.
   const now = Date.now();
   if (legacy.draft !== null) db.exec({ sql: 'INSERT INTO draft (id, json, updated_at) VALUES (1, ?, ?)', bind: [legacy.draft, new Date(now).toISOString()] });
   const library = parseLegacyLibrary(legacy.library);
   const seen = new Set<string>();
   library.forEach((entry, index) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    for (const statement of seasonStatements(entry, new Date(now - index).toISOString())) db.exec(statement);
   });
   parseLegacySeries(legacy.series).forEach((record, index) => {
    db.exec({ sql: 'INSERT OR IGNORE INTO series (id, recorded_at, json) VALUES (?, ?, ?)', bind: [record.id, new Date(now - index).toISOString(), json(record)] });
   });
  }
 },
 {
  version: 2,
  up(db) {
   // The collection: every rostering of a player-season (kept after a library deletion) and earned stickers.
   exec(db, `CREATE TABLE rostered (
    season_id TEXT NOT NULL,
    season_key TEXT NOT NULL,
    rostered_at TEXT NOT NULL,
    label TEXT NOT NULL,
    slot TEXT NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    line_json TEXT,
    PRIMARY KEY (season_id, season_key)
   )`);
   exec(db, 'CREATE INDEX rostered_by_time ON rostered (rostered_at)');
   exec(db, `CREATE TABLE stickers (
    season_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    season_key TEXT,
    x REAL NOT NULL,
    y REAL NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (season_id, kind)
   )`);
   // Backfill from the library in save order, so times-drafted stickers date from the season that reached them.
   const seasons = query<SeasonRow>(db, 'SELECT * FROM seasons ORDER BY saved_at, key');
   const entries = seasonEntries(seasons, query<CardRow>(db, 'SELECT * FROM season_cards'));
   for (const entry of entries) for (const statement of collectionStatements(entry, entry.savedAt)) db.exec(statement);
  }
 },
 {
  version: 3,
  up(db) {
   // Draft Mode runs: the setup and the player's action log, from which the run is replayed.
   exec(db, `CREATE TABLE draft_runs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    setup_json TEXT NOT NULL,
    actions_json TEXT NOT NULL,
    phase TEXT NOT NULL
   )`);
   exec(db, 'CREATE INDEX draft_runs_by_update ON draft_runs (updated_at)');
  }
 },
 {
  version: 4,
  up(db) {
   // A run's league season: lineups and played chapters, kept as results rather than replayed.
   exec(db, 'ALTER TABLE draft_runs ADD COLUMN season_json TEXT');
  }
 },
 {
  version: 5,
  up(db) {
   // Stickers move to the card's frame edges, and one season keeps only its top tier per family.
   // Spots and tiers are frozen here as they stood for this step.
   const families: Record<string, { kinds: readonly string[]; from: [number, number]; to: [number, number] }> = {
    mvp: { kinds: ['mvp'], from: [0.17, 0.3], to: [0.1, 0.22] },
    team: { kinds: ['perfect', 'wins-120', 'wins-100'], from: [0.83, 0.3], to: [0.9, 0.22] },
    contact: { kinds: ['hits-200'], from: [0.17, 0.49], to: [0.1, 0.37] },
    ace: { kinds: ['ace'], from: [0.17, 0.49], to: [0.1, 0.37] },
    power: { kinds: ['hr-60', 'hr-40'], from: [0.83, 0.49], to: [0.9, 0.37] },
    strikeouts: { kinds: ['k-600', 'k-400'], from: [0.83, 0.49], to: [0.9, 0.37] },
    eye: { kinds: ['obp-400'], from: [0.17, 0.68], to: [0.1, 0.52] },
    production: { kinds: ['rbi-130'], from: [0.83, 0.68], to: [0.9, 0.52] },
    closer: { kinds: ['closer'], from: [0.83, 0.68], to: [0.9, 0.52] },
    speed: { kinds: ['sb-30'], from: [0.38, 0.71], to: [0.1, 0.67] },
    loyalty: { kinds: ['drafted-10', 'drafted-5'], from: [0.62, 0.71], to: [0.9, 0.67] }
   };
   for (const { kinds, from, to } of Object.values(families)) {
    const list = kinds.map(() => '?').join(', ');
    // Stickers still at the old default spot move; ones the player placed stay where they put them.
    db.exec({ sql: `UPDATE stickers SET x = ?, y = ? WHERE kind IN (${list}) AND abs(x - ?) < 1e-6 AND abs(y - ?) < 1e-6`, bind: [...to, ...kinds, ...from] });
    // Kinds are listed highest tier first: drop each lower tier earned in the same season as a higher one.
    // Loyalty tiers are earned on separate saves and stay as the rostering history awarded them.
    if (kinds[0].startsWith('drafted-')) continue;
    kinds.forEach((kind, index) => {
     const higher = kinds.slice(0, index);
     if (higher.length === 0) return;
     db.exec({
      sql: `DELETE FROM stickers WHERE kind = ? AND EXISTS (SELECT 1 FROM stickers AS higher WHERE higher.season_id = stickers.season_id AND higher.season_key IS stickers.season_key AND higher.kind IN (${higher.map(() => '?').join(', ')}))`,
      bind: [kind, ...higher]
     });
    });
   }
  }
 },
 {
  version: 6,
  up(db) {
   // Default spots tighten up the frame edges so the lowest stickers clear the name band, and season
   // grades become stickers. Stickers
   // still at a step-5 default move; ones the player placed stay. Spots are frozen as of this step.
   const moves: readonly { kinds: readonly string[]; from: [number, number]; to: [number, number] }[] = [
    { kinds: ['mvp'], from: [0.1, 0.22], to: [0.1, 0.2] },
    { kinds: ['perfect', 'wins-120', 'wins-100'], from: [0.9, 0.22], to: [0.9, 0.2] },
    { kinds: ['hits-200', 'ace'], from: [0.1, 0.37], to: [0.1, 0.3] },
    { kinds: ['hr-60', 'hr-40', 'k-600', 'k-400'], from: [0.9, 0.37], to: [0.9, 0.3] },
    { kinds: ['obp-400'], from: [0.1, 0.52], to: [0.1, 0.4] },
    { kinds: ['rbi-130', 'closer'], from: [0.9, 0.52], to: [0.9, 0.4] },
    { kinds: ['sb-30'], from: [0.1, 0.67], to: [0.1, 0.5] },
    { kinds: ['drafted-10', 'drafted-5'], from: [0.9, 0.67], to: [0.9, 0.5] }
   ];
   for (const { kinds, from, to } of moves) {
    db.exec({ sql: `UPDATE stickers SET x = ?, y = ? WHERE kind IN (${kinds.map(() => '?').join(', ')}) AND abs(x - ?) < 1e-6 AND abs(y - ?) < 1e-6`, bind: [...to, ...kinds, ...from] });
   }
   // Every rostering on a complete season earns that season's grade sticker, dated from its first
   // rostering. Grade floors are frozen here as they stood for this step.
   db.exec({
    sql: `INSERT OR IGNORE INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden)
     SELECT season_id, CASE
      WHEN wins >= 162 THEN 'grade-perfect' WHEN wins >= 153 THEN 'grade-s-plus' WHEN wins >= 149 THEN 'grade-s'
      WHEN wins >= 145 THEN 'grade-aa' WHEN wins >= 139 THEN 'grade-a' WHEN wins >= 130 THEN 'grade-b'
      WHEN wins >= 120 THEN 'grade-c' WHEN wins >= 110 THEN 'grade-d' ELSE 'grade-f' END,
      rostered_at, season_key, 0.9, 0.96, 0
     FROM rostered WHERE wins + losses = 162 ORDER BY rostered_at`
   });
  }
 },
 {
  version: 7,
  up(db) {
   // The season grade heads the right column, and the right-column families each step down one spot.
   // Stickers still at a step-6 default move; ones the player placed stay. Kinds and spots are frozen as of this step.
   const moves: readonly { kinds: readonly string[]; from: [number, number]; to: [number, number] }[] = [
    { kinds: ['drafted-10', 'drafted-5'], from: [0.9, 0.5], to: [0.9, 0.6] },
    { kinds: ['rbi-130', 'closer'], from: [0.9, 0.4], to: [0.9, 0.5] },
    { kinds: ['hr-60', 'hr-40', 'k-600', 'k-400'], from: [0.9, 0.3], to: [0.9, 0.4] },
    { kinds: ['perfect', 'wins-120', 'wins-100'], from: [0.9, 0.2], to: [0.9, 0.3] },
    { kinds: ['grade-perfect', 'grade-s-plus', 'grade-s', 'grade-aa', 'grade-a', 'grade-b', 'grade-c', 'grade-d', 'grade-f'], from: [0.9, 0.96], to: [0.9, 0.2] }
   ];
   for (const { kinds, from, to } of moves) {
    db.exec({ sql: `UPDATE stickers SET x = ?, y = ? WHERE kind IN (${kinds.map(() => '?').join(', ')}) AND abs(x - ?) < 1e-6 AND abs(y - ?) < 1e-6`, bind: [...to, ...kinds, ...from] });
   }
  }
 },
 {
  version: 8,
  up(db) {
   // Season WAR becomes a sticker family. Every rostering whose saved line reached a step earns that
   // season's top step, dated from the rostering. Steps and the default spot are frozen as of this step.
   db.exec({
    sql: `INSERT OR IGNORE INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden)
     SELECT season_id, CASE
      WHEN war >= 22 THEN 'war-22' WHEN war >= 20 THEN 'war-20' WHEN war >= 18 THEN 'war-18'
      WHEN war >= 16 THEN 'war-16' ELSE 'war-14' END,
      rostered_at, season_key, 0.9, 0.9, 0
     FROM (SELECT season_id, season_key, rostered_at, json_extract(line_json, '$.war') AS war FROM rostered WHERE line_json IS NOT NULL)
     WHERE typeof(war) IN ('integer', 'real') AND war >= 14 ORDER BY rostered_at`
   });
  }
 },
 {
  version: 9,
  up(db) {
   exec(db, "ALTER TABLE draft_runs ADD COLUMN resume_state TEXT NOT NULL DEFAULT 'active'");
   exec(db, `CREATE TABLE shop_completions (
    key TEXT PRIMARY KEY NOT NULL,
    completed_at TEXT NOT NULL,
    credit INTEGER NOT NULL CHECK (typeof(credit) = 'integer' AND credit IN (0, 1))
   )`);
   exec(db, 'CREATE TABLE shop_owned (item_id TEXT PRIMARY KEY NOT NULL)');
   exec(db, `CREATE TABLE shop_equipped (
    tier TEXT PRIMARY KEY NOT NULL CHECK (tier IN ('foil', 'emboss', 'gem')),
    item_id TEXT NOT NULL REFERENCES shop_owned (item_id),
    colorway TEXT,
    CHECK (tier = 'gem' OR colorway IS NULL)
   )`);
   // Purchases serialize in SQLite, not in a tab's possibly stale view of its balance.
   exec(db, `CREATE TRIGGER shop_purchase_balance BEFORE INSERT ON shop_owned
    WHEN NOT EXISTS (SELECT 1 FROM shop_owned WHERE item_id = NEW.item_id)
     AND (SELECT COALESCE(SUM(credit), 0) FROM shop_completions) <= (SELECT COUNT(*) FROM shop_owned)
    BEGIN SELECT RAISE(ABORT, 'Not enough tokens. Complete a new season to earn one.'); END`);
   for (const operation of ['INSERT', 'UPDATE']) {
    exec(db, `CREATE TRIGGER shop_equip_owned_${operation.toLowerCase()} BEFORE ${operation} ON shop_equipped
     WHEN NOT EXISTS (SELECT 1 FROM shop_owned WHERE item_id = NEW.item_id)
     BEGIN SELECT RAISE(ABORT, 'Unlock this finish before equipping it.'); END`);
   }
   // Existing history establishes receipts, never starting credits. Collection history survives deletion.
   exec(db, `INSERT INTO shop_completions (key, completed_at, credit)
    SELECT 'classic:' || key, saved_at, 0 FROM seasons WHERE wins + losses = 162`);
   exec(db, `INSERT OR IGNORE INTO shop_completions (key, completed_at, credit)
    SELECT 'classic:' || season_key, MIN(rostered_at), 0 FROM rostered GROUP BY season_key`);
   // Six chapters constituted a completed Draft Mode season when this schema shipped.
   // CASE protects old malformed saves from JSON extraction errors without modifying their contents.
   exec(db, `INSERT INTO shop_completions (key, completed_at, credit)
    SELECT 'draft:' || id, updated_at, 0 FROM draft_runs
    WHERE CASE WHEN json_valid(season_json) THEN
     json_type(season_json, '$.chapters') = 'array' AND json_array_length(season_json, '$.chapters') >= 6
     ELSE 0 END`);
  }
 }
];

export const SCHEMA_VERSION = MIGRATIONS.at(-1)!.version;

export interface MigrationReport { from: number; to: number }

/** Brings the database up to the newest schema; throws (with the database at the last good version) on failure. */
export function migrate(db: RawDb, legacy: LegacySaves, migrations: readonly Migration[] = MIGRATIONS): MigrationReport {
 exec(db, 'PRAGMA foreign_keys = ON');
 const from = Number(db.selectValue('PRAGMA user_version'));
 const newest = migrations.at(-1)?.version ?? 0;
 if (from > newest) throw new Error(`Device data is from a newer version of the game (schema ${from}); reload to update.`);
 for (const migration of migrations) {
  if (migration.version <= from) continue;
  db.transaction(inner => {
   migration.up(inner, legacy);
   exec(inner, `PRAGMA user_version = ${migration.version}`);
  });
 }
 return { from, to: newest };
}
