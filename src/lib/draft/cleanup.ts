import { compareId, POSITIONS, type Slot } from '../game/types.ts';
import { randomStream } from '../game/random.ts';
import type { RosterRow } from './legality.ts';
import { DRAFT_RULES, type DraftRules } from './rules.ts';
import type { DraftCard, DraftSlot, Ledger } from './types.ts';

/** One cleanup stack per fielding position, DH, starter, closer and bullpen. */
export const STACK_ROLES = [...POSITIONS, 'DH', 'SP', 'CL', 'BP'] as const;
export type StackRole = typeof STACK_ROLES[number];

/** The stack that fills an active row; setup relievers come from the closer stack, and reserves may take from any stack. */
export const stackFor = (row: DraftSlot): StackRole => row === 'SP1' || row === 'SP2' || row === 'SP3' ? 'SP' : row === 'SU1' || row === 'SU2' ? 'CL' : row;
const stackSlot = (role: StackRole): Slot => role === 'SP' ? 'SP1' : role;

export const isCommon = (card: DraftCard, rules: DraftRules = DRAFT_RULES): boolean => card.finish === 'base' && card.salary <= rules.commonSalaryMax;

/**
 * Each seat's cleanup stacks: for every role, an unlimited face-down stack of real commons in a
 * seeded order, with only the top card visible. A card is never on top once any club has held it
 * in this run (drafted, cut, or taken as cleanup), or while its bullpen or a bullpen member is in
 * the run. Seats share the universe but not stacks, so another club's choice changes a seat's top
 * card only in the rare case that both stacks showed the same card.
 */
export interface CleanupStacks {
 /** Roles with no eligible common in the universe; every seat's stack for them is empty. */
 readonly empty: readonly StackRole[];
 peek(seat: number, role: StackRole): DraftCard | null;
}

export function createCleanupStacks(seed: number, ledger: Ledger, universe: readonly DraftCard[], rules: DraftRules = DRAFT_RULES): CleanupStacks {
 const commons = universe.filter(card => isCommon(card, rules)).sort((a, b) => compareId(a.seasonId, b.seasonId));
 const eligible = new Map(STACK_ROLES.map(role => [role, commons.filter(card => card.eligibleSlots.includes(stackSlot(role)))]));
 const tops = new Map<string, DraftCard>();
 const streams = new Map<string, () => number>();
 const free = (card: DraftCard): boolean => !ledger.instances.has(card.seasonId) && !card.conflicts.some(conflict => ledger.instances.has(conflict));
 return {
  empty: STACK_ROLES.filter(role => eligible.get(role)!.length === 0),
  peek(seat, role) {
   const key = `${seat}:${role}`;
   const top = tops.get(key);
   if (top && free(top)) return top;
   const cards = eligible.get(role)!;
   if (!cards.length) return null;
   let random = streams.get(key);
   if (!random) streams.set(key, random = randomStream(seed, `draft:cleanup:seat:${seat}:${role}`));
   // Random draws flip the next card; a long run of held cards falls back to a scan so the stack never stalls.
   for (let attempt = 0; attempt < 64; attempt++) {
    const card = cards[Math.floor(random() * cards.length)];
    if (free(card)) { tops.set(key, card); return card; }
   }
   const start = Math.floor(random() * cards.length);
   for (let offset = 0; offset < cards.length; offset++) {
    const card = cards[(start + offset) % cards.length];
    if (free(card)) { tops.set(key, card); return card; }
   }
   tops.delete(key);
   return null;
  }
 };
}

/** The stack roles a card could be taken from for `row`. */
export const rolesFor = (row: RosterRow): readonly StackRole[] => row === null ? STACK_ROLES : [stackFor(row)];
