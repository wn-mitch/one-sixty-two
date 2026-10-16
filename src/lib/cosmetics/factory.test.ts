import { describe, expect, it } from 'vitest';
import { DECK, draftChoice, draftStatus, initialDraft, wornChoice } from './factory.ts';
import type { ShopSnapshot } from './ledger.ts';

const snapshot: ShopSnapshot = {
	balance: 0, firstSeasonBonus: false, owned: ['film:mojo'],
	equipped: { gem: { itemId: 'film:mojo', colorway: null } },
	eras: { gem: { '1980s': { itemId: null, colorway: 'ice' } } }
};

describe('factory choices', () => {
	it('shows an era override first, then the deck finish, then the era original', () => {
		expect(wornChoice(snapshot, 'gem', '1980s')).toEqual({ itemId: null, colorway: 'ice' });
		expect(wornChoice(snapshot, 'gem', '1990s')).toEqual({ itemId: 'film:mojo', colorway: null });
		expect(wornChoice(snapshot, 'foil', '1990s')).toEqual({ itemId: null, colorway: null });
	});

	it('starts unchanged on the saved choice and prices only missing unlocks', () => {
		expect(draftStatus(snapshot, 'gem', '1990s', initialDraft(snapshot, 'gem', '1990s'))).toEqual({ needed: [], unchanged: true, short: false });
		expect(draftChoice(snapshot, 'gem', { itemId: DECK, colorway: null })).toEqual({ itemId: 'film:mojo', colorway: null });
		// Re-picking the deck's own pattern for one era is a real override, free because it is owned.
		expect(draftStatus(snapshot, 'gem', '1990s', { itemId: 'film:mojo', colorway: null })).toEqual({ needed: [], unchanged: false, short: false });
		expect(draftStatus(snapshot, 'gem', '1980s', { itemId: 'film:refractor', colorway: 'ice' })).toEqual({ needed: ['film:refractor', 'colorway:ice'], unchanged: false, short: true });
	});
});
