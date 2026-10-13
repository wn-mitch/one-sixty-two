import { historicalBatting, historicalEra } from '../game/format.ts';
import { compareId } from '../game/types.ts';
import type { HitterSlot, Profile, RosterSlot, Slot } from '../game/types.ts';
import type { WarRankings } from '../rankings/types.ts';

export type RankingKind = 'Hitters' | 'Pitchers';
export type RankingSort = 'war' | 'metrics';
export type CandidateEntry = { profile: Profile; slots: readonly RosterSlot[] };
export type CandidateGroup = { key: string; name: string; playerId: string; kind: RankingKind; entries: CandidateEntry[] };

export function isHitter(slot: RosterSlot): slot is HitterSlot {
 return slot !== 'CL' && slot !== 'BP' && !slot.startsWith('SP') && !slot.startsWith('RP');
}

export function warValue(entry: CandidateEntry, kind: RankingKind, rankings: WarRankings | null): number | null {
 if (!entry.slots.some(slot => isHitter(slot) === (kind === 'Hitters'))) return null;
 const value = rankings?.seasons[entry.profile.seasonId]?.[kind === 'Hitters' ? 'battingWAR162' : 'pitchingWAR162'];
 return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function compareEntries(a: CandidateEntry, b: CandidateEntry, kind: RankingKind, sort: RankingSort, rankings: WarRankings | null): number {
 if (sort === 'war') {
  const av = warValue(a, kind, rankings), bv = warValue(b, kind, rankings);
  if (av !== null && bv !== null) return bv - av || compareId(a.profile.seasonId, b.profile.seasonId);
  if (av !== bv) return av === null ? 1 : -1;
 } else if (kind === 'Hitters') {
  const av = a.slots.some(isHitter) ? a.profile.batting : undefined;
  const bv = b.slots.some(isHitter) ? b.profile.batting : undefined;
  if (!!av !== !!bv) return av ? -1 : 1;
  if (av && bv) return historicalBatting(bv).ops - historicalBatting(av).ops || bv.PA - av.PA || compareId(a.profile.seasonId, b.profile.seasonId);
 } else {
  const av = a.slots.some(slot => !isHitter(slot)) ? a.profile.pitching : undefined;
  const bv = b.slots.some(slot => !isHitter(slot)) ? b.profile.pitching : undefined;
  if (!!av !== !!bv) return av ? -1 : 1;
  if (av && bv) return historicalEra(av) - historicalEra(bv) || bv.IPouts - av.IPouts || compareId(a.profile.seasonId, b.profile.seasonId);
 }
 return compareId(a.profile.seasonId, b.profile.seasonId);
}

export function rankGroups(entries: CandidateEntry[], sort: RankingSort, rankings: WarRankings | null): CandidateGroup[] {
 const groupedEntries = new Map<string, { name: string; entries: Map<string, CandidateEntry> }>();
 for (const entry of entries) {
  let group = groupedEntries.get(entry.profile.playerId);
  if (!group) {
   group = { name: entry.profile.displayName, entries: new Map() };
   groupedEntries.set(entry.profile.playerId, group);
  }
  if (!group.entries.has(entry.profile.seasonId)) group.entries.set(entry.profile.seasonId, entry);
 }
 const groups = [...groupedEntries].map(([playerId, source]) => {
  const values = [...source.entries.values()];
  const kind: RankingKind = values.some(entry => entry.slots.some(isHitter)) ? 'Hitters' : 'Pitchers';
  values.sort((a, b) => compareEntries(a, b, kind, sort, rankings));
  return { key: playerId, playerId, name: source.name, kind, entries: values };
 });
 return mixGroups(groups, sort, rankings);
}

/**
 * One ranked list across hitters and pitchers. Each role keeps its own order; WAR/162 merges the
 * two directly, and OPS / ERA, which share no scale, interleave by each card's place within its role.
 */
export function mixGroups(
 groups: readonly CandidateGroup[],
 sort: RankingSort,
 rankings: WarRankings | null,
 lead: (group: CandidateGroup) => CandidateEntry = group => group.entries[0]
): CandidateGroup[] {
 const ranked = (kind: RankingKind) => groups
  .filter(group => group.kind === kind)
  .sort((a, b) => compareEntries(lead(a), lead(b), kind, sort, rankings) || compareId(a.playerId, b.playerId));
 const hitters = ranked('Hitters');
 const pitchers = ranked('Pitchers');
 const score = (group: CandidateGroup, index: number, size: number): number => {
  if (sort === 'war') return warValue(lead(group), group.kind, rankings) ?? -Infinity;
  // Lower is better for a place in the role, so it is negated to share WAR's higher-first order.
  return -(index + 1) / (size + 1);
 };
 const merged: CandidateGroup[] = [];
 let h = 0, p = 0;
 while (h < hitters.length || p < pitchers.length) {
  if (p >= pitchers.length) { merged.push(hitters[h++]); continue; }
  if (h >= hitters.length) { merged.push(pitchers[p++]); continue; }
  // Ties go to the hitter, as the pool's longer-standing first role.
  if (score(hitters[h], h, hitters.length) >= score(pitchers[p], p, pitchers.length)) merged.push(hitters[h++]);
  else merged.push(pitchers[p++]);
 }
 return merged;
}

/** The roles with no open slot left; their players can only displace someone already drafted. */
export function fullRoles(openSlots: readonly Slot[]): Set<RankingKind> {
 const full = new Set<RankingKind>();
 if (!openSlots.some(isHitter)) full.add('Hitters');
 if (!openSlots.some(slot => !isHitter(slot))) full.add('Pitchers');
 return full;
}

/**
 * Splits a ranked list into the cards that stay in the grid and those collapsed under a full
 * role. A card stays when it can still be placed, as a two-way player can in the other role.
 */
export function collapseFullRoles(
 groups: readonly CandidateGroup[],
 full: ReadonlySet<RankingKind>,
 placeable: (group: CandidateGroup) => boolean
): { shown: CandidateGroup[]; collapsed: CandidateGroup[] } {
 const shown: CandidateGroup[] = [], collapsed: CandidateGroup[] = [];
 for (const group of groups) (full.has(group.kind) && !placeable(group) ? collapsed : shown).push(group);
 return { shown, collapsed };
}
