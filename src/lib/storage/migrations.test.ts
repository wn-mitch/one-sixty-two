import { describe, expect, it } from 'vitest';
import { readLibrary, type LibraryEntry } from '../game/library.ts';
import { loadSeriesHistory } from '../game/series-history.ts';
import { collectionStatements } from '../collection/collection.ts';
import { seasonStatements } from './season-rows.ts';
import { completionReward, readShop } from '../cosmetics/ledger.ts';
import { NO_LEGACY } from './legacy.ts';
import { migrate, MIGRATIONS, SCHEMA_VERSION, type Migration } from './migrations.ts';
import { memoryDb } from './test-db.ts';

const entry = (key: string, wins: number, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
 key, savedAt: `2026-01-0${wins % 9 + 1}T00:00:00.000Z`, token: `token-${key}`, schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: 'data',
 record: { wins, losses: 162 - wins }, runs: { scored: 800, allowed: 600 },
 batting: [{ seasonId: 'b:2001:NL:SFN', label: 'B 2001', slot: 'LF', PA: 600, AB: 500, H: 150, doubles: 30, triples: 2, HR: 45, BB: 90, HBP: 5, SF: 5, RBI: 110, SB: 10, war: 7 }],
 pitching: [{ seasonId: 'p:1999:AL:BOS', label: 'P 1999', slot: 'SP1', outs: 600, H: 150, BB: 40, SO: 280, R: 60, starts: 54, war: 8 }],
 stadium: { id: 'SFN-2025', name: 'Oracle Park' },
 roster: [{ seasonId: 'p:1999:AL:BOS', label: 'P 1999', slot: 'SP1' }, { seasonId: 'b:2001:NL:SFN', label: 'B 2001', slot: 'LF' }],
 mvp: { seasonId: 'b:2001:NL:SFN', label: 'B 2001' },
 ...extra
});

