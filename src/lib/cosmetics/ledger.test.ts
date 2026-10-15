import { describe, expect, it } from 'vitest';
import { brokenDb, memoryDb } from '../storage/test-db.ts';
import type { CustomTier } from './catalogue.ts';
import { completionReward, equipCosmetic, readShop, unlockCosmetic } from './ledger.ts';

const plate = 'plate:brushed';
const otherPlate = 'plate:hammered';
const film = 'film:refractor';

describe('cosmetic token ledger', () => {
 it('starts empty and credits each completion identity only once', async () => {
  const { db } = await memoryDb();
  expect(await readShop(db)).toEqual({ balance: 0, owned: [], equipped: {} });
  await db.run(completionReward('classic:first', 'first'));
  await db.run(completionReward('classic:first', 'later'));
  await db.run(completionReward('draft:first', 'next'));
  expect((await readShop(db)).balance).toBe(2);
  expect(await db.all('SELECT * FROM shop_completions ORDER BY key')).toEqual([
   { key: 'classic:first', completed_at: 'first', credit: 1 },
   { key: 'draft:first', completed_at: 'next', credit: 1 }
  ]);
 });

 it('refuses purchases without credit, unknown items, and unowned equipment', async () => {
  const { db } = await memoryDb();
  await expect(unlockCosmetic(db, plate)).rejects.toThrow('Not enough tokens');
  await expect(unlockCosmetic(db, 'missing')).rejects.toThrow('Unknown cosmetic');
  await expect(equipCosmetic(db, 'foil', plate)).rejects.toThrow('Unlock this finish');
  expect(await readShop(db)).toEqual({ balance: 0, owned: [], equipped: {} });
 });

 it('serializes competing purchases against the actual balance', async () => {
  const { db } = await memoryDb();
  await db.run(completionReward('classic:first', 'first'));
  const attempts = await Promise.allSettled([unlockCosmetic(db, plate), unlockCosmetic(db, otherPlate)]);
  expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
  expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
  const snapshot = await readShop(db);
  expect(snapshot.balance).toBe(0);
  expect(snapshot.owned).toHaveLength(1);
 });

 it('makes simultaneous and repeated purchases of the same unlock free after the first', async () => {
  const { db } = await memoryDb();
  await db.run(completionReward('classic:first', 'first'));
  await Promise.all([unlockCosmetic(db, plate), unlockCosmetic(db, plate)]);
  await unlockCosmetic(db, plate);
  expect(await readShop(db)).toEqual({ balance: 0, owned: [plate], equipped: {} });
 });

 it('equips one purchased plate independently on Silver and Gold and resets only the chosen tier', async () => {
  const { db } = await memoryDb();
  await db.run([...completionReward('classic:first', 'first'), ...completionReward('draft:second', 'second')]);
  await unlockCosmetic(db, plate);
  await unlockCosmetic(db, otherPlate);
  await equipCosmetic(db, 'foil', plate);
  await equipCosmetic(db, 'emboss', plate);
  await equipCosmetic(db, 'emboss', otherPlate);
  expect((await readShop(db)).equipped).toEqual({ foil: { itemId: plate, colorway: null }, emboss: { itemId: otherPlate, colorway: null } });
  await equipCosmetic(db, 'foil', null);
  expect(await readShop(db)).toEqual({ balance: 0, owned: [plate, otherPlate], equipped: { emboss: { itemId: otherPlate, colorway: null } } });
 });

 it('includes colorways for owned Gem patterns and rejects incompatible tiers or custom palettes', async () => {
  const { db } = await memoryDb();
  await db.run(completionReward('draft:first', 'first'));
  await unlockCosmetic(db, film);
  await equipCosmetic(db, 'gem', film, 'ice');
  await equipCosmetic(db, 'gem', film, 'aurora');
  expect((await readShop(db)).equipped.gem).toEqual({ itemId: film, colorway: 'aurora' });
  await expect(equipCosmetic(db, 'foil', film)).rejects.toThrow('not compatible');
  await expect(equipCosmetic(db, 'gem', plate)).rejects.toThrow('not compatible');
  await expect(equipCosmetic(db, 'foil', plate, 'ice')).rejects.toThrow('only available for Gem');
  await expect(equipCosmetic(db, 'gem', film, 'custom')).rejects.toThrow('Unknown holo colorway');
  await expect(equipCosmetic(db, 'gem', film, 'missing')).rejects.toThrow('Unknown holo colorway');
  await expect(equipCosmetic(db, 'base' as CustomTier, null)).rejects.toThrow('Base cards');
  await expect(equipCosmetic(db, 'gem', null, 'ice')).rejects.toThrow('Choose a holo pattern');
  expect((await readShop(db)).balance).toBe(0);
  await equipCosmetic(db, 'gem', film);
  expect((await readShop(db)).equipped.gem).toEqual({ itemId: film, colorway: null });
  await equipCosmetic(db, 'gem', null);
  expect((await readShop(db)).equipped).toEqual({});
 });

 it('rolls back an entire overspending transaction and keeps receipts when a later statement fails', async () => {
  const { db } = await memoryDb();
  await db.run(completionReward('classic:first', 'first'));
  await expect(db.run([
   { sql: 'INSERT INTO shop_owned (item_id) VALUES (?)', bind: [plate] },
   { sql: 'INSERT INTO shop_owned (item_id) VALUES (?)', bind: [otherPlate] }
  ])).rejects.toThrow('Not enough tokens');
  expect(await readShop(db)).toEqual({ balance: 1, owned: [], equipped: {} });
  await expect(db.run([...completionReward('draft:rolled-back', 'next'), { sql: 'INSERT INTO missing_table VALUES (1)' }])).rejects.toThrow();
  expect((await readShop(db)).balance).toBe(1);
  expect(await db.all("SELECT * FROM shop_completions WHERE key = 'draft:rolled-back'")).toEqual([]);
 });

 it('enforces integer credits and ownership in SQLite itself', async () => {
  const { db } = await memoryDb();
  for (const credit of [-1, 0.5, 2]) {
   await expect(db.run([{ sql: 'INSERT INTO shop_completions VALUES (?, ?, ?)', bind: [`invalid:${credit}`, 'stamp', credit] }])).rejects.toThrow();
  }
  await expect(db.run([{ sql: "INSERT INTO shop_equipped VALUES ('foil', ?, NULL)", bind: [plate] }])).rejects.toThrow('Unlock this finish');
  await db.run(completionReward('classic:first', 'first'));
  await unlockCosmetic(db, plate);
  await equipCosmetic(db, 'foil', plate);
  await expect(db.run([{ sql: 'UPDATE shop_equipped SET item_id = ?', bind: [otherPlate] }])).rejects.toThrow('Unlock this finish');
 });

 it('surfaces database failures instead of reporting a successful purchase or equipment change', async () => {
  await expect(readShop(brokenDb)).rejects.toThrow('blocked');
  await expect(unlockCosmetic(brokenDb, plate)).rejects.toThrow('blocked');
  await expect(equipCosmetic(brokenDb, 'foil', plate)).rejects.toThrow('blocked');
 });
});
