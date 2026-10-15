import { appearanceFor, COSMETICS, itemsForTier, type CustomTier } from './catalogue.ts';
import type { Db, Row, Statement } from '../storage/sql.ts';

export type ShopSnapshot = {
 balance: number;
 owned: string[];
 equipped: Partial<Record<CustomTier, { itemId: string; colorway: string | null }>>;
};

/** Read all three parts from one SQLite snapshot, even when another tab is buying a finish. */
export async function readShop(db: Db): Promise<ShopSnapshot> {
 const rows = await db.all<Row & { balance: number; owned: string; equipped: string }>(`SELECT
  (SELECT COALESCE(SUM(credit), 0) FROM shop_completions) - (SELECT COUNT(*) FROM shop_owned) AS balance,
  (SELECT json_group_array(item_id) FROM (SELECT item_id FROM shop_owned ORDER BY item_id)) AS owned,
  (SELECT json_group_object(tier, json_object('itemId', item_id, 'colorway', colorway)) FROM shop_equipped) AS equipped`);
 const row = rows[0];
 return { balance: row.balance, owned: JSON.parse(row.owned), equipped: JSON.parse(row.equipped) };
}

/** The caller includes this receipt in the same transaction as its own completed season. */
export function completionReward(key: string, stamp: string): Statement[] {
 return [{
  sql: 'INSERT INTO shop_completions (key, completed_at, credit) VALUES (?, ?, 1) ON CONFLICT (key) DO NOTHING',
  bind: [key, stamp]
 }];
}

/** SQLite checks the balance inside the write transaction; repeated purchases cannot spend twice. */
export async function unlockCosmetic(db: Db, id: string): Promise<void> {
 if (!COSMETICS.some(item => item.id === id)) throw new Error('Unknown cosmetic finish.');
 await db.run([{
  sql: 'INSERT INTO shop_owned (item_id) VALUES (?) ON CONFLICT (item_id) DO NOTHING',
  bind: [id]
 }]);
}

export async function equipCosmetic(db: Db, tier: CustomTier, id: string | null, colorway: string | null = null): Promise<void> {
 if (tier !== 'foil' && tier !== 'emboss' && tier !== 'gem') throw new Error('Base cards keep their original finish.');
 // Validate even a reset, so invalid colorways never silently disappear.
 appearanceFor(id, colorway);
 if (id === null) {
  await db.run([{ sql: 'DELETE FROM shop_equipped WHERE tier = ?', bind: [tier] }]);
  return;
 }
 if (!itemsForTier(tier).some(item => item.id === id)) throw new Error('That finish is not compatible with this card tier.');
 await db.run([{
  sql: `INSERT INTO shop_equipped (tier, item_id, colorway) VALUES (?, ?, ?)
   ON CONFLICT (tier) DO UPDATE SET item_id = excluded.item_id, colorway = excluded.colorway`,
  bind: [tier, id, colorway]
 }]);
}
