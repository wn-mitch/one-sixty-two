import { describe, expect, it } from 'vitest';
import { memoryDb } from '../storage/test-db.ts';
import { completionReward, readShop, unlockCosmetic } from './ledger.ts';
import { recordPurchases, type StoreTransaction } from './purchases.ts';

const bought = (id: string, productId = 'coins.4', revokedAt: string | null = null): StoreTransaction =>
 ({ id, productId, purchasedAt: '2026-10-21T12:00:00Z', revokedAt });
const plates = ['plate:brushed', 'plate:hammered', 'plate:guilloche', 'plate:sunburst', 'plate:spun'];

describe('App Store coin purchases', () => {
 it('credits each transaction once however often the host redelivers it', async () => {
  const { db } = await memoryDb();
  expect(await recordPurchases(db, [bought('1'), bought('2', 'coins.20')])).toEqual(['1', '2']);
  expect(await recordPurchases(db, [bought('1'), bought('2', 'coins.20')])).toEqual(['1', '2']);
  expect((await readShop(db)).balance).toBe(24);
 });

 it('ignores unknown products and leaves them for the host to keep', async () => {
  const { db } = await memoryDb();
  expect(await recordPurchases(db, [bought('1', 'coins.999'), bought('2')])).toEqual(['2']);
  expect((await readShop(db)).balance).toBe(4);
 });

 it('does not take the first-season bonus away from a player who bought coins first', async () => {
  const { db } = await memoryDb();
  await recordPurchases(db, [bought('1')]);
  expect((await readShop(db)).firstSeasonBonus).toBe(true);
 });

 it('spends purchased coins on unlocks through the SQLite balance check', async () => {
  const { db } = await memoryDb();
  await recordPurchases(db, [bought('1')]);
  for (const plate of plates.slice(0, 4)) await unlockCosmetic(db, plate);
  await expect(unlockCosmetic(db, plates[4])).rejects.toThrow('Not enough tokens');
  expect((await readShop(db)).balance).toBe(0);
 });

 it('takes back an unspent refunded purchase in full, once', async () => {
  const { db } = await memoryDb();
  await db.run(completionReward('classic:first', 'first'));
  await recordPurchases(db, [bought('1')]);
  await recordPurchases(db, [bought('1', 'coins.4', '2026-10-22T00:00:00Z')]);
  await recordPurchases(db, [bought('1', 'coins.4', '2026-10-23T00:00:00Z')]);
  expect((await readShop(db)).balance).toBe(1);
  expect(await db.all('SELECT revoked_at, clawback FROM shop_purchases')).toEqual([{ revoked_at: '2026-10-22T00:00:00Z', clawback: 4 }]);
 });

 it('never takes earned coins or owned finishes for a refund of coins already spent', async () => {
  const { db } = await memoryDb();
  await recordPurchases(db, [bought('1')]);
  for (const plate of plates.slice(0, 3)) await unlockCosmetic(db, plate);
  await db.run(completionReward('classic:first', 'first'));
  // Balance 2: one purchased coin left and one earned. The refund takes only the purchased one.
  await recordPurchases(db, [bought('1', 'coins.4', '2026-10-22T00:00:00Z')]);
  expect(await readShop(db)).toMatchObject({ balance: 1, owned: plates.slice(0, 3).sort() });
 });

 it('nets a restored purchase and its refund to nothing on a fresh device', async () => {
  const { db } = await memoryDb();
  await recordPurchases(db, [bought('1', 'coins.40', '2026-10-22T00:00:00Z'), bought('2')]);
  expect((await readShop(db)).balance).toBe(4);
 });
});
