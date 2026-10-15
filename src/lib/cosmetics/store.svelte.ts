import type { Finish } from '../cards/finish.ts';
import type { CardEra } from '../cards/era.ts';
import { deviceDb } from '../storage/db.ts';
import { appearanceFor, type CardAppearance } from './catalogue.ts';
import { readShop, type ShopSnapshot } from './ledger.ts';

export const shopState = $state<{ snapshot: ShopSnapshot | null; notice: string }>({ snapshot: null, notice: '' });
const ORIGINAL: CardAppearance = {};
let pending: Promise<void> | null = null;

/** Loads device-owned finishes without changing cards when storage is unavailable. */
export function refreshShop(): Promise<void> {
	if (pending) return pending;
	pending = (async () => {
		try {
			const device = await deviceDb();
			shopState.snapshot = await readShop(device.db);
			shopState.notice = device.notice ?? '';
		} catch {
			shopState.notice = 'Your finishes could not be loaded. Browser storage may be blocked or full.';
		}
	})().finally(() => { pending = null; });
	return pending;
}

/**
 * One deck-wide choice per earned tier, which a card factory choice for the card's era overrides.
 * Base cards always keep their original stock.
 */
export function equippedAppearance(tier: Finish, era?: CardEra): CardAppearance {
	if (tier === 'base') return ORIGINAL;
	const snapshot = shopState.snapshot;
	const choice = (era && snapshot?.eras[tier]?.[era]) || snapshot?.equipped[tier];
	return choice ? appearanceFor(choice.itemId, choice.colorway) : ORIGINAL;
}
