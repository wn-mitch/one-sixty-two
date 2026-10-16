import { describe, expect, it } from 'vitest';
import type { LibraryEntry } from '../game/library.ts';
import { NO_LEGACY } from '../storage/legacy.ts';
import { migrate, MIGRATIONS } from '../storage/migrations.ts';
import { seasonStatements } from '../storage/season-rows.ts';
import { memoryDb } from '../storage/test-db.ts';
import { collectionStatements, loadCollection, loadStickers, moveSticker, newCards, setStickerHidden, stickersFromSeason } from './collection.ts';

const SLUGGER = 'slug:2001:NL:SFN';
const ARM = 'arm:1999:AL:BOS';

function entry(key: string, wins: number, savedAt: string, hr = 10): LibraryEntry {
 return {
  key, savedAt, token: `token-${key}`, schemaVersion: 5, modelVersion: 'contact-v1', dataVersion: 'data',
  record: { wins, losses: 162 - wins }, runs: { scored: 800, allowed: 600 },
  batting: [{ seasonId: SLUGGER, label: 'Slugger 2001', slot: 'LF', PA: 650, AB: 560, H: 140, doubles: 30, triples: 2, HR: hr, BB: 40, HBP: 5, SF: 5, RBI: 80, SB: 5, war: 3 }],
  pitching: [{ seasonId: ARM, label: 'Arm 1999', slot: 'SP1', outs: 900, H: 200, BB: 60, SO: 150, R: 150, starts: 54, war: 4 }],
  stadium: null,
  roster: [{ seasonId: SLUGGER, label: 'Slugger 2001', slot: 'LF' }, { seasonId: ARM, label: 'Arm 1999', slot: 'SP1' }]
 };
}
const mvpEntry = (key: string, wins: number, savedAt: string, seasonId: string, hr = 10): LibraryEntry =>
 ({ ...entry(key, wins, savedAt, hr), mvp: { seasonId, label: seasonId } });
const save = (item: LibraryEntry) => [...seasonStatements(item, item.savedAt), ...collectionStatements(item, item.savedAt)];
const day = (index: number) => new Date(Date.UTC(2026, 0, index + 1)).toISOString();

