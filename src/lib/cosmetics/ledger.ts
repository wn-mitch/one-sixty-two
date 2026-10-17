import { appearanceFor, colorwayItemId, COSMETICS, costOf, itemsForTier, type CustomTier } from './catalogue.ts';
import { CARD_ERAS, type CardEra } from '../cards/era.ts';
import type { Db, Row, Statement } from '../storage/sql.ts';

export type EquippedFinish = { itemId: string | null; colorway: string | null };

export type ShopSnapshot = {
 balance: number;
 /** No season has ever completed on this device, so the next own Classic season earns the first-season bonus. */
 firstSeasonBonus: boolean;
 owned: string[];
 equipped: Partial<Record<CustomTier, { itemId: string; colorway: string | null }>>;
 /** Card factory choices: one era's finish for one tier, overriding `equipped`. A null item keeps the era's own finish. */
 eras: Partial<Record<CustomTier, Partial<Record<CardEra, EquippedFinish>>>>;
};

/** Read all three parts from one SQLite snapshot, even when another tab is buying a finish. */
export async function readShop(db: Db): Promise<ShopSnapshot> {
 const rows = await db.all<Row & { balance: number; first: number; owned: string; equipped: string; eras: string }>(`SELECT
  (SELECT COALESCE(SUM(credit), 0) FROM shop_completions) - (SELECT COALESCE(SUM(cost), 0) FROM shop_owned) AS balance,
  NOT EXISTS (SELECT 1 FROM shop_completions) AS first,
  (SELECT json_group_array(item_id) FROM (SELECT item_id FROM shop_owned ORDER BY item_id)) AS owned,
  (SELECT json_group_object(tier, json_object('itemId', item_id, 'colorway', colorway)) FROM shop_equipped) AS equipped,
  (SELECT json_group_array(json_object('tier', tier, 'era', era, 'itemId', item_id, 'colorway', colorway)) FROM shop_era_equipped) AS eras`);
 const row = rows[0];
 const eras: ShopSnapshot['eras'] = {};
 for (const { tier, era, itemId, colorway } of JSON.parse(row.eras) as ({ tier: CustomTier; era: CardEra } & EquippedFinish)[]) {
  (eras[tier] ??= {})[era] = { itemId, colorway };
 }
 return { balance: row.balance, firstSeasonBonus: row.first === 1, owned: JSON.parse(row.owned), equipped: JSON.parse(row.equipped), eras };
}

/** The caller includes this receipt in the same transaction as its own completed season. */
export function completionReward(key: string, stamp: string): Statement[] {
 return [{
  sql: 'INSERT INTO shop_completions (key, completed_at, credit) VALUES (?, ?, 1) ON CONFLICT (key) DO NOTHING',
  bind: [key, stamp]
 }];
}

export const FIRST_SEASON_BONUS_KEY = 'bonus:first-season';

/**
 * The one-time first-season bonus token. It must run in the same transaction as, and before, the season's
 * own receipt: it pays only while the device has no completion receipt at all. Profiles that completed
 * anything before (including history migrated as zero-credit receipts) never qualify, and deleting saved
 * seasons does not remove receipts, so the bonus cannot recur.
 */
export function firstSeasonBonus(stamp: string): Statement[] {
 return [{
  sql: 'INSERT INTO shop_completions (key, completed_at, credit) SELECT ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM shop_completions)',
  bind: [FIRST_SEASON_BONUS_KEY, stamp]
 }];
}

/** Tokens one save granted: the season's own, the first-season bonus, and a daily run's bonus. */
export type SeasonReward = { season: number; bonus: number; daily: number };

/** Tokens granted by the write stamped `stamp`; a revisit keeps its earlier stamp and so reads as nothing new. */
export async function grantedReward(db: Db, key: string, stamp: string, dailyKey: string | null = null): Promise<SeasonReward> {
 const rows = await db.all<Row & { key: string; credit: number }>(
  'SELECT key, credit FROM shop_completions WHERE completed_at = ? AND key IN (?, ?, ?)', [stamp, key, FIRST_SEASON_BONUS_KEY, dailyKey]);
 const credit = (wanted: string | null) => rows.find(row => row.key === wanted)?.credit ?? 0;
 return { season: credit(key), bonus: credit(FIRST_SEASON_BONUS_KEY), daily: credit(dailyKey) };
}

