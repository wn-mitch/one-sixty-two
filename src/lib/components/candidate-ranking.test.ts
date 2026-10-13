import { describe, expect, it } from 'vitest';
import { HITTER_SLOTS, type HitterSlot, type Profile, type Slot } from '../game/types.ts';
import type { WarRankings } from '../rankings/types.ts';
import { collapseFullRoles, compareEntries, fullRoles, rankGroups, warValue, type CandidateEntry } from './candidate-ranking.ts';

function entry(id: string, slots: Slot[] = ['DH'], playerId = id): CandidateEntry {
 const primaryHitterSlot = slots.find(slot => HITTER_SLOTS.includes(slot as HitterSlot)) as HitterSlot | undefined;
 const profile: Profile = {
  seasonId: id, playerId, displayName: 'Synthetic athlete', franchiseId: 'T', teamId: 'T', year: 2000, league: 'AL', historicalTeam: 'Synthetic club', teamGames: 162,
  bats: 'R', throws: 'R', eligibleSlots: slots, primaryHitterSlot: primaryHitterSlot ?? null, appearances: {}, fielding: {}, defense: { positions: {} },
  speed: 0.5, stealAttempt: 0, stealSuccess: 0.7, doublePlay: 0, estimatedFields: [],
  batting: { AB: 200, H: 60, doubles: 10, triples: 2, HR: 8, BB: 20, HBP: 0, SO: 40, SH: 0, SF: 0, SB: 0, CS: 0, GIDP: 0, PA: 220 },
  pitching: { G: 20, GS: 20, IPouts: 300, H: 80, HR: 10, BB: 20, HBP: 0, SO: 90, BFP: 400, ER: 30, SV: 0 }
 };
 return { profile, slots };
}
function rankings(seasons: WarRankings['seasons']): WarRankings {
 return { schemaVersion: 1, dataVersion: 'synthetic', rankingVersion: 'synthetic-war', source: { name: 'Synthetic rankings', url: 'https://example.invalid', licenceUrl: 'https://example.invalid/license', licenceText: 'Synthetic notice', commit: 'synthetic', description: 'Synthetic fixture' }, seasons, coverage: { candidates: 0, batting: 0, pitching: 0, missing: 0 } };
}