describe('collection', () => {
 it('counts each saved season once, keeps the first sticker date, and survives a library deletion', async () => {
  const { db } = await memoryDb();
  await db.run(save(entry('k1', 100, day(0), 45)));
  await db.run(save({ ...entry('k1', 100, day(5), 45) }));
  await db.run(save(entry('k2', 19, day(1))));
  await db.run([{ sql: "DELETE FROM seasons WHERE key = 'k1'" }]);
  const cards = await loadCollection(db);
  const slugger = cards.find(card => card.seasonId === SLUGGER)!;
  expect(slugger).toMatchObject({ times: 2, firstAt: day(0), lastAt: day(1), best: { wins: 100, losses: 62 } });
  expect(slugger.best.line).toMatchObject({ HR: 45 });
  expect(slugger.stickers.map(sticker => [sticker.kind, sticker.earnedAt])).toEqual([['grade-f', day(0)], ['hr-40', day(0)], ['wins-100', day(0)]]);
  // Every card on a complete season earns its grade once; a later season with the same grade, below every team tier, adds nothing.
  expect((await stickersFromSeason(db, 'k2'))).toEqual([]);
 });
 it('counts distinct completed MVP awards once per season and keeps the award after deletion', async () => {
  const { db } = await memoryDb();
  await db.run(save(mvpEntry('k1', 100, day(0), SLUGGER)));
  await db.run(save(mvpEntry('k2', 90, day(1), SLUGGER)));
  await moveSticker(db, SLUGGER, 'mvp', 0.3, 1.5);
  await setStickerHidden(db, SLUGGER, 'mvp', true);
  // Re-saving k2 twice is the same season, while k3 rosters the card without making it MVP.
  await db.run(save(mvpEntry('k2', 90, day(2), SLUGGER)));
  await db.run(save(mvpEntry('k2', 90, day(2), ARM)));
  await db.run(save(mvpEntry('k3', 80, day(3), ARM)));

  const sluggerMvp = (await loadStickers(db)).get(SLUGGER)!.find(sticker => sticker.kind === 'mvp')!;
  expect(sluggerMvp).toMatchObject({ count: 2, x: 0.3, y: 0.92, hidden: true });
  expect((await stickersFromSeason(db, 'k1')).find(item => item.sticker.kind === 'mvp')?.sticker).toMatchObject({ count: 2, x: 0.3, hidden: true });
  expect((await loadStickers(db)).get(SLUGGER)!.find(sticker => sticker.kind === 'grade-f')).not.toHaveProperty('count');
  expect(await db.all('SELECT season_key, is_mvp FROM rostered WHERE season_id = ? ORDER BY season_key', [SLUGGER])).toEqual([
   { season_key: 'k1', is_mvp: 1 }, { season_key: 'k2', is_mvp: 1 }, { season_key: 'k3', is_mvp: 0 }
  ]);
  expect((await loadStickers(db)).get(ARM)!.find(sticker => sticker.kind === 'mvp')).toMatchObject({ count: 2 });

  await db.run([{ sql: "DELETE FROM seasons WHERE key IN ('k1', 'k2', 'k3')" }]);
  expect((await loadStickers(db)).get(SLUGGER)!.find(sticker => sticker.kind === 'mvp')).toMatchObject({ count: 2, x: 0.3, hidden: true });
  expect((await loadStickers(db)).get(ARM)!.find(sticker => sticker.kind === 'mvp')).toMatchObject({ count: 2 });
 });
 it('defaults an orphan legacy MVP sticker to one award', async () => {
  const { db } = await memoryDb();
  await db.run([{ sql: 'INSERT INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden) VALUES (?, ?, ?, ?, ?, ?, ?)', bind: ['orphan', 'mvp', 'legacy', null, 0.1, 0.2, 0] }]);
  expect((await loadStickers(db)).get('orphan')).toEqual([{ kind: 'mvp', count: 1, x: 0.1, y: 0.2, hidden: false, earnedAt: 'legacy' }]);
 });

 it('reports only player-seasons no earlier season rostered as new cards, even after a re-save', async () => {
  const { db } = await memoryDb();
  const profiles = [{ seasonId: SLUGGER, displayName: 'Slugger', year: 2001 }, { seasonId: ARM, displayName: 'Arm', year: 1999 }];
  await db.run(save(entry('k1', 90, day(0))));
  expect(await newCards(db, 'k1', profiles)).toEqual([{ seasonId: ARM, label: 'Arm 1999' }, { seasonId: SLUGGER, label: 'Slugger 2001' }]);
  await db.run(save(entry('k1', 90, day(1))));
  expect(await newCards(db, 'k1', profiles)).toHaveLength(2);
  const next = entry('k2', 80, day(2));
  next.roster = [...next.roster, { seasonId: 'fresh:2010:AL:NYA', label: 'Fresh 2010', slot: 'CF' }];
  await db.run(save(next));
  expect(await newCards(db, 'k2', profiles)).toEqual([{ seasonId: 'fresh:2010:AL:NYA', label: 'fresh:2010:AL:NYA' }]);
 });

 it('awards times-drafted stickers on the season that reaches them', async () => {
  const { db } = await memoryDb();
  for (let index = 0; index < 10; index++) await db.run(save(entry(`k${index}`, 70, day(index))));
  const stickers = (await loadStickers(db)).get(ARM)!;
  expect(stickers.map(sticker => [sticker.kind, sticker.earnedAt])).toEqual([['grade-f', day(0)], ['wins-60', day(0)], ['drafted-3', day(2)], ['drafted-5', day(4)], ['drafted-10', day(9)]]);
  expect((await stickersFromSeason(db, 'k4')).map(item => item.sticker.kind)).toEqual(['drafted-5', 'drafted-5']);
 });

 it('moves and hides a whole sticker family on its own card only', async () => {
  const { db } = await memoryDb();
  // Two runs leave both power tiers on the card; every tier of the family moves together.
  await db.run(save(entry('k0', 90, day(0), 45)));
  await db.run(save(entry('k1', 90, day(0), 65)));
  await moveSticker(db, SLUGGER, 'power', 0.3, 1.5);
  await setStickerHidden(db, SLUGGER, 'power', true);
  const stickers = (await loadStickers(db)).get(SLUGGER)!.filter(sticker => sticker.kind.startsWith('hr-'));
  expect(stickers.map(({ kind, x, y, hidden }) => ({ kind, x, y, hidden }))).toEqual([
   { kind: 'hr-40', x: 0.3, y: 0.92, hidden: true },
   { kind: 'hr-60', x: 0.3, y: 0.92, hidden: true }
  ]);
  // A re-save neither resets the placement nor re-shows the family.
  await db.run(save(entry('k1', 90, day(1), 65)));
  expect((await loadStickers(db)).get(SLUGGER)!.find(sticker => sticker.kind === 'hr-60')).toMatchObject({ x: 0.3, hidden: true });
 });

 it('backfills the collection from a library saved before it existed', async () => {
  const { db, raw } = await memoryDb(NO_LEGACY, MIGRATIONS.slice(0, 1));
  for (let index = 0; index < 5; index++) await db.run(seasonStatements(entry(`k${index}`, 101, day(index)), day(index)));
  migrate(raw, NO_LEGACY);
  const cards = await loadCollection(db);
  expect(cards.map(card => [card.seasonId, card.times])).toEqual([[ARM, 5], [SLUGGER, 5]]);
  expect((await loadStickers(db)).get(ARM)!.map(sticker => [sticker.kind, sticker.earnedAt])).toEqual([['grade-f', day(0)], ['wins-100', day(0)], ['drafted-3', day(2)], ['drafted-5', day(4)]]);
 });
});
