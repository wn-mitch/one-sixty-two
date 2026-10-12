import { compareId } from '../../src/lib/game/types.ts';
import { randomStream } from '../../src/lib/game/random.ts';
import { arrangeRoster, fits } from '../../src/lib/draft/legality.ts';
import { heldBy, transfer } from '../../src/lib/draft/ledger.ts';
import { pileHeldBy, type RunPool } from '../../src/lib/draft/pool.ts';
import { picksPerSeat } from '../../src/lib/draft/rules.ts';
import type { DraftCard } from '../../src/lib/draft/types.ts';

/**
 * Placeholder pick policies that stress the opening contract. They are not AI general managers:
 * `value` drives payroll over the cap, `lopsided` leaves roles empty and creates surplus, `needs`
 * drafts toward a complete roster, and `random` ignores both.
 */
export const PICK_POLICIES = ['value', 'needs', 'lopsided', 'random'] as const;
export type PickPolicy = typeof PICK_POLICIES[number];

const byValue = (a: DraftCard, b: DraftCard): number => b.valueRuns - a.valueRuns || compareId(a.seasonId, b.seasonId);

function choose(policy: PickPolicy, options: DraftCard[], owned: DraftCard[], random: () => number): DraftCard {
 const ranked = [...options].sort(byValue);
 if (policy === 'value') return ranked[0];
 if (policy === 'random') return options[Math.floor(random() * options.length)];
 if (policy === 'lopsided') return ranked.find(card => card.eligibleSlots.includes('DH')) ?? ranked[0];
 const open = arrangeRoster(owned).open.filter(row => row !== null);
 return ranked.find(card => open.some(row => fits(card, row))) ?? ranked[0];
}

/** Runs the pass-left draft: each seat cracks its packs into one pile, takes a card from the pile it holds, then passes. */
export function runDraft(pool: RunPool, policies: readonly PickPolicy[]): void {
 const { ledger, rules } = pool;
 const randoms = policies.map((_, seat) => randomStream(pool.seed, `draft:policy:seat:${seat}`));
 const piles = pool.packs.map(packs => packs.flat());
 for (let pick = 0; pick < picksPerSeat(rules); pick++) {
  for (let seat = 0; seat < rules.seats; seat++) {
   const pile = pileHeldBy(seat, pick, rules.seats);
   const options = piles[pile].map(id => ledger.cards.get(id)!);
   if (!options.length) throw new Error(`Seat ${seat} received an empty pile`);
   const owned = heldBy(ledger, { kind: 'roster', seat }).map(id => ledger.cards.get(id)!);
   const card = choose(policies[seat], options, owned, randoms[seat]);
   transfer(ledger, card.seasonId, { kind: 'pile', pile }, { kind: 'roster', seat }, 'draft');
   piles[pile].splice(piles[pile].indexOf(card.seasonId), 1);
  }
 }
 if (piles.some(pile => pile.length)) throw new Error('The draft left undrafted cards');
}
