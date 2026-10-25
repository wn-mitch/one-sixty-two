import { compareId } from '../game/types.ts';
import type { CardInstance, DraftCard, Ledger, LedgerOp, LegalityFailure, Owner } from './types.ts';

export const UNOWNED: Owner = Object.freeze({ kind: 'unowned' });

export function sameOwner(a: Owner, b: Owner): boolean {
 if (a.kind !== b.kind) return false;
 if (a.kind === 'roster') return a.seat === (b as typeof a).seat;
 if (a.kind === 'pile') return a.pile === (b as typeof a).pile;
 return true;
}

export function createLedger(cards: Iterable<DraftCard>): Ledger {
 return { cards: new Map([...cards].map(card => [card.seasonId, card])), instances: new Map(), events: [] };
}

/** Cards without an instance have never left the implicit unowned universe. */
export const ownerOf = (ledger: Ledger, cardId: string): Owner => ledger.instances.get(cardId)?.owner ?? UNOWNED;

/**
 * Moves one card between owners. The caller states where it believes the card is; a mismatch is a
 * contract violation, never a silent overwrite. The first move creates the run-owned instance, at
 * `salary` when given (a card signed at a market price) and otherwise at the sheet salary.
 */
export function transfer(ledger: Ledger, cardId: string, expected: Owner, to: Owner, op: LedgerOp, salary = ledger.cards.get(cardId)?.salary ?? 0): CardInstance {
 const card = ledger.cards.get(cardId);
 if (!card) throw new Error(`Unknown card ${cardId}`);
 const from = ownerOf(ledger, cardId);
 if (!sameOwner(from, expected)) throw new Error(`${cardId} is held by ${describeOwner(from)}, not ${describeOwner(expected)}`);
 let instance = ledger.instances.get(cardId);
 if (!instance) {
  instance = { cardId, startingSalary: salary, originalTier: card.finish, provenance: [], tradeDeadline: null, owner: UNOWNED };
  ledger.instances.set(cardId, instance);
 }
 const seq = ledger.events.length;
 instance.owner = to;
 instance.provenance.push({ op, seat: to.kind === 'roster' ? to.seat : from.kind === 'roster' ? from.seat : null, seq });
 ledger.events.push({ seq, op, cardId, from, to });
 return instance;
}

export function describeOwner(owner: Owner): string {
 if (owner.kind === 'roster') return `seat ${owner.seat}`;
 if (owner.kind === 'pile') return `pile ${owner.pile}`;
 return owner.kind;
}

/** Card ids held by an owner, in id order. */
export function heldBy(ledger: Ledger, owner: Owner): string[] {
 const held: string[] = [];
 for (const instance of ledger.instances.values()) if (sameOwner(instance.owner, owner)) held.push(instance.cardId);
 return held.sort(compareId);
}

/**
 * Replays the event log from the unowned universe and checks it reproduces every instance's owner,
 * that each move started where the card actually was, and that every card is real.
 */
export function auditLedger(ledger: Ledger): LegalityFailure[] {
 const failures: LegalityFailure[] = [];
 const replayed = new Map<string, Owner>();
 for (const event of ledger.events) {
  if (!ledger.cards.has(event.cardId)) failures.push({ code: 'fictional-card', cardId: event.cardId });
  if (!sameOwner(replayed.get(event.cardId) ?? UNOWNED, event.from)) failures.push({ code: 'duplicate-ownership', cardId: event.cardId });
  replayed.set(event.cardId, event.to);
 }
 for (const instance of ledger.instances.values()) {
  const card = ledger.cards.get(instance.cardId);
  if (!card) { failures.push({ code: 'fictional-card', cardId: instance.cardId }); continue; }
  const actual = replayed.get(instance.cardId) ?? null;
  if (!actual || !sameOwner(actual, instance.owner)) failures.push({ code: 'bucket-mismatch', cardId: instance.cardId, expected: instance.owner, actual });
 }
 return failures;
}

/** Checks a derived view (packs, rosters, stock lists) against the ledger; a card listed twice is double ownership. */
export function auditView(ledger: Ledger, view: Iterable<{ cardId: string; owner: Owner }>): LegalityFailure[] {
 const failures: LegalityFailure[] = [];
 const seen = new Set<string>();
 for (const { cardId, owner } of view) {
  if (seen.has(cardId)) failures.push({ code: 'duplicate-ownership', cardId });
  seen.add(cardId);
  if (!ledger.cards.has(cardId)) { failures.push({ code: 'fictional-card', cardId }); continue; }
  const actual = ledger.instances.get(cardId)?.owner ?? null;
  if (!actual || !sameOwner(actual, owner)) failures.push({ code: 'bucket-mismatch', cardId, expected: owner, actual });
 }
 return failures;
}
