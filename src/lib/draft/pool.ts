import type { Finish } from '../cards/finish.ts';
import { compareId, HITTER_SLOTS, type Slot } from '../game/types.ts';
import { randomStream, shuffle } from '../game/random.ts';
import { createCleanupStacks, type CleanupStacks } from './cleanup.ts';
import { createLedger, transfer, UNOWNED } from './ledger.ts';
import { atLeast, DRAFT_RULES, type CubeRole, type DraftRules } from './rules.ts';
import type { DraftCard, Ledger, LegalityFailure } from './types.ts';

export interface RunPool {
 seed: number;
 rules: DraftRules;
 /** Every club's nominal cap: `capShare` of the dealt cards' salary per seat. */
 tableCap: number;
 ledger: Ledger;
 /** packs[seat][pack] lists the card ids in each pack dealt to `seat`; a seat's packs form its pile. */
 packs: string[][][];
 cleanup: CleanupStacks;
 universeSize: number;
 warnings: string[];
 failures: LegalityFailure[];
}

export function cubeRole(card: DraftCard): CubeRole {
 const slot = card.pricedSlot;
 if ((HITTER_SLOTS as readonly Slot[]).includes(slot)) return 'hitter';
 return slot === 'CL' ? 'CL' : 'SP';
}

/** The pile `seat` holds at `pick`. Piles pass left, to the next seat up, after every pick. */
export function pileHeldBy(seat: number, pick: number, seats = DRAFT_RULES.seats): number {
 return ((seat - pick) % seats + seats) % seats;
}

/**
 * The run's price sheet: each card's salary scaled by a seeded factor within ±`priceNoise`, never
 * below `minSalary`. A common stays within `commonSalaryMax`, so cleanup still guarantees a roster.
 */
export function priceCards(seed: number, cards: readonly DraftCard[], rules: DraftRules = DRAFT_RULES): DraftCard[] {
 const random = randomStream(seed, 'draft:pool:price');
 return [...cards].sort((a, b) => compareId(a.seasonId, b.seasonId)).map(card => {
  const noisy = Math.max(rules.minSalary, Math.round(card.salary * (1 + rules.priceNoise * (2 * random() - 1))));
  const common = card.finish === 'base' && card.salary <= rules.commonSalaryMax;
  return { ...card, salary: common ? Math.min(noisy, rules.commonSalaryMax) : noisy };
 });
}

/**
 * Builds one run's pool from real cards, repriced for the run (`priceCards`). Every seat is dealt its packs; each pack slot draws a
 * random free card at or above its floor, so upgrades come at the universe's natural finish rates.
 * Everything else stays in the unowned universe, where the cleanup stacks draw from it.
 */
export function buildRunPool(seed: number, sourceCards: readonly DraftCard[], rules: DraftRules = DRAFT_RULES): RunPool {
 const cards = priceCards(seed, sourceCards, rules);
 const universe = cards.filter(card => card.year >= rules.minYear && card.year <= rules.maxYear);
 const ledger = createLedger(cards);
 const pool: RunPool = { seed, rules, tableCap: 0, ledger, packs: [], cleanup: createCleanupStacks(seed, ledger, universe, rules), universeSize: universe.length, warnings: [], failures: [] };
 for (const role of pool.cleanup.empty) pool.failures.push({ code: 'stock-role-shortfall', slot: role === 'SP' ? 'SP1' : role });

 // Each floor walks its own seeded order, so a slot's draw is uniform over the eligible cards still free.
 const blocked = new Set<string>();
 const orders = new Map<Finish, { cards: DraftCard[]; next: number }>();
 const draw = (floor: Finish): DraftCard | null => {
  let order = orders.get(floor);
  if (!order) orders.set(floor, order = { cards: shuffle(universe.filter(card => atLeast(card.finish, floor)), randomStream(seed, `draft:pool:floor:${floor}`)), next: 0 });
  while (order.next < order.cards.length) {
   const card = order.cards[order.next++];
   if (blocked.has(card.seasonId)) continue;
   blocked.add(card.seasonId);
   return card;
  }
  return null;
 };

 const dealing = randomStream(seed, 'draft:pool:deal');
 for (let seat = 0; seat < rules.seats; seat++) {
  const packs: string[][] = [];
  for (let pack = 0; pack < rules.packsPerSeat; pack++) {
   const drawn: string[] = [];
   for (const slot of rules.collation) for (let count = 0; count < slot.count; count++) {
    const card = draw(slot.floor);
    if (!card) { pool.warnings.push(`seat ${seat} pack ${pack}: no ${slot.floor}-or-better card left`); continue; }
    transfer(ledger, card.seasonId, UNOWNED, { kind: 'pile', pile: seat }, 'deal');
    drawn.push(card.seasonId);
   }
   packs.push(shuffle(drawn, dealing));
  }
  pool.packs.push(packs);
 }
 const dealt = pool.packs.flat(2).reduce((sum, id) => sum + ledger.cards.get(id)!.salary, 0);
 pool.tableCap = Math.round(rules.capShare * dealt / rules.seats);
 return pool;
}
