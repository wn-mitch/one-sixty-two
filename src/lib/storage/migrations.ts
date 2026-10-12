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
