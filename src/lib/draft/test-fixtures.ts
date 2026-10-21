import type { Finish } from '../cards/finish.ts';
import { POSITIONS, STARTER_SLOTS, type Slot } from '../game/types.ts';
import { applyAction, heldPile, openSlotsFor, type DraftRun, type RunAction } from './run.ts';
import type { DraftCard } from './types.ts';

export function testCard(seasonId: string, eligibleSlots: readonly Slot[], salary = 5, finish: Finish = 'base'): DraftCard {
 const [playerId, year = '2000'] = seasonId.split(':');
 return {
  seasonId, playerId, franchiseId: 'TST', year: Number(year), eligibleSlots, finish,
  valueRuns: salary - 5, pricedSlot: eligibleSlots[0], salary
 };
}

export const TEST_ROLES: Record<string, readonly Slot[]> = {
 ...Object.fromEntries(POSITIONS.map(position => [position, [position, 'DH'] as const])),
 SP: STARTER_SLOTS, CL: ['CL', 'RP1', 'RP2', 'RP3'],
 /** A second relief group: every club needs six relief arms. */
 RP: ['CL', 'RP1', 'RP2', 'RP3']
};

/**
 * A synthetic universe with `perRole` cards per role. Every tenth card is a gem, the next a gold,
 * the next two silver, and the base cards cycle through cheap and moderately priced salaries.
 */
export function testUniverse(perRole = 60): DraftCard[] {
 return Object.entries(TEST_ROLES).flatMap(([role, slots]) => Array.from({ length: perRole }, (_, index) => {
  const id = `${role.toLowerCase()}${index}:${1950 + index % 70}`;
  const kind = index % 10;
  if (kind === 0) return testCard(id, slots, 250 + index, 'gem');
  if (kind === 1) return testCard(id, slots, 160 + index, 'emboss');
  if (kind <= 3) return testCard(id, slots, 90 + index, 'foil');
  return testCard(id, slots, 5 + (index * 7) % 36);
 }));
}

/** Plays the rest of a draft, picking with `choose` from the player's pile each round. */
export function playDraft(run: DraftRun, choose: (pile: DraftCard[]) => string = pile => pile[0].seasonId): RunAction[] {
 while (run.phase === 'drafting') applyAction(run, pickAction(run, choose(heldPile(run))));
 return run.actions;
}

/** A pick of `cardId` into its first open slot, or onto the bench when none is open. */
export const pickAction = (run: DraftRun, cardId: string): RunAction => ({ type: 'pick', cardId, slot: openSlotsFor(run, cardId)[0] ?? null });
