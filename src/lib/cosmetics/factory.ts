import type { CardEra } from '../cards/era.ts';
import { appearanceFor, COSMETICS, finishName, type CardAppearance, type CustomTier } from './catalogue.ts';
import { unlocksFor, type EquippedFinish, type ShopSnapshot } from './ledger.ts';

/** The factory draft that follows the deck-wide finish instead of naming one. */
export const DECK = 'deck';
export type FactoryDraft = { itemId: string | null | typeof DECK; colorway: string | null };

export const TIERS: readonly { value: CustomTier; label: string }[] = [
	{ value: 'gem', label: 'Gem holo' }, { value: 'foil', label: 'Silver foil' }, { value: 'emboss', label: 'Gold emboss' }
];
export const tierLabel = (tier: CustomTier): string => TIERS.find(entry => entry.value === tier)!.label;

/** The era's own saved choice, if it overrides the deck. */
export function eraChoice(snapshot: ShopSnapshot | null, tier: CustomTier, era: CardEra): EquippedFinish | undefined {
	return snapshot?.eras[tier]?.[era];
}

/** What an era's cards wear now: its own choice, else the deck finish, else the era original. */
export function wornChoice(snapshot: ShopSnapshot | null, tier: CustomTier, era: CardEra): EquippedFinish {
	const own = eraChoice(snapshot, tier, era);
	if (own) return own;
	const deck = snapshot?.equipped[tier];
	return deck ? { itemId: deck.itemId, colorway: deck.colorway } : { itemId: null, colorway: null };
}

/** A finish choice's player-facing name, such as `Mojo · Aurora` or `Era original`. */
export function choiceName(choice: EquippedFinish): string {
	const item = choice.itemId && COSMETICS.find(entry => entry.id === choice.itemId);
	return `${item ? finishName(item) : 'Era original'}${choice.colorway ? ` · ${finishName({ name: choice.colorway })}` : ''}`;
}

export function appearanceOf(tier: CustomTier, choice: EquippedFinish): CardAppearance {
	return appearanceFor(choice.itemId, tier === 'gem' ? choice.colorway : null);
}

/** The editor's starting draft: the era's saved choice, or the deck default when it has none. */
export function initialDraft(snapshot: ShopSnapshot | null, tier: CustomTier, era: CardEra): FactoryDraft {
	const own = eraChoice(snapshot, tier, era);
	return own ? { itemId: own.itemId, colorway: own.colorway } : { itemId: DECK, colorway: null };
}

/** The finish a draft would put on the era's cards. */
export function draftChoice(snapshot: ShopSnapshot | null, tier: CustomTier, draft: FactoryDraft): EquippedFinish {
	if (draft.itemId !== DECK) return { itemId: draft.itemId, colorway: draft.colorway };
	const deck = snapshot?.equipped[tier];
	return deck ? { itemId: deck.itemId, colorway: deck.colorway } : { itemId: null, colorway: null };
}

/** Unlocks a draft still needs, and whether applying it would change nothing. */
export function draftStatus(snapshot: ShopSnapshot | null, tier: CustomTier, era: CardEra, draft: FactoryDraft): { needed: string[]; unchanged: boolean; short: boolean } {
	const deck = draft.itemId === DECK;
	const owned = snapshot?.owned ?? [];
	const needed = deck ? [] : unlocksFor(draft.itemId as string | null, draft.colorway).filter(id => !owned.includes(id));
	const saved = eraChoice(snapshot, tier, era);
	const unchanged = deck ? !saved : !!saved && saved.itemId === draft.itemId && saved.colorway === draft.colorway;
	return { needed, unchanged, short: !!snapshot && snapshot.balance < needed.length };
}
