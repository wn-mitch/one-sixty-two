import type { Candidate, Franchise } from '../game/types.ts';
import type { CollectedCard } from './collection.ts';

export type Grouping = 'none' | 'team' | 'era';

/** Individual player-seasons count toward completion; team bullpens are collected but not counted. */
export const countsTowardCompletion = (candidate: Candidate): boolean => !candidate.eligibleSlots.includes('BP');

/** One heading in the binder: its collected cards, and how many of its player-seasons are owned. */
export interface CollectionShelf {
 key: string;
 label: string;
 owned: number;
 /** Countable player-seasons in the game data; zero for seasons no longer in it. */
 total: number;
 cards: CollectedCard[];
}

/** The collection's default view groups exact seasons by the game's player identity. */
export interface CollectionStack {
 key: string;
 label: string;
 cards: CollectedCard[];
}

/**
 * Groups matched exact-season cards by identity, preserving the caller's sort order inside each
 * stack. Team bullpen cards are units, not players, so they intentionally remain season-specific.
 */
export function stackCollection(
 cards: readonly CollectedCard[],
 candidates: readonly Candidate[]
): CollectionStack[] {
 const bySeason = new Map(candidates.map(candidate => [candidate.seasonId, candidate]));
 const stacks = new Map<string, CollectionStack>();
 for (const card of cards) {
  const candidate = bySeason.get(card.seasonId);
  const key = candidate?.eligibleSlots.includes('BP')
   ? `bullpen:${card.seasonId}`
   : candidate?.playerId ?? `season:${card.seasonId}`;
  const stack = stacks.get(key);
  if (stack) stack.cards.push(card);
  else stacks.set(key, { key, label: card.label, cards: [card] });
 }
 return [...stacks.values()];
}

export interface CollectionProgress { owned: number; total: number; shelves: CollectionShelf[] }

const OTHER = { key: 'other', label: 'Other seasons', order: Number.MAX_SAFE_INTEGER };

/**
 * Splits the shown cards into shelves by franchise or decade. Completion counts come from every
 * collected card, so a role filter narrows the shelves without changing a shelf's percentage.
 * Shelves keep the shown cards' order; teams sort by name and eras by decade.
 */
export function shelveCollection(
 collected: readonly CollectedCard[],
 shown: readonly CollectedCard[],
 candidates: readonly Candidate[],
 franchises: readonly Franchise[],
 grouping: Grouping
): CollectionProgress {
 const names = new Map(franchises.map(franchise => [franchise.id, franchise.name]));
 const bySeason = new Map(candidates.map(candidate => [candidate.seasonId, candidate]));
 const shelfOf = (seasonId: string): { key: string; label: string; order: number } => {
  const candidate = bySeason.get(seasonId);
  if (!candidate) return OTHER;
  if (grouping === 'team') return { key: candidate.franchiseId, label: names.get(candidate.franchiseId) ?? candidate.franchiseId, order: 0 };
  if (grouping === 'era') return { key: String(candidate.decade), label: `${candidate.decade}s`, order: candidate.decade };
  return { key: 'all', label: 'All cards', order: 0 };
 };
 const totals = new Map<string, number>();
 let total = 0;
 for (const candidate of candidates) {
  if (!countsTowardCompletion(candidate)) continue;
  total++;
  const { key } = shelfOf(candidate.seasonId);
  totals.set(key, (totals.get(key) ?? 0) + 1);
 }
 const owned = new Map<string, number>();
 let ownedTotal = 0;
 for (const card of collected) {
  const candidate = bySeason.get(card.seasonId);
  if (!candidate || !countsTowardCompletion(candidate)) continue;
  ownedTotal++;
  const { key } = shelfOf(card.seasonId);
  owned.set(key, (owned.get(key) ?? 0) + 1);
 }
 const shelves = new Map<string, CollectionShelf & { order: number }>();
 for (const card of shown) {
  const { key, label, order } = shelfOf(card.seasonId);
  const shelf = shelves.get(key) ?? { key, label, order, owned: owned.get(key) ?? 0, total: totals.get(key) ?? 0, cards: [] };
  shelf.cards.push(card);
  shelves.set(key, shelf);
 }
 const sorted = [...shelves.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
 return { owned: ownedTotal, total, shelves: sorted.map(({ order: _order, ...shelf }) => shelf) };
}

/** A completion share readable at any size: two decimals below 1%, one above, never 0% for a nonzero count. */
export function completionPercent(owned: number, total: number): string {
 if (total <= 0) return '—';
 const share = (owned / total) * 100;
 if (owned > 0 && share < 0.01) return '<0.01%';
 return `${share.toFixed(share < 1 ? 2 : 1)}%`;
}
