import type { Db, Statement } from '../storage/sql.ts';

/** App Store consumables: four coins per US dollar, with no bulk bonus (PRODUCT.md). */
export const COIN_PACKS: readonly { productId: string; coins: number }[] = [
 { productId: 'coins.4', coins: 4 },
 { productId: 'coins.20', coins: 20 },
 { productId: 'coins.40', coins: 40 }
];

export const coinsFor = (productId: string): number | null => COIN_PACKS.find(pack => pack.productId === productId)?.coins ?? null;

/** A StoreKit-verified transaction as the iOS host reports it. */
export type StoreTransaction = { id: string; productId: string; purchasedAt: string; revokedAt: string | null };

/**
 * Credits a transaction once, then records its refund if it has one. Unlocks count as spending purchased
 * coins first, so a refund takes back only purchased coins still unspent: owned finishes and coins earned
 * by play stay. Unknown products credit nothing.
 */
export function purchaseStatements(transaction: StoreTransaction): Statement[] {
 const coins = coinsFor(transaction.productId);
 if (coins === null) return [];
 const statements: Statement[] = [{
  sql: `INSERT INTO shop_purchases (transaction_id, product_id, coins, purchased_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (transaction_id) DO NOTHING`,
  bind: [transaction.id, transaction.productId, coins, transaction.purchasedAt]
 }];
 if (transaction.revokedAt !== null) statements.push({
  sql: `UPDATE shop_purchases SET revoked_at = ?,
    clawback = MIN(coins, MAX(0, (SELECT SUM(coins - clawback) FROM shop_purchases) - (SELECT COALESCE(SUM(cost), 0) FROM shop_owned)))
   WHERE transaction_id = ? AND revoked_at IS NULL`,
  bind: [transaction.revokedAt, transaction.id]
 });
 return statements;
}

/** Records every transaction in one write; returns the ids now on the ledger, which the host may finish. */
export async function recordPurchases(db: Db, transactions: readonly StoreTransaction[]): Promise<string[]> {
 const known = transactions.filter(transaction => coinsFor(transaction.productId) !== null);
 if (known.length) await db.run(known.flatMap(purchaseStatements));
 return known.map(transaction => transaction.id);
}