describe('device database migrations', () => {
 it('creates the current schema on a fresh database', async () => {
  const { db, raw } = await memoryDb();
  expect(raw.selectValue('PRAGMA user_version')).toBe(SCHEMA_VERSION);
  expect(await db.all('SELECT * FROM draft')).toEqual([]);
  expect(await readLibrary(db)).toEqual([]);
 });

 it('imports legacy localStorage saves once, skipping malformed entries rather than repairing them', async () => {
  const series = { id: 's1', playedAt: '2026-01-02', link: '/h2h#a', championKey: 'k1', teams: [{ libraryKey: 'k1', name: 'A', seed: 1, wins: 3 }, { libraryKey: 'k2', name: 'B', seed: 2, wins: 1 }] };
  const legacy = {
   draft: '{"saved":"run"}',
   library: JSON.stringify([
    entry('k1', 120, { nickname: 'Machine' }),
    { key: 'broken' },
    entry('k2', 90, { roster: [{ seasonId: 7 }] as unknown as LibraryEntry['roster'] }),
    entry('k3', 80),
    entry('k1', 1)
   ]),
   series: JSON.stringify([series, { id: 'bad' }])
  };
  const { db, raw } = await memoryDb(legacy);
  expect(await db.all('SELECT json FROM draft')).toEqual([{ json: '{"saved":"run"}' }]);
  const library = await readLibrary(db);
  // Legacy order (newest first) survives; the first copy of a duplicated key wins.
  expect(library.map(item => item.key)).toEqual(['k1', 'k3']);
  expect(library[0]).toEqual(entry('k1', 120, { nickname: 'Machine' }));
  expect(await loadSeriesHistory(db)).toEqual([series]);
  // Re-running is a no-op: the import belongs to migration 1 only.
  migrate(raw, { ...legacy, draft: '{"other":1}' });
  expect(await db.all('SELECT json FROM draft')).toEqual([{ json: '{"saved":"run"}' }]);
 });

 it('adds Draft Mode runs to a version 2 database without touching its saves', async () => {
  const { db, raw } = await memoryDb({ ...NO_LEGACY, draft: '{"saved":"run"}', library: JSON.stringify([entry('k1', 120)]) }, MIGRATIONS.filter(step => step.version <= 2));
  const before = { library: await readLibrary(db), rostered: await db.all('SELECT * FROM rostered'), draft: await db.all('SELECT json FROM draft') };
  expect(await db.all("SELECT name FROM sqlite_master WHERE name = 'draft_runs'")).toEqual([]);
  expect(migrate(raw, NO_LEGACY)).toEqual({ from: 2, to: SCHEMA_VERSION });
  const after = { library: await readLibrary(db), rostered: await db.all('SELECT * FROM rostered'), draft: await db.all('SELECT json FROM draft') };
  expect({ ...after, rostered: after.rostered.map(({ is_mvp: _isMvp, ...row }) => row) }).toEqual(before);
  expect(await db.all('SELECT season_id, is_mvp FROM rostered WHERE season_key = ? ORDER BY season_id', ['k1'])).toEqual([
   { season_id: 'b:2001:NL:SFN', is_mvp: 1 },
   { season_id: 'p:1999:AL:BOS', is_mvp: 0 }
  ]);
  expect(before.rostered).toHaveLength(2);
  expect(await db.all('SELECT * FROM draft_runs')).toEqual([]);
 });

 it('adds a season to saved Draft Mode runs without touching them', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 3));
  await db.run([{ sql: "INSERT INTO draft_runs VALUES ('run', 'a', 'b', '{}', '[]', 'window')" }]);
  expect(migrate(raw, NO_LEGACY)).toEqual({ from: 3, to: SCHEMA_VERSION });
  expect(await db.all('SELECT * FROM draft_runs')).toEqual([{ id: 'run', created_at: 'a', updated_at: 'b', setup_json: '{}', actions_json: '[]', phase: 'window', season_json: null, resume_state: 'active' }]);
 });

 it('moves default-placed stickers to the frame edges and keeps one tier per family per season', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 4));
  const sticker = (seasonId: string, kind: string, seasonKey: string | null, x: number, y: number) =>
   ({ sql: 'INSERT INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden) VALUES (?, ?, ?, ?, ?, ?, 0)', bind: [seasonId, kind, 't', seasonKey, x, y] });
  await db.run([
   sticker('a', 'perfect', 'k1', 0.83, 0.3),
   sticker('a', 'wins-120', 'k1', 0.83, 0.3),
   sticker('a', 'wins-100', 'k1', 0.83, 0.3),
   sticker('a', 'hr-40', 'k1', 0.42, 0.15),
   sticker('b', 'wins-100', 'k0', 0.83, 0.3),
   sticker('b', 'wins-120', 'k1', 0.83, 0.3),
   sticker('b', 'drafted-5', 'k0', 0.62, 0.71),
   sticker('b', 'drafted-10', 'k1', 0.62, 0.71)
  ]);
  expect(migrate(raw, NO_LEGACY, MIGRATIONS.filter(step => step.version <= 6))).toEqual({ from: 4, to: 6 });
  expect(await db.all('SELECT season_id, kind, season_key, x, y FROM stickers ORDER BY season_id, kind')).toEqual([
   // A player-moved sticker keeps its spot.
   { season_id: 'a', kind: 'hr-40', season_key: 'k1', x: 0.42, y: 0.15 },
   { season_id: 'a', kind: 'perfect', season_key: 'k1', x: 0.9, y: 0.2 },
   { season_id: 'b', kind: 'drafted-10', season_key: 'k1', x: 0.9, y: 0.5 },
   { season_id: 'b', kind: 'drafted-5', season_key: 'k0', x: 0.9, y: 0.5 },
   // Tiers earned in different seasons are both kept.
   { season_id: 'b', kind: 'wins-100', season_key: 'k0', x: 0.9, y: 0.2 },
   { season_id: 'b', kind: 'wins-120', season_key: 'k1', x: 0.9, y: 0.2 }
  ]);
 });

 it('puts the grade atop the right column and steps the right-column defaults down', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 6));
  const sticker = (seasonId: string, kind: string, x: number, y: number) =>
   ({ sql: 'INSERT INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden) VALUES (?, ?, ?, ?, ?, ?, 0)', bind: [seasonId, kind, 't', 'k', x, y] });
  await db.run([
   sticker('a', 'grade-a', 0.9, 0.96), sticker('a', 'wins-100', 0.9, 0.2), sticker('a', 'hr-40', 0.9, 0.3),
   sticker('a', 'rbi-130', 0.9, 0.4), sticker('a', 'drafted-5', 0.9, 0.5), sticker('a', 'mvp', 0.1, 0.2),
   sticker('b', 'grade-f', 0.5, 0.5)
  ]);
  expect(migrate(raw, NO_LEGACY)).toEqual({ from: 6, to: SCHEMA_VERSION });
  expect(await db.all('SELECT season_id, kind, x, y FROM stickers ORDER BY season_id, y')).toEqual([
   { season_id: 'a', kind: 'grade-a', x: 0.9, y: 0.2 },
   // Left-column stickers keep their spots.
   { season_id: 'a', kind: 'mvp', x: 0.1, y: 0.2 },
   { season_id: 'a', kind: 'wins-100', x: 0.9, y: 0.3 },
   { season_id: 'a', kind: 'hr-40', x: 0.9, y: 0.4 },
   { season_id: 'a', kind: 'rbi-130', x: 0.9, y: 0.5 },
   { season_id: 'a', kind: 'drafted-5', x: 0.9, y: 0.6 },
   // A player-placed grade stays put.
   { season_id: 'b', kind: 'grade-f', x: 0.5, y: 0.5 }
  ]);
 });

 it('lifts stickers at the frame-edge defaults clear of the name band', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 5));
  const sticker = (seasonId: string, kind: string, x: number, y: number) =>
   ({ sql: 'INSERT INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden) VALUES (?, ?, ?, ?, ?, ?, 0)', bind: [seasonId, kind, 't', 'k', x, y] });
  await db.run([sticker('a', 'sb-30', 0.1, 0.67), sticker('a', 'drafted-5', 0.9, 0.67), sticker('b', 'sb-30', 0.3, 0.8), sticker('b', 'k-400', 0.9, 0.37)]);
  expect(migrate(raw, NO_LEGACY, MIGRATIONS.filter(step => step.version <= 6))).toEqual({ from: 5, to: 6 });
  expect(await db.all('SELECT season_id, kind, x, y FROM stickers ORDER BY season_id, kind')).toEqual([
   { season_id: 'a', kind: 'drafted-5', x: 0.9, y: 0.5 },
   { season_id: 'a', kind: 'sb-30', x: 0.1, y: 0.5 },
   { season_id: 'b', kind: 'k-400', x: 0.9, y: 0.3 },
   // A player-placed sticker stays put.
   { season_id: 'b', kind: 'sb-30', x: 0.3, y: 0.8 }
  ]);
 });

 it('awards season WAR stickers from saved lines, one top step per rostering', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 7));
  const rostering = (seasonId: string, key: string, at: string, line: object | null) =>
   ({ sql: 'INSERT INTO rostered (season_id, season_key, rostered_at, label, slot, wins, losses, line_json) VALUES (?, ?, ?, ?, ?, 130, 32, ?)', bind: [seasonId, key, at, seasonId, 'LF', line ? JSON.stringify(line) : null] });
  await db.run([
   rostering('a', 'k1', '2026-01-01', { war: 17.2 }),
   rostering('a', 'k2', '2026-02-01', { war: 14 }),
   rostering('b', 'k1', '2026-01-01', { war: 13.99 }),
   rostering('f', 'k1', '2026-01-01', { war: 22.4 }),
   // Lines saved before WAR was kept, and rosterings with no line, earn nothing.
   rostering('c', 'k1', '2026-01-01', { HR: 40 }),
   rostering('d', 'k1', '2026-01-01', null),
   rostering('e', 'k1', '2026-01-01', { war: 25 }),
   // A WAR sticker the player already placed and hid is left alone.
   { sql: 'INSERT INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden) VALUES (?, ?, ?, ?, ?, ?, 1)', bind: ['e', 'war-22', 'earlier', 'k0', 0.3, 0.3] }
  ]);
  expect(migrate(raw, NO_LEGACY)).toEqual({ from: 7, to: SCHEMA_VERSION });
  expect(await db.all('SELECT season_id, kind, earned_at, season_key, x, y, hidden FROM stickers ORDER BY season_id, kind')).toEqual([
   { season_id: 'a', kind: 'war-14', earned_at: '2026-02-01', season_key: 'k2', x: 0.9, y: 0.9, hidden: 0 },
   { season_id: 'a', kind: 'war-16', earned_at: '2026-01-01', season_key: 'k1', x: 0.9, y: 0.9, hidden: 0 },
   { season_id: 'e', kind: 'war-22', earned_at: 'earlier', season_key: 'k0', x: 0.3, y: 0.3, hidden: 1 },
   { season_id: 'f', kind: 'war-22', earned_at: '2026-01-01', season_key: 'k1', x: 0.9, y: 0.9, hidden: 0 }
  ]);
 });
 it('backfills MVP credit from retained seasons and deleted-season sticker provenance', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 10));
  const retained = entry('retained', 120);
  const deleted = entry('deleted', 100);
  await db.run([
   ...seasonStatements(deleted, deleted.savedAt), ...collectionStatements(deleted, deleted.savedAt),
   ...seasonStatements(retained, retained.savedAt), ...collectionStatements(retained, retained.savedAt),
   { sql: "UPDATE stickers SET x = 0.3, y = 0.92, hidden = 1 WHERE kind = 'mvp' AND season_key = 'deleted'" },
   { sql: "DELETE FROM seasons WHERE key = 'deleted'" }
  ]);
  const before = {
   seasons: await db.all('SELECT * FROM seasons'),
   rostered: await db.all('SELECT * FROM rostered'),
   stickers: await db.all('SELECT * FROM stickers')
  };
  expect(migrate(raw, NO_LEGACY, MIGRATIONS.filter(step => step.version <= 11))).toEqual({ from: 10, to: 11 });
  const after = {
   seasons: await db.all('SELECT * FROM seasons'),
   rostered: await db.all('SELECT * FROM rostered'),
   stickers: await db.all('SELECT * FROM stickers')
  };
  expect(after.seasons).toEqual(before.seasons);
  expect(after.stickers).toEqual(before.stickers);
  expect(after.rostered.map(({ is_mvp: _isMvp, ...row }) => row)).toEqual(before.rostered);
  expect(await db.all('SELECT season_key, season_id, is_mvp FROM rostered ORDER BY season_key, season_id')).toEqual([
   { season_key: 'deleted', season_id: 'b:2001:NL:SFN', is_mvp: 1 },
   { season_key: 'deleted', season_id: 'p:1999:AL:BOS', is_mvp: 0 },
   { season_key: 'retained', season_id: 'b:2001:NL:SFN', is_mvp: 1 },
   { season_key: 'retained', season_id: 'p:1999:AL:BOS', is_mvp: 0 }
  ]);
 });

 it('adds the daily slot and an unmarked daily column without touching saved seasons or the Classic draft', async () => {
  const { db, raw } = await memoryDb({ ...NO_LEGACY, draft: '{"saved":"run"}', library: JSON.stringify([entry('kept', 120)]) }, MIGRATIONS.filter(step => step.version <= 11));
  const before = { seasons: await db.all('SELECT * FROM seasons'), draft: await db.all('SELECT * FROM draft') };
  expect(migrate(raw, NO_LEGACY, MIGRATIONS.filter(step => step.version <= 12))).toEqual({ from: 11, to: 12 });
  expect(await db.all('SELECT * FROM seasons')).toEqual(before.seasons.map(row => ({ ...row, daily: null })));
  expect(await db.all('SELECT * FROM draft')).toEqual(before.draft);
  expect(await db.all('SELECT * FROM daily_runs')).toEqual([]);
  // A run is either in progress or finished with a full result.
  await expect(db.run([{ sql: "INSERT INTO daily_runs (date, started_at, updated_at) VALUES ('2026-10-17', 'now', 'now')" }])).rejects.toThrow();
  await expect(db.run([{ sql: "INSERT INTO daily_runs (date, started_at, updated_at, season_key, wins) VALUES ('2026-10-17', 'now', 'now', 'k', 100)" }])).rejects.toThrow();
 });
 it('adds an empty device identity and an unsubmitted state to existing daily runs', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 12));
  await db.run([
   { sql: "INSERT INTO daily_runs (date, started_at, updated_at, json) VALUES ('2026-10-19', 'then', 'then', '{\"run\":1}')" },
   { sql: "INSERT INTO daily_runs (date, started_at, updated_at, season_key, wins, losses) VALUES ('2026-10-18', 'then', 'then', 'k', 120, 42)" }
  ]);
  const before = await db.all('SELECT * FROM daily_runs ORDER BY date');
  expect(migrate(raw, NO_LEGACY, MIGRATIONS.filter(step => step.version <= 13))).toEqual({ from: 12, to: 13 });
  expect(await db.all('SELECT * FROM daily_runs ORDER BY date')).toEqual(before.map(row => ({ ...row, submission: null })));
  expect(await db.all('SELECT * FROM device_identity')).toEqual([]);
  // One device token at most, and a submission can only be answered one of two ways.
  await db.run([{ sql: "INSERT INTO device_identity (id, token) VALUES (1, 'a')" }]);
  await expect(db.run([{ sql: "INSERT INTO device_identity (id, token) VALUES (2, 'b')" }])).rejects.toThrow();
  await expect(db.run([{ sql: "UPDATE daily_runs SET submission = 'pending'" }])).rejects.toThrow();
 });
 it('seeds zero-credit receipts for existing and deleted history without altering historical data', async () => {
  const { db, raw } = await memoryDb({
   ...NO_LEGACY, draft: '{"saved":"run"}', library: JSON.stringify([entry('kept', 120), entry('deleted', 90)])
  }, MIGRATIONS.filter(step => step.version <= 8));
  await db.run([
   { sql: "DELETE FROM seasons WHERE key = 'deleted'" },
   { sql: 'INSERT INTO rostered VALUES (?, ?, ?, ?, ?, ?, ?, ?)', bind: ['other', 'rostered-only', 'earlier', 'Example', 'LF', 0, 0, null] },
   ...[
    ['complete', JSON.stringify({ chapters: Array(6).fill({}) })],
    ['incomplete', JSON.stringify({ chapters: Array(5).fill({}) })],
    ['no-season', null],
    ['malformed', '{'],
    ['not-array', JSON.stringify({ chapters: 'six chapters' })]
   ].map(([id, season]) => ({
    sql: 'INSERT INTO draft_runs (id, created_at, updated_at, setup_json, actions_json, phase, season_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    bind: [id, 'created', 'updated', '{}', '[]', 'complete', season]
   }))
  ]);
  const tables = ['draft', 'seasons', 'season_cards', 'rostered', 'stickers', 'series'] as const;
  const before = await Promise.all(tables.map(table => db.all(`SELECT * FROM ${table}`)));
  const runs = await db.all('SELECT * FROM draft_runs');
  expect(migrate(raw, NO_LEGACY, MIGRATIONS.filter(step => step.version <= 11))).toEqual({ from: 8, to: 11 });
  const after = await Promise.all(tables.map(table => db.all(`SELECT * FROM ${table}`)));
  expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
  expect(after[3].map(({ is_mvp: _isMvp, ...row }) => row)).toEqual(before[3]);
  expect(after.slice(4)).toEqual(before.slice(4));
  expect(await db.all('SELECT season_id, season_key, is_mvp FROM rostered ORDER BY season_key, season_id')).toEqual([
   { season_id: 'b:2001:NL:SFN', season_key: 'deleted', is_mvp: 1 },
   { season_id: 'p:1999:AL:BOS', season_key: 'deleted', is_mvp: 0 },
   { season_id: 'b:2001:NL:SFN', season_key: 'kept', is_mvp: 1 },
   { season_id: 'p:1999:AL:BOS', season_key: 'kept', is_mvp: 0 },
   { season_id: 'other', season_key: 'rostered-only', is_mvp: 0 }
  ]);
  expect(await db.all('SELECT * FROM draft_runs')).toEqual(runs.map(run => ({ ...run, resume_state: 'active' })));
  expect(await db.all('SELECT key, credit FROM shop_completions ORDER BY key')).toEqual([
   { key: 'classic:deleted', credit: 0 },
   { key: 'classic:kept', credit: 0 },
   { key: 'classic:rostered-only', credit: 0 },
   { key: 'draft:complete', credit: 0 }
  ]);
  expect(await readShop(db)).toMatchObject({ balance: 0, owned: [], equipped: {} });
  await db.run([
   ...completionReward('classic:deleted', 'later'),
   ...completionReward('classic:kept', 'later'),
   ...completionReward('classic:rostered-only', 'later'),
   ...completionReward('draft:complete', 'later')
  ]);
  expect((await readShop(db)).balance).toBe(0);
  await db.run(completionReward('draft:incomplete', 'later'));
  expect((await readShop(db)).balance).toBe(1);
  expect(migrate(raw, NO_LEGACY, MIGRATIONS.filter(step => step.version <= 11))).toEqual({ from: 11, to: 11 });
  expect((await readShop(db)).balance).toBe(1);
 });

 it('leaves the database at the last good version when a migration fails', async () => {
  const failing: Migration[] = [...MIGRATIONS, {
   version: SCHEMA_VERSION + 1,
   up(db) {
    db.exec({ sql: 'CREATE TABLE half_done (id INTEGER)' });
    db.exec({ sql: "UPDATE seasons SET nickname = 'clobbered'" });
    throw new Error('step failed');
   }
  }];
  const { db, raw } = await memoryDb({ ...NO_LEGACY, library: JSON.stringify([entry('k1', 100)]) });
  expect(() => migrate(raw, NO_LEGACY, failing)).toThrow('step failed');
  expect(raw.selectValue('PRAGMA user_version')).toBe(SCHEMA_VERSION);
  expect(await db.all("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toEqual([]);
  expect((await readLibrary(db))[0].nickname).toBeUndefined();
 });

 it('refuses a database written by a newer game', async () => {
  const { raw } = await memoryDb();
  raw.exec({ sql: `PRAGMA user_version = ${SCHEMA_VERSION + 1}` });
  expect(() => migrate(raw, NO_LEGACY)).toThrow('newer version');
 });
});