const ownStatement = (id: string): Statement => ({
 sql: 'INSERT INTO shop_owned (item_id, cost) VALUES (?, ?) ON CONFLICT (item_id) DO NOTHING',
 bind: [id, costOf(id)]
});

/** SQLite checks the balance inside the write transaction; repeated purchases cannot spend twice. */
export async function unlockCosmetic(db: Db, id: string): Promise<void> {
 if (!COSMETICS.some(item => item.id === id)) throw new Error('Unknown cosmetic finish.');
 await db.run([ownStatement(id)]);
}

/** Where a choice applies: every card of a tier, or only that tier's cards from one era (the card factory). */
export type FinishTarget = { tier: CustomTier; era?: CardEra | null };

function checkChoice({ tier, era }: FinishTarget, id: string | null, colorway: string | null): void {
 if (tier !== 'foil' && tier !== 'emboss' && tier !== 'gem') throw new Error('Base cards keep their original finish.');
 if (era != null && !CARD_ERAS.includes(era)) throw new Error('Unknown card era.');
 if (colorway !== null && tier !== 'gem') throw new Error('Colorways are only available for Gem holo patterns.');
 appearanceFor(id, colorway);
 if (id !== null && !itemsForTier(tier).some(item => item.id === id)) throw new Error('That finish is not compatible with this card tier.');
 if (id === null && colorway !== null && era == null) throw new Error('Recolor an era’s own holo in the card factory, or choose a holo pattern.');
}

function equipStatement({ tier, era }: FinishTarget, id: string | null, colorway: string | null): Statement {
 if (era != null) return {
  sql: `INSERT INTO shop_era_equipped (tier, era, item_id, colorway) VALUES (?, ?, ?, ?)
   ON CONFLICT (tier, era) DO UPDATE SET item_id = excluded.item_id, colorway = excluded.colorway`,
  bind: [tier, era, id, colorway]
 };
 if (id === null) return { sql: 'DELETE FROM shop_equipped WHERE tier = ?', bind: [tier] };
 return {
  sql: `INSERT INTO shop_equipped (tier, item_id, colorway) VALUES (?, ?, ?)
   ON CONFLICT (tier) DO UPDATE SET item_id = excluded.item_id, colorway = excluded.colorway`,
  bind: [tier, id, colorway]
 };
}

/** The unlocks a choice needs: its plate or pattern and its colorway. */
export function unlocksFor(id: string | null, colorway: string | null): string[] {
 return [...(id === null ? [] : [id]), ...(colorway === null ? [] : [colorwayItemId(colorway)])];
}

/**
 * Unlocks whatever the choice still needs and applies it in one transaction: a refused purchase applies
 * nothing, and an applied finish or colorway is always owned.
 */
export async function unlockAndEquip(db: Db, target: FinishTarget, id: string | null, colorway: string | null = null): Promise<void> {
 checkChoice(target, id, colorway);
 await db.run([...unlocksFor(id, colorway).map(ownStatement), equipStatement(target, id, colorway)]);
}

/** Applies an owned choice; SQLite refuses anything not yet unlocked. A deck-wide null restores the era originals. */
export async function equipCosmetic(db: Db, target: FinishTarget, id: string | null, colorway: string | null = null): Promise<void> {
 checkChoice(target, id, colorway);
 await db.run([equipStatement(target, id, colorway)]);
}

/** Returns one era to the deck-wide choice for its tier. */
export async function resetEra(db: Db, tier: CustomTier, era: CardEra): Promise<void> {
 checkChoice({ tier, era }, null, null);
 await db.run([{ sql: 'DELETE FROM shop_era_equipped WHERE tier = ? AND era = ?', bind: [tier, era] }]);
}
