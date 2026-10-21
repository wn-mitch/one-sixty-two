import { availableCandidates, legalReassignments, legalSlots, rollContains, rollKey } from './draft.ts';
import { draftRules } from './rules.ts';
import { classicRosterView, type RosterMove, type RosterView } from './roster-view.ts';
import type { Draft, FieldSlot, Manifest, Profile } from './types.ts';

/** A sort a mode adds to the candidate grid beside WAR and OPS / ERA; `compare` orders two offered seasons. */
export interface BoardSort { value: string; label: string; compare(a: Profile, b: Profile): number }

/**
 * What the draft board offers and allows, built by each mode: Classic from the current roll,
 * Draft Mode from the held pile.
 */
export interface BoardSource {
 /** Changes when the offer or the roster changes; the board then clears its selection and browsing. */
 readonly key: string;
 readonly roster: RosterView;
 /** Seasons on offer now. */
 readonly offer: readonly Profile[];
 /** Seasons of one athlete share one card with a season choice; otherwise every season is its own card. */
 readonly groupSeasons: boolean;
 readonly pickNumber: number;
 readonly pickCount: number;
 /** Shown in place of the offer while there is none yet. */
 readonly waiting: string | null;
 readonly sorts: readonly BoardSort[];
 /** Whether `seasonId` can be drafted now. */
 viable(seasonId: string): boolean;
 /** Open slots `seasonId` could be drafted into. */
 destinations(seasonId: string): readonly FieldSlot[];
 /** Whether `seasonId` may be drafted onto the bench. */
 benches(seasonId: string): boolean;
 /** Where a rostered card may move. */
 moves(seasonId: string): readonly RosterMove[];
}

/** Classic's board: the current roll's unused players and franchises, placed straight into open slots. */
export function classicBoardSource(draft: Draft, manifest: Manifest, pool: readonly Profile[]): BoardSource {
 const roll = draft.currentRoll;
 const bySeason = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
 const usedPlayers = new Set(draft.picks.map(pick => bySeason.get(pick.seasonId)?.playerId));
 const usedFranchises = new Set(draft.picks.map(pick => pick.franchiseId));
 const viable = new Set(availableCandidates(draft, manifest).map(candidate => candidate.seasonId));
 const offer = roll ? pool.filter(profile => {
  const candidate = bySeason.get(profile.seasonId);
  return !!candidate && rollContains(roll, candidate) && !usedPlayers.has(candidate.playerId) && !usedFranchises.has(candidate.franchiseId);
 }) : [];
 return {
  key: `${draft.schemaVersion}:${draft.dataVersion}:${draft.seed}:${draft.picks.map(pick => pick.seasonId).join('|')}:${roll ? rollKey(roll) : ''}`,
  roster: classicRosterView(draft),
  offer,
  groupSeasons: true,
  pickNumber: draft.picks.length + 1,
  pickCount: draftRules(draft.schemaVersion).slots.length,
  waiting: roll ? null : 'Roll a franchise and era to open your next player pool.',
  sorts: [],
  viable: seasonId => viable.has(seasonId),
  destinations: seasonId => {
   const candidate = bySeason.get(seasonId);
   return candidate ? legalSlots(draft, candidate, manifest) : [];
  },
  benches: () => false,
  moves: seasonId => legalReassignments(draft, manifest, seasonId)
 };
}
