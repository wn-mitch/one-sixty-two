import { legalReassignments, reassignPick } from './draft.ts';
import { draftRules } from './rules.ts';
import { BULLPEN_SLOTS, HITTER_SLOTS, type CardSlot, type Draft, type HitterSlot, type Manifest, type Profile, type ReliefAssignment } from './types.ts';

/** One place a card may move to; unavailable places carry the reason in their label. */
export interface LineupMove { key: string; label: string; available: boolean; announce: string }

/** A card's current place and every place in its list, the current one included, keyed for the mode's `onMove`. */
export interface LineupPlaces { current: string; options: LineupMove[] }

/**
 * What the lineup screen shows, built by each mode from its own rules: Classic from its draft's
 * picks, Draft Mode from the opening window's field or the season's lineup.
 */
export interface LineupView {
 /** The slot each active card plays. Reserve cards have none. */
 readonly slots: ReadonlyMap<string, CardSlot>;
 readonly battingOrder: readonly string[];
 readonly starterOrder: readonly string[];
 /** Bullpen slots in order, with the card in each; a slot is empty only while the roster is being built. */
 readonly bullpen: readonly { slot: string; seasonId: string | null }[];
 readonly reliefRoles: readonly ReliefAssignment<string>[];
 /** Cards outside the active lineup under their heading, or null where the mode has none. */
 readonly reserves: { heading: string; ids: readonly string[] } | null;
 /** Every listed card's profile has loaded, so smart orders can rank them. */
 readonly ready: boolean;
 /** The lineup can be played or submitted as it stands. */
 readonly complete: boolean;
 /** Why the footer action waits, while the lineup is incomplete. */
 readonly incomplete: string;
 /** Where the card may move, or null when it stays put. */
 places(seasonId: string): LineupPlaces | null;
}

/** Classic's lineup: each pick in its slot, no reserves; only hitters change position. */
export function classicLineupView(draft: Draft, manifest: Manifest, profiles: readonly Profile[]): LineupView {
 const bySeason = new Map(profiles.map(profile => [profile.seasonId, profile]));
 const name = (id: string) => bySeason.get(id)?.displayName ?? 'Loading selected season…';
 const complete = draft.picks.length === draftRules(draft.schemaVersion).slots.length && draft.battingOrder.length === 9 && draft.starterOrder.length === 3 && draft.picks.every(pick => bySeason.has(pick.seasonId));
 return {
  slots: new Map(draft.picks.map(pick => [pick.seasonId, pick.slot])),
  battingOrder: draft.battingOrder,
  starterOrder: draft.starterOrder,
  bullpen: BULLPEN_SLOTS.map(slot => ({ slot, seasonId: draft.picks.find(pick => pick.slot === slot)?.seasonId ?? null })),
  reliefRoles: draft.reliefRoles,
  reserves: null,
  ready: complete,
  complete,
  incomplete: `All ${draftRules(draft.schemaVersion).slots.length} selected seasons must finish loading before the season can start.`,
  places(seasonId) {
   const origin = draft.picks.find(pick => pick.seasonId === seasonId)?.slot;
   if (!origin || !HITTER_SLOTS.includes(origin as HitterSlot)) return null;
   const legal = new Map(legalReassignments(draft, manifest, seasonId).map(option => [option.slot, option]));
   const selected = bySeason.get(seasonId)?.displayName ?? 'Selected player';
   // Every hitter slot: the current one, a legal move or swap, or the engine's reason it is unavailable.
   const options = HITTER_SLOTS.map((slot): LineupMove => {
    if (slot === origin) return { key: slot, available: false, label: slot, announce: '' };
    const allowed = legal.get(slot);
    if (allowed) {
     const swapWith = allowed.swapWith ? name(allowed.swapWith) : null;
     return {
      key: slot, available: true, label: swapWith ? `${slot} · swap with ${swapWith}` : `${slot} · open`,
      announce: swapWith ? `${selected} moved to ${slot}; ${swapWith} moves to ${origin}.` : `${selected} moved to ${slot}.`
     };
    }
    let reason = 'Assignment unavailable';
    try { reassignPick(draft, manifest, seasonId, slot); }
    catch (error) { if (!(error instanceof Error)) throw error; reason = error.message; }
    return { key: slot, available: false, label: `${slot} · ${reason}`, announce: '' };
   });
   return { current: origin, options };
  }
 };
}
