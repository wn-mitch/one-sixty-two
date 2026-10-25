import { randomStream, shuffle } from '../game/random.ts';
import { compareId, HITTER_SLOTS } from '../game/types.ts';
import { isCommon } from './cleanup.ts';
import { heldBy, transfer, UNOWNED } from './ledger.ts';
import { arrangeRoster } from './legality.ts';
import { gain, MARGIN } from './market.ts';
import { effectiveCap } from './rules.ts';
import type { DraftRun } from './run.ts';
import type { DraftCard } from './types.ts';

/**
 * A chapter stop's market additions: a public market condition that reprices unowned cards, and a
 * supplemental pack of fresh cards for every club, of which it may sign one that fits its cap.
 * Packs are dealt best card first in reverse standings order, so the last-place club sees the
 * best card. Signed salaries never change afterwards. Provisional.
 */
export const PACK_SIZE = 4;

export interface MarketCondition { id: string; name: string; detail: string; factor: (card: DraftCard) => number }

const isPitcherCard = (card: DraftCard) => !card.eligibleSlots.some(slot => (HITTER_SLOTS as readonly string[]).includes(slot));
const isRelieverCard = (card: DraftCard) => isPitcherCard(card) && !card.eligibleSlots.includes('SP1');
const UP_THE_MIDDLE = ['C', 'SS', 'CF'];

export const MARKET_CONDITIONS: readonly MarketCondition[] = [
 { id: 'steady', name: 'Steady market', detail: 'Unowned cards cost their sheet price.', factor: () => 1 },
 { id: 'bats', name: 'Bat premium', detail: 'Unowned hitters cost 20% more.', factor: card => isPitcherCard(card) ? 1 : 1.2 },
 { id: 'arms', name: 'Arms race', detail: 'Unowned pitchers cost 20% more.', factor: card => isPitcherCard(card) ? 1.2 : 1 },
 { id: 'bullpen', name: 'Bullpen clearance', detail: 'Unowned relievers cost 25% less.', factor: card => isRelieverCard(card) ? .75 : 1 },
 { id: 'middle', name: 'Up the middle', detail: 'Unowned catchers, shortstops and center fielders cost 20% more.', factor: card => card.eligibleSlots.some(slot => UP_THE_MIDDLE.includes(slot)) ? 1.2 : 1 },
 { id: 'buyers', name: 'Buyer\'s market', detail: 'Every unowned card costs 15% less.', factor: () => .85 },
 { id: 'sellers', name: 'Seller\'s market', detail: 'Every unowned card costs 15% more.', factor: () => 1.15 }
];

/** The market condition revealed at chapter `chapter` (1-5), seeded. */
export function conditionAt(seed: number, chapter: number): MarketCondition {
 const random = randomStream(seed, `draft:chapter:${chapter}:condition`);
 return MARKET_CONDITIONS[Math.floor(random() * MARKET_CONDITIONS.length)];
}

/** An unowned card's price under the run's current market condition. */
export const marketPrice = (run: DraftRun, card: DraftCard): number => Math.max(1, Math.round(card.salary * conditionAt(run.setup.seed, run.chapter).factor(card)));

/**
 * Deals each club its pack: fresh cards no club has held, commons excluded (the cleanup stacks
 * hold those), in seeded order; the strongest go first, round robin in `order`.
 */
export function dealPacks(run: DraftRun, order: readonly number[]): string[][] {
 const { minYear, maxYear } = run.pool.rules;
 const fresh = [...run.pool.ledger.cards.values()].filter(card => !run.pool.ledger.instances.has(card.seasonId) && !isCommon(card, run.pool.rules) && card.year >= minYear && card.year <= maxYear);
 const drawn = shuffle(fresh.sort((a, b) => compareId(a.seasonId, b.seasonId)), randomStream(run.setup.seed, `draft:chapter:${run.chapter}:packs`)).slice(0, PACK_SIZE * order.length);
 drawn.sort((a, b) => b.valueRuns - a.valueRuns || compareId(a.seasonId, b.seasonId));
 const packs: string[][] = order.map(() => []);
 drawn.forEach((card, index) => packs[order[index % order.length]].push(card.seasonId));
 return packs;
}

/** Whether `seat` can sign `cardId` now: it is in the seat's pack, the seat has not signed this chapter, and its payroll with the card and commons in its open rows fits the cap. */
export function canSign(run: DraftRun, seat: number, cardId: string): boolean {
 if (run.market?.step !== 'market' || run.signed[seat] !== null || !run.packs[seat]?.includes(cardId)) return false;
 const ids = heldBy(run.pool.ledger, { kind: 'roster', seat });
 const card = run.pool.ledger.cards.get(cardId)!;
 const cards = [...ids.map(id => run.pool.ledger.cards.get(id)!), card];
 const payroll = ids.reduce((sum, id) => sum + run.pool.ledger.instances.get(id)!.startingSalary, 0) + marketPrice(run, card);
 const open = arrangeRoster(cards, run.pool.rules).open.length;
 return payroll + open * run.pool.rules.commonSalaryMax <= effectiveCap(run.budgets[seat]);
}

/** Signs a pack card to `seat` at the market price, which stays its salary. Callers check `canSign`. */
export function signCard(run: DraftRun, seat: number, cardId: string): void {
 const card = run.pool.ledger.cards.get(cardId)!;
 transfer(run.pool.ledger, cardId, UNOWNED, { kind: 'roster', seat }, 'sign', marketPrice(run, card));
 run.signed[seat] = cardId;
}

/** Each AI club, in claim order, signs the pack card it believes gains it the most, when that clears its margin and fits its cap. */
export function aiSign(run: DraftRun): void {
 for (const seat of run.market!.priority) {
  if (seat === run.seating.humanSeat || run.signed[seat] !== null) continue;
  const scored = run.packs[seat].filter(id => canSign(run, seat, id)).map(id => ({ id, value: gain(run, seat, [], [id]) })).filter(item => item.value >= MARGIN);
  const choice = scored.sort((a, b) => b.value - a.value || compareId(a.id, b.id))[0];
  if (choice) signCard(run, seat, choice.id);
 }
}
