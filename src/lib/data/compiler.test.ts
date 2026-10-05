import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../scripts/data/acquire.ts';
import { buildBaselines } from '../../../scripts/data/baselines.ts';
import { canonicalJSON, compileData } from '../../../scripts/data/compile.ts';
import { battingColumns, battingCounts, groupCounts, pitchingColumns, pitchingCounts, seasonKey } from '../../../scripts/data/counts.ts';
import { buildFielding, leagueFielding } from '../../../scripts/data/fielding.ts';
import { assignHitters } from '../../../scripts/data/opponents.ts';
import { compileProfiles, percentile } from '../../../scripts/data/profiles.ts';
import { POSITIONS } from '../game/types.ts';
import { syntheticAttribution, syntheticTables } from './compiler-fixtures.ts';

describe('historical data compiler', () => {
 it('sums repeated stints but keeps traded team-seasons distinct', () => {
  const row = syntheticTables().Batting[0];
  const groups = groupCounts([row, { ...row, stint: '2' }, { ...row, teamID: 'TRADE', stint: '3' }], battingColumns);
  expect(groups.size).toBe(2);
  expect(battingCounts(groups.get(seasonKey(row))!).AB).toBe(560);
  expect(battingCounts(groups.get(seasonKey({ ...row, teamID: 'TRADE' }))!).AB).toBe(280);
 });
 it('uses BOM-safe playerID columns rather than the leading numeric ID', () => {
  expect(parseCsv('People.csv', new TextEncoder().encode('\uFEFFID,playerID,nameFirst,nameLast\r\n7,anonymous,Player,Example\r\n'))[0]).toEqual({ ID: '7', playerID: 'anonymous', nameFirst: 'Player', nameLast: 'Example' });
 });
 it('uses exact historical franchise joins and appearances without a stint', () => {
  const tables = syntheticTables();
  const result = compileProfiles(tables);
  const first = result.candidates.find(profile => profile.seasonId === seasonKey(tables.Batting[0]))!;
  expect(first.franchiseId).toBe('F0');
  expect(first.historicalTeam).toBe('Historical club 0');
  expect(first.eligibleSlots).toEqual(['C', 'DH']);
  expect(first.appearances.C).toBe(100);
  expect(result.franchises.find(franchise => franchise.id === 'F0')!.name).toBe('Current club 0');
  expect(result.franchises.find(franchise => franchise.id === 'F2')!.decades).toEqual([2020]);
 });
 it('does not turn generic OF into positional eligibility and uses labelled reliability fallback', () => {
  const tables = syntheticTables();
  const exact = tables.FieldingOFsplit.find(row => row.yearID === '2025' && row.POS === 'LF')!;
  tables.FieldingOFsplit = tables.FieldingOFsplit.filter(row => row !== exact);
  tables.Fielding.push({ ...exact, POS: 'OF' });
  const profile = compileProfiles(tables).profiles.find(profile => profile.seasonId === seasonKey(exact))!;
  expect(profile.estimatedFields).toContain('fielding.LF.genericOF');
  expect(profile.eligibleSlots).toContain('LF');
  expect(profile.eligibleSlots).not.toContain('CF');
  expect(profile.errorRates.LF).toBeGreaterThan(0);
 });
 it('does not double count generic OF or duplicate exact OF rows in league baselines', () => {
  const tables = syntheticTables();
  const before = leagueFielding(buildFielding(tables), '2025:ALL');
  const exact = tables.FieldingOFsplit.find(row => row.yearID === '2025' && row.POS === 'LF')!;
  tables.Fielding.push({ ...exact, POS: 'OF', E: '9000' }, { ...exact, E: '9000' });
  expect(leagueFielding(buildFielding(tables), '2025:ALL')).toEqual(before);
 });
 it('reports invalid core counts and rejects impossible derived event counts', () => {
  const tables = syntheticTables();
  const row = tables.Batting[0];
  row.H = '9999';
  const result = buildBaselines(tables);
  expect(result.batters.has(seasonKey(row))).toBe(false);
  expect(result.diagnostics.some(message => message.startsWith(`${seasonKey(row)}: batting excluded:`))).toBe(true);
  const malformed = groupCounts([{ ...row, H: 'bad' }], battingColumns).get(seasonKey(row))!;
  expect(() => battingCounts(malformed)).toThrow('Missing or malformed');
 });
 it('includes non-draft hitters in PA-weighted baselines and keeps pitching priors separate', () => {
  const tables = syntheticTables();
  Object.assign(tables.Batting[0], { AB: '100', H: '10', '2B': '1', '3B': '1', HR: '1', BB: '10', HBP: '1', SO: '20', SH: '0', SF: '1' });
  const result = buildBaselines(tables);
  expect(result.batters.get(seasonKey(tables.Batting[0]))!.counts.PA).toBe(112);
  expect(result.leagues.get('1961:AL')!.batting[0]).toBeCloseTo((8 * 30 + 10) / (8 * 317 + 112), 12);
  expect(result.leagues.get('1961:AL')!.pitching[0]).toBeCloseTo(240 / 3300, 12);
  expect(result.target[0]).toBeCloseTo(30 / 317, 12);
 });
 it('estimates missing BFP and optional baserunning with explicit labels', () => {
  const tables = syntheticTables();
  tables.Pitching[0].BFP = '';
  tables.Batting[0].SB = '';
  const counts = pitchingCounts(groupCounts([tables.Pitching[0]], pitchingColumns).get(seasonKey(tables.Pitching[0]))!);
  expect(counts.BFP).toBe(counts.IPouts + counts.H + counts.BB + counts.HBP);
  const profiles = compileProfiles(tables).profiles;
  expect(profiles.find(profile => profile.seasonId === seasonKey(tables.Pitching[0]))!.estimatedFields).toContain('pitching.BFP.estimated');
  expect(profiles.find(profile => profile.seasonId === seasonKey(tables.Batting[0]))!.estimatedFields).toContain('baserunning.league');
 });
 it('finds the exact maximum-PA assignment instead of greedily spending a scarce position', () => {
  const profiles = compileProfiles(syntheticTables()).profiles.filter(profile => profile.year === 2025 && profile.teamId === 'NEW0' && profile.batting).map(profile => ({ ...profile, appearances: { ...profile.appearances }, batting: { ...profile.batting! } }));
  const catcher = profiles.find(profile => profile.appearances.C)!;
  const firstBase = profiles.find(profile => profile.appearances['1B'])!;
  catcher.appearances['1B'] = 100;
  catcher.batting.PA = 1000;
  firstBase.appearances = { C: 100 };
  firstBase.batting.PA = 250;
  const assigned = assignHitters(profiles);
  expect(assigned[0].seasonId).toBe(firstBase.seasonId);
  expect(assigned[1].seasonId).toBe(catcher.seasonId);
  expect(new Set(assigned.map(profile => profile.playerId)).size).toBe(9);
 });
 it('compiles all thirty opponents, versioned chunks and exact slot assignments reproducibly', () => {
  const tables = syntheticTables();
  const first = compileData(tables, syntheticAttribution, 'fixture');
  const second = compileData(tables, syntheticAttribution, 'fixture');
  expect(first.manifest.dataVersion).toBe(second.manifest.dataVersion);
  expect(first.manifest.franchises).toHaveLength(30);
  expect(first.manifest.coverage[0]).toEqual({ decade: 1960, firstYear: 1961, lastYear: 1961, label: '1961–1961' });
  const simulation = first.files['simulation.json'] as { opponents: { hitters: { eligibleSlots: string[] }[]; starters: unknown[] }[] };
  expect(simulation.opponents).toHaveLength(30);
  for (const team of simulation.opponents) {
   expect(team.starters).toHaveLength(5);
   expect(team.hitters.map(profile => profile.eligibleSlots[0]).sort()).toEqual([...POSITIONS, 'DH'].sort());
  }
  expect(first.manifest.diagnostics.excludedBatting).toBe(0);
  expect(canonicalJSON({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
 });
 it('fails a missing current club instead of manufacturing opposition', () => {
  const tables = syntheticTables();
  tables.Teams = tables.Teams.filter(row => row.teamID !== 'NEW29');
  expect(() => compileProfiles(tables)).toThrow('thirty distinct current franchises');
 });
 it('uses tied speed percentile ranks rather than unstable ordering', () => {
  expect(percentile([0, 0, 1], 0)).toBe(0.25);
  expect(percentile([0, 0, 1], 1)).toBe(1);
 });
});
