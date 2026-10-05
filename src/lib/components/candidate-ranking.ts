import { historicalBatting, historicalEra } from '../game/format.ts';
import { compareId, type Profile, type Slot } from '../game/types.ts';
import type { WarRankings } from '../rankings/types.ts';

export type RankingKind = 'Hitters' | 'Pitchers';
export type RankingSort = 'war' | 'metrics';
export type CandidateEntry = { profile: Profile; slots: Slot[] };
export type CandidateGroup = { key: string; name: string; playerId: string; kind: RankingKind; entries: CandidateEntry[] };
export const isHitter = (slot: Slot): boolean => slot !== 'CL' && !slot.startsWith('SP');

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
 const groups = new Map<string, CandidateGroup>();
 for (const entry of entries) {
  for (const kind of ['Hitters', 'Pitchers'] as const) {
   if (!entry.slots.some(slot => isHitter(slot) === (kind === 'Hitters'))) continue;
   const key = `${entry.profile.playerId}:${kind}`;
   let group = groups.get(key);
   if (!group) {
    group = { key, playerId: entry.profile.playerId, name: entry.profile.displayName, kind, entries: [] };
    groups.set(key, group);
   }
   group.entries.push(entry);
  }
 }
 for (const group of groups.values()) group.entries.sort((a, b) => compareEntries(a, b, group.kind, sort, rankings));
 return [...groups.values()].sort((a, b) => a.kind !== b.kind ? a.kind === 'Hitters' ? -1 : 1 : compareEntries(a.entries[0], b.entries[0], a.kind, sort, rankings));
}
