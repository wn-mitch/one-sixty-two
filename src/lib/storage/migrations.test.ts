import { describe, expect, it } from 'vitest';
import { readLibrary } from '../game/library.ts';
import { loadSeriesHistory } from '../game/series-history.ts';
import type { LibraryEntry } from '../game/library.ts';
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
  expect({ library: await readLibrary(db), rostered: await db.all('SELECT * FROM rostered'), draft: await db.all('SELECT json FROM draft') }).toEqual(before);
  expect(before.rostered).toHaveLength(2);
  expect(await db.all('SELECT * FROM draft_runs')).toEqual([]);
 });

 it('adds a season to saved Draft Mode runs without touching them', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.filter(step => step.version <= 3));
  await db.run([{ sql: "INSERT INTO draft_runs VALUES ('run', 'a', 'b', '{}', '[]', 'window')" }]);
  expect(migrate(raw, NO_LEGACY)).toEqual({ from: 3, to: SCHEMA_VERSION });
  expect(await db.all('SELECT * FROM draft_runs')).toEqual([{ id: 'run', created_at: 'a', updated_at: 'b', setup_json: '{}', actions_json: '[]', phase: 'window', season_json: null }]);
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
  expect(migrate(raw, NO_LEGACY)).toEqual({ from: 4, to: SCHEMA_VERSION });
  expect(await db.all('SELECT season_id, kind, season_key, x, y FROM stickers ORDER BY season_id, kind')).toEqual([
   // A player-moved sticker keeps its spot.
   { season_id: 'a', kind: 'hr-40', season_key: 'k1', x: 0.42, y: 0.15 },
   { season_id: 'a', kind: 'perfect', season_key: 'k1', x: 0.9, y: 0.22 },
   { season_id: 'b', kind: 'drafted-10', season_key: 'k1', x: 0.9, y: 0.67 },
   { season_id: 'b', kind: 'drafted-5', season_key: 'k0', x: 0.9, y: 0.67 },
   // Tiers earned in different seasons are both kept.
   { season_id: 'b', kind: 'wins-100', season_key: 'k0', x: 0.9, y: 0.22 },
   { season_id: 'b', kind: 'wins-120', season_key: 'k1', x: 0.9, y: 0.22 }
  ]);
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