describe('candidate role ranking', () => {
 it('keeps negative and zero WAR ahead of missing values and breaks ties by season ID', () => {
  const data = rankings({ z: { battingWAR162: 0, pitchingWAR162: null }, b: { battingWAR162: -2, pitchingWAR162: null }, a: { battingWAR162: -2, pitchingWAR162: null }, missing: { battingWAR162: null, pitchingWAR162: null } });
  const entries = ['missing', 'b', 'z', 'a', 'absent'].map(id => entry(id));
  expect(entries.sort((a, b) => compareEntries(a, b, 'Hitters', 'war', data)).map(item => item.profile.seasonId)).toEqual(['z', 'a', 'b', 'absent', 'missing']);
 });
 it('ranks each player by the best eligible season, not their first or an unavailable role', () => {
  const data = rankings({ first: { battingWAR162: 1, pitchingWAR162: 20 }, best: { battingWAR162: 6, pitchingWAR162: 1 }, other: { battingWAR162: 4, pitchingWAR162: 7 } });
  const groups = rankGroups([entry('first', ['DH'], 'same'), entry('other'), entry('best', ['DH'], 'same')], 'war', data);
  expect(groups.map(group => group.playerId)).toEqual(['same', 'other']);
  expect(groups[0].entries.map(item => item.profile.seasonId)).toEqual(['best', 'first']);
  expect(warValue(entry('first', ['DH']), 'Pitchers', data)).toBeNull();
 });
 it('keeps two-way and pitching-only seasons in one athlete group while following the active role', () => {
  const data = rankings({ both: { battingWAR162: 2, pitchingWAR162: 9 }, pitching: { battingWAR162: null, pitchingWAR162: 11 }, other: { battingWAR162: 5, pitchingWAR162: 3 } });
  const all = rankGroups([entry('both', ['DH', 'SP1'], 'same'), entry('pitching', ['SP1'], 'same'), entry('other', ['DH', 'SP1'])], 'war', data);
  expect(all.map(group => `${group.kind}:${group.playerId}`)).toEqual(['Hitters:other', 'Hitters:same']);
  expect(all[1].entries.map(item => item.profile.seasonId)).toEqual(['both', 'pitching']);
  const pitchers = rankGroups([entry('both', ['SP1'], 'same'), entry('pitching', ['SP1'], 'same'), entry('other', ['SP1'])], 'war', data);
  expect(pitchers.map(group => `${group.kind}:${group.playerId}`)).toEqual(['Pitchers:same', 'Pitchers:other']);
  expect(pitchers[0].entries.map(item => item.profile.seasonId)).toEqual(['pitching', 'both']);
 });
 it('deduplicates exact seasons within the player identity group', () => {
  const duplicate = entry('same-season', ['DH'], 'same-player');
  const groups = rankGroups([duplicate, duplicate, entry('other-season', ['DH'], 'same-player')], 'metrics', null);
  expect(groups).toHaveLength(1);
  expect(groups[0].key).toBe('same-player');
  expect(groups[0].entries.map(item => item.profile.seasonId)).toEqual(['other-season', 'same-season']);
 });
 it('ranks relievers with the pitchers by pitching WAR', () => {
  const closer = entry('closer', ['CL', 'RP1', 'RP2', 'RP3'], 'closer');
  const starter = entry('starter', ['SP1', 'SP2', 'SP3'], 'starter');
  const data = rankings({ closer: { battingWAR162: null, pitchingWAR162: 3 }, starter: { battingWAR162: null, pitchingWAR162: 2 } });
  expect(rankGroups([starter, closer], 'war', data).map(group => `${group.kind}:${group.playerId}`)).toEqual(['Pitchers:closer', 'Pitchers:starter']);
  expect(warValue(closer, 'Pitchers', data)).toBe(3);
  expect(warValue(closer, 'Hitters', data)).toBeNull();
 });
 it('uses stable identity order without rankings, never an implicit OPS fallback', () => {
  const a = entry('a'), z = entry('z');
  z.profile.batting!.H = 100;
  expect(compareEntries(a, z, 'Hitters', 'war', null)).toBeLessThan(0);
  expect(compareEntries(a, z, 'Hitters', 'metrics', null)).toBeGreaterThan(0);
 });
 it('preserves OPS/ERA direction, workload ties and stable final ties', () => {
  const a = entry('a'), b = entry('b');
  expect(compareEntries(a, b, 'Hitters', 'metrics', null)).toBeLessThan(0);
  b.profile.batting!.PA = 300;
  expect(compareEntries(a, b, 'Hitters', 'metrics', null)).toBeGreaterThan(0);
  const p = entry('p', ['CL']), q = entry('q', ['CL']);
  q.profile.pitching!.ER = 20;
  expect(compareEntries(p, q, 'Pitchers', 'metrics', null)).toBeGreaterThan(0);
  q.profile.pitching!.ER = 60; q.profile.pitching!.IPouts = 600;
  expect(compareEntries(p, q, 'Pitchers', 'metrics', null)).toBeGreaterThan(0);
 });
 it('rejects nonfinite enrichment as unavailable and keeps the comparator antisymmetric', () => {
  const data = rankings({ a: { battingWAR162: Number.NaN, pitchingWAR162: Infinity }, b: { battingWAR162: -1, pitchingWAR162: -1 } });
  const a = entry('a'), b = entry('b');
  expect(warValue(a, 'Hitters', data)).toBeNull();
  expect(compareEntries(a, b, 'Hitters', 'war', data)).toBe(-compareEntries(b, a, 'Hitters', 'war', data));
  expect(compareEntries(a, a, 'Hitters', 'war', data)).toBe(0);
 });
 it('ranks hitters and pitchers in one list by WAR/162 rather than hitters first', () => {
  const data = rankings({ h3: { battingWAR162: 3, pitchingWAR162: null }, p5: { battingWAR162: null, pitchingWAR162: 5 }, h1: { battingWAR162: 1, pitchingWAR162: null }, p2: { battingWAR162: null, pitchingWAR162: 2 } });
  const groups = rankGroups([entry('h1'), entry('p2', ['SP1']), entry('h3'), entry('p5', ['CL'])], 'war', data);
  expect(groups.map(group => group.playerId)).toEqual(['p5', 'h3', 'p2', 'h1']);
 });
 it('interleaves OPS and ERA by place within each role, since they share no scale', () => {
  const hitters = [400, 300, 200, 100].map((hits, index) => { const item = entry(`h${index + 1}`); item.profile.batting!.H = hits; item.profile.batting!.AB = 500; return item; });
  const pitchers = [10, 40].map((earned, index) => { const item = entry(`p${index + 1}`, ['SP1']); item.profile.pitching!.ER = earned; return item; });
  // Places within role: hitters 1/5…4/5, pitchers 1/3 and 2/3.
  expect(rankGroups([...pitchers, ...hitters].reverse(), 'metrics', null).map(group => group.playerId)).toEqual(['h1', 'p1', 'h2', 'h3', 'p2', 'h4']);
 });
 it('collapses a full role but keeps two-way players who can still be placed in the other role', () => {
  expect([...fullRoles(['SP2', 'CL'])]).toEqual(['Hitters']);
  expect([...fullRoles(['DH'])]).toEqual(['Pitchers']);
  expect(fullRoles(['DH', 'RP1']).size).toBe(0);
  const groups = rankGroups([entry('bat'), entry('both', ['DH', 'SP1']), entry('arm', ['SP1'])], 'metrics', null);
  const { shown, collapsed } = collapseFullRoles(groups, fullRoles(['SP1']), group => group.playerId !== 'bat');
  expect(collapsed.map(group => group.playerId)).toEqual(['bat']);
  expect(shown.map(group => group.playerId).sort()).toEqual(['arm', 'both']);
 });
});
