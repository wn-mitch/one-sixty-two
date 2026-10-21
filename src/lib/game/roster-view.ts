import { draftRules } from './rules.ts';
import { HITTER_SLOTS, type Draft, type FieldSlot, type HitterSlot } from './types.ts';

/** Where a card may go: a slot, swapping with its occupant when it holds one, or the bench (`slot: null`). */
export interface RosterMove { slot: FieldSlot | null; swapWith: string | null }

/**
 * What a roster field shows, built by each mode from its own rules: Classic from its draft's picks,
 * Draft Mode from the player's arrangement. The field draws `slots`; a roster with a bench also
 * lists its unplaced cards beneath the field.
 */
export interface RosterView {
 /** Active slots in roster order. */
 readonly slots: readonly FieldSlot[];
 /** The season id in each filled slot. */
 readonly placed: ReadonlyMap<FieldSlot, string>;
 /** Unplaced cards in bench order, or null where the roster has no bench. */
 readonly bench: readonly string[] | null;
 /** Bench places that count as reserves; cards beyond them have no roster spot. */
 readonly reserves: number;
 /** Whether the card in `slot` can move to another place. */
 movable(slot: FieldSlot): boolean;
}

/** Classic's field: its rules' slots, each pick in its slot, no bench; only hitters move. */
export function classicRosterView(draft: Draft): RosterView {
 return {
  slots: draftRules(draft.schemaVersion).slots,
  placed: new Map(draft.picks.map(pick => [pick.slot, pick.seasonId])),
  bench: null,
  reserves: 0,
  movable: slot => HITTER_SLOTS.includes(slot as HitterSlot)
 };
}

/** A key that changes whenever any card changes place, for motion and selection resets. */
export const placementKey = (view: RosterView): string =>
 `${[...view.placed].map(([slot, id]) => `${id}@${slot}`).join('|')}#${view.bench?.join('|') ?? ''}`;
