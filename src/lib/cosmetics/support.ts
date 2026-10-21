import { appHost } from '../app/host.ts';
import { deviceDb } from '../storage/db.ts';
import { readShop } from './ledger.ts';
import { COIN_PACKS, recordPurchases, type StoreTransaction } from './purchases.ts';
import { shopState } from './store.svelte.ts';

/** The iOS host's StoreKit bridge (`ios/Sources/StoreBridge.swift`); WebKit resolves each message with its reply. */
type StoreMessage =
	| { action: 'products'; ids: string[] }
	| { action: 'purchase'; id: string }
	| { action: 'transactions' }
	| { action: 'finish'; ids: string[] };
type StoreHandler = { postMessage(message: StoreMessage): Promise<unknown> };

/** The host posts this when StoreKit delivers a transaction outside a purchase: Ask to Buy, a refund, another device. */
export const STORE_UPDATE_EVENT = '162-store-transactions';

export type CoinOffer = { productId: string; coins: number; displayPrice: string };
export type PurchaseOutcome = 'purchased' | 'pending' | 'cancelled';

function handler(): StoreHandler | null {
	if (appHost() !== 'ios-app' || typeof window === 'undefined') return null;
	const webkit = (window as unknown as { webkit?: { messageHandlers?: { store?: StoreHandler } } }).webkit;
	return webkit?.messageHandlers?.store ?? null;
}

/** Support purchases exist only inside the iOS app, through the App Store. The website never offers them. */
export const supportAvailable = (): boolean => handler() !== null;

/** The packs the App Store sells here, with its localized prices; a pack the store does not return is not offered. */
export async function loadOffers(): Promise<CoinOffer[]> {
	const store = handler();
	if (!store) return [];
	const products = await store.postMessage({ action: 'products', ids: COIN_PACKS.map(pack => pack.productId) }) as { id: string; displayPrice: string }[];
	return COIN_PACKS.flatMap(pack => {
		const product = products.find(entry => entry.id === pack.productId);
		return product ? [{ ...pack, displayPrice: product.displayPrice }] : [];
	});
}

async function syncOnce(store: StoreHandler): Promise<void> {
	const transactions = await store.postMessage({ action: 'transactions' }) as StoreTransaction[];
	if (!transactions.length) return;
	const { db } = await deviceDb();
	const recorded = await recordPurchases(db, transactions);
	shopState.snapshot = await readShop(db);
	if (recorded.length) await store.postMessage({ action: 'finish', ids: recorded });
}

let running: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/**
 * Credits every verified transaction the host reports, then lets the host finish only those now saved, so an
 * interrupted write leaves the transaction to be delivered again. Restored history credits nothing twice.
 * A request made mid-sync runs one more pass afterwards, so a transaction delivered meanwhile is not missed.
 */
export function syncPurchases(): Promise<void> {
	const store = handler();
	if (!store) return Promise.resolve();
	if (!running) {
		running = syncOnce(store).finally(() => { running = null; });
		return running;
	}
	queued ??= running.catch(() => {}).then(() => { queued = null; return syncPurchases(); });
	return queued;
}

/** Starts the App Store sheet for one pack; coins arrive through `syncPurchases`, never from this reply alone. */
export async function buyCoins(productId: string): Promise<PurchaseOutcome> {
	const store = handler();
	if (!store) throw new Error('Purchases are available in the 162-0 iOS app.');
	const outcome = await store.postMessage({ action: 'purchase', id: productId }) as PurchaseOutcome;
	if (outcome === 'purchased') await syncPurchases();
	return outcome;
}

/** Keeps the ledger current with the host for the life of the page; returns the cleanup. */
export function watchPurchases(onError: (error: unknown) => void): () => void {
	if (!supportAvailable()) return () => {};
	const sync = () => { syncPurchases().catch(onError); };
	window.addEventListener(STORE_UPDATE_EVENT, sync);
	sync();
	return () => window.removeEventListener(STORE_UPDATE_EVENT, sync);
}
