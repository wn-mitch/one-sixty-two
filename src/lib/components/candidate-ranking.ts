import { historicalBatting, historicalEra } from '../game/format.ts';
import { compareId } from '../game/types.ts';
import type { Profile, Slot } from '../game/types.ts';
import type { WarRankings } from '../rankings/types.ts';

export type RankingKind = 'Hitters' | 'Pitchers' | 'Bullpens';
export type RankingSort = 'war' | 'metrics';
export type CandidateEntry = { profile: Profile; slots: Slot[] };
export type CandidateGroup = { key: string; name: string; playerId: string; kind: RankingKind; entries: CandidateEntry[] };
const kindOrder: Record<RankingKind, number> = { Hitters: 0, Pitchers: 1, Bullpens: 2 };

export function isHitter(slot: Slot): boolean {
 return slot !== 'CL' && slot !== 'BP' && !slot.startsWith('SP');
}

export function warValue(entry: CandidateEntry, kind: RankingKind, rankings: WarRankings | null): number | null {
 if (kind === 'Bullpens' || !entry.slots.some(slot => isHitter(slot) === (kind === 'Hitters'))) return null;
 const value = rankings?.seasons[entry.profile.seasonId]?.[kind === 'Hitters' ? 'battingWAR162' : 'pitchingWAR162'];
 return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function compareEntries(a: CandidateEntry, b: CandidateEntry, kind: RankingKind, sort: RankingSort, rankings: WarRankings | null): number {
 if (kind === 'Bullpens') {
  const ap = a.profile.pitching;
  const bp = b.profile.pitching;
  if (!!ap !== !!bp) return ap ? -1 : 1;
  if (ap && bp) return historicalEra(ap) - historicalEra(bp) || bp.IPouts - ap.IPouts || compareId(a.profile.seasonId, b.profile.seasonId);
 } else if (sort === 'war') {
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
  let kind: RankingKind = 'Pitchers';
  if (values.some(entry => entry.slots.includes('BP'))) {
   kind = 'Bullpens';
  } else if (values.some(entry => entry.slots.some(isHitter))) {
   kind = 'Hitters';
  }
  values.sort((a, b) => compareEntries(a, b, kind, sort, rankings));
  return { key: playerId, playerId, name: source.name, kind, entries: values };
 });
 return groups.sort((a, b) =>
  kindOrder[a.kind] - kindOrder[b.kind] ||
  compareEntries(a.entries[0], b.entries[0], a.kind, sort, rankings) ||
  compareId(a.playerId, b.playerId)
 );
}
