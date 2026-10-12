import type { Finish } from '../cards/finish.ts';
import { POSITIONS, STARTER_SLOTS, type Slot } from '../game/types.ts';
import type { DraftCard } from './types.ts';

export function testCard(seasonId: string, eligibleSlots: readonly Slot[], salary = 5, finish: Finish = 'base', conflicts: readonly string[] = []): DraftCard {
 const [playerId, year = '2000'] = seasonId.split(':');
 return {
  seasonId, playerId, franchiseId: 'TST', year: Number(year), eligibleSlots, finish,
  valueRuns: salary - 5, pricedSlot: eligibleSlots[0], salary, conflicts
 };
}

export const TEST_ROLES: Record<string, readonly Slot[]> = {
 ...Object.fromEntries(POSITIONS.map(position => [position, [position, 'DH'] as const])),
 SP: STARTER_SLOTS, CL: ['CL'], BP: ['BP']
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
