import { describe, expect, it } from 'vitest';
import { parseCsv, type CsvRow } from '../../../scripts/data/acquire.ts';
import { buildBaselines } from '../../../scripts/data/baselines.ts';
import { applyDefense } from '../../../scripts/data/defense.ts';
import { buildBullpenCandidates } from '../../../scripts/data/bullpens.ts';
import { buildGallery, canonicalJSON, compileData } from '../../../scripts/data/compile.ts';
import { battingColumns, battingCounts, groupCounts, pitchingColumns, pitchingCounts, seasonKey } from '../../../scripts/data/counts.ts';
import { buildFielding, leagueFielding } from '../../../scripts/data/fielding.ts';
import { assignHitters } from '../../../scripts/data/opponents.ts';
import { groupJoinedWarRows } from '../../../scripts/data/source-join.ts';
import { compileProfiles, percentile } from '../../../scripts/data/profiles.ts';
import { POSITIONS, SLOTS, compareId, type DefensiveEnvironment, type Rates, type ShowcaseCard } from '../game/types.ts';
import { validateProfile } from '../sim/validation.ts';
import { syntheticAttribution, syntheticTables } from './compiler-fixtures.ts';

const DEFENSE_ENVIRONMENT: DefensiveEnvironment = {
 leagueRates: [0.08, 0.012, 0.225, 0.145, 0.044, 0.004, 0.033, 0.457] as Rates,
 leagueErrorRates: Object.fromEntries(POSITIONS.map(position => [position, 0.01])) as Record<typeof POSITIONS[number], number>,
 leagueStealAttempt: 0.03,
 leagueStealSuccess: 0.75,
 leagueDoublePlay: 0.08
};

const UNMATCHED_REQUIRED_WAR_SOURCE: CsvRow[] = [{
 key_bbref: 'missing-source-person',
 year_ID: '2000',
 lg_ID: 'AL',
 team_ID: 'OLD0',
 stint_ID: '1',
 franch_ID: 'F0',
 sched: '162',
 pa: '600',
 innings: '0',
 fld162: '0',
 gms_C: '0',
 gms_1B: '0',
 gms_2B: '0',
 gms_3B: '0',
 gms_SS: '0',
 gms_LF: '0',
 gms_CF: '0',
 gms_RF: '0',
 gms_OF: '0'
}];

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
  expect(first.primaryHitterSlot).toBe('C');
  expect(first.appearances.C).toBe(100);
  expect(first.batting).toMatchObject({ SF: 0, PA: 314 });
  expect(first.estimatedFields).toContain('batting.SF.estimated');
  expect(first.battingRates).toHaveLength(8);
  expect(first.battingRates!.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
  expect(first.battingRates!.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  expect(result.franchises.find(franchise => franchise.id === 'F0')!.name).toBe('Current club 0');
  expect(result.franchises.find(franchise => franchise.id === 'F2')!.decades).toEqual([2020]);
 });
 it('includes DH appearances in primary-slot selection and breaks ties in canonical hitter-slot order', () => {
  const tables = syntheticTables();
  const appearance = tables.Appearances.find(row => row.yearID === '1950' && row.teamID === 'OLD0' && row.G_c === '100')!;
  appearance.G_dh = '120';
  const dhPrimary = compileProfiles(tables).profiles.find(profile => profile.seasonId === seasonKey(appearance))!;
  expect(dhPrimary.primaryHitterSlot).toBe('DH');

  appearance.G_dh = '100';
  const tied = compileProfiles(tables).profiles.find(profile => profile.seasonId === seasonKey(appearance))!;
  expect(tied.primaryHitterSlot).toBe('C');
 });
 it('keeps fielding appearances but clears the primary hitter slot for pitching-only candidates', () => {
  const tables = syntheticTables();
  const pitcher = tables.Pitching.find(row => row.yearID === '1950' && row.teamID === 'OLD0' && row.GS === '20')!;
  tables.Appearances.push({
   yearID: pitcher.yearID,
   lgID: pitcher.lgID,
   teamID: pitcher.teamID,
   playerID: pitcher.playerID,
   G_1b: '1'
  });

  const profile = compileProfiles(tables).candidates.find(candidate => candidate.seasonId === seasonKey(pitcher))!;
  expect(profile.batting).toBeUndefined();
  expect(profile.appearances['1B']).toBe(1);
  expect(profile.eligibleSlots).toEqual(['SP1', 'SP2', 'SP3']);
  expect(profile.primaryHitterSlot).toBeNull();
  expect(() => validateProfile(profile)).not.toThrow();
 });
 it('uses the recorded PA lower bound for eligibility when sacrifice flies are unavailable', () => {
  const tables = syntheticTables();
  const batter = tables.Batting.find(row => row.yearID === '1950' && row.lgID === 'AL')!;
  batter.AB = '165';
  const profile = compileProfiles(tables).profiles.find(candidate => candidate.seasonId === seasonKey(batter))!;
  expect(profile.batting).toMatchObject({ SF: 0, PA: 199 });
  expect(profile.estimatedFields).toContain('batting.SF.estimated');
  expect(profile.eligibleSlots).not.toContain('C');
  expect(profile.eligibleSlots).not.toContain('DH');
 });

 it('includes the 1950 boundary and excludes pre-era records without replacing later historical fixtures', () => {
  const tables = syntheticTables();
  const sourceTeam = tables.Teams.find(row => row.yearID === '1950' && row.teamID === 'OLD0')!;
  const sourceBatter = tables.Batting.find(row => row.yearID === '1950' && row.teamID === 'OLD0')!;
  const playerID = 'boundary-1949';
  tables.Teams.push({ ...sourceTeam, yearID: '1949' });
  tables.People.push({ ID: 'boundary', playerID, nameFirst: 'Example', nameLast: 'Player', bats: 'R', throws: 'R' });
  tables.Batting.push({ ...sourceBatter, playerID, yearID: '1949' });
  tables.Appearances.push({ yearID: '1949', lgID: 'AL', teamID: 'OLD0', playerID, G_c: '100' });

  const candidates = compileProfiles(tables).candidates;
  expect(candidates.some(profile => profile.year === 1949)).toBe(false);
  expect([1950, 1960, 1961].every(year => candidates.some(profile => profile.year === year))).toBe(true);
 });

 it('uses generic OF only as labelled throwing evidence and never as exact-position fielding', () => {
  const tables = syntheticTables();
  const exact = tables.FieldingOFsplit.find(row => row.yearID === '2025' && row.POS === 'LF')!;
  const cohortRows = tables.FieldingOFsplit.filter(row => row.yearID === '2025' && row.POS === 'LF').slice(0, 5);
  for (const row of cohortRows) {
   tables.FieldingOFsplit = tables.FieldingOFsplit.filter(candidate => candidate !== row);
   tables.Fielding.push({ ...row, POS: 'OF' });
  }
  const compiled = compileProfiles(tables);
  const profile = compiled.profiles.find(candidate => candidate.seasonId === seasonKey(exact))!;
  applyDefense([profile], compiled.fielding, groupJoinedWarRows([], { people: tables.People, teams: tables.Teams }), DEFENSE_ENVIRONMENT);
  expect(profile.eligibleSlots).toContain('LF');
  expect(profile.eligibleSlots).not.toContain('CF');
  expect(profile.fielding.LF).toBeUndefined();
  expect(profile.defense.positions.LF!.outfieldThrowing).toBeDefined();
  expect(profile.defense.positions.LF!.evidence.outfieldThrowing.status).toBe('genericOutfield');
  expect(profile.defense.positions.LF!.expectedRunsSaved162).toBeNull();
 });
 it('uses unsplit generic outfield evidence at the 1950 boundary', () => {
  const tables = syntheticTables();
  const source = tables.Fielding.find(row => row.yearID === '1950' && row.POS === 'OF')!;
  const compiled = compileProfiles(tables);
  const profile = compiled.profiles.find(candidate => candidate.seasonId === seasonKey(source))!;
  const position = POSITIONS.find(candidate => (profile.appearances[candidate] ?? 0) > 0)!;
  applyDefense([profile], compiled.fielding, groupJoinedWarRows([], { people: tables.People, teams: tables.Teams }), DEFENSE_ENVIRONMENT);
  expect(profile.eligibleSlots).toContain(position);
  expect(profile.fielding[position]).toBeUndefined();
  expect(profile.defense.positions[position]!.evidence.outfieldThrowing.status).toBe('genericOutfield');
  expect(profile.defense.positions[position]!.evidence.hitPrevention.status).toBe('neutralMissingEvidence');
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
  const malformedSFRow = tables.Batting.find(candidate => candidate.yearID === '1961')!;
  const malformedSF = groupCounts([{ ...malformedSFRow, SF: 'not-a-count' }], battingColumns).get(seasonKey(malformedSFRow))!;
  expect(() => battingCounts(malformedSF)).toThrow('Missing or malformed counts: SF');
 });
 it('includes non-draft hitters in PA-weighted baselines and keeps pitching priors separate', () => {
  const tables = syntheticTables();
  const batter = tables.Batting.find(row => row.yearID === '1961' && row.lgID === 'AL')!;
  Object.assign(batter, { AB: '100', H: '10', '2B': '1', '3B': '1', HR: '1', BB: '10', HBP: '1', SO: '20', SH: '0', SF: '1' });
  const result = buildBaselines(tables);
  expect(result.batters.get(seasonKey(batter))!.counts.PA).toBe(112);
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
 it('builds fixed team-season bullpen remainders with deterministic leader exclusion and weighted rates', () => {
  const compiled = compileProfiles(syntheticTables());
  const relief = compiled.profiles.filter(profile => profile.year === 1950 && profile.teamId === 'OLD0' && profile.pitching?.G === 50);
  const leader = relief.find(profile => profile.pitching!.SV === 30)!;
  const second = relief.find(profile => profile !== leader)!;
  Object.assign(leader.pitching!, { SV: 30, IPouts: 180, BFP: 120 });
  Object.assign(second.pitching!, { G: 50, GS: 0, IPouts: 500, H: 40, HR: 4, BB: 10, HBP: 2, SO: 60, BFP: 200, ER: 15, SV: 20 });
  second.pitchingRates = [0.1, 0.1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.2];
  second.estimatedFields = ['pitching.BFP.estimated', 'PPF.neutral', 'speed.league'];
  const third = {
   ...second,
   seasonId: 'example-reliever:1950:AL:OLD0',
   playerId: 'example-reliever',
   displayName: 'Example Reliever',
   pitching: { G: 20, GS: 0, IPouts: 100, H: 10, HR: 1, BB: 5, HBP: 1, SO: 20, BFP: 100, ER: 5, SV: 10 },
   pitchingRates: [0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2] as typeof second.pitchingRates,
   estimatedFields: ['pitching.allowedExtraBaseHits.league']
  };
  compiled.profiles.push(third);

  const bullpen = buildBullpenCandidates(compiled).find(profile => profile.seasonId === 'bullpen:1950:AL:OLD0')!;
  expect(bullpen.playerId).toBe('bullpen:F0');
  expect(bullpen.displayName).toBe('Historical club 0 bullpen remainder');
  expect(bullpen.eligibleSlots).toEqual(['BP']);
  expect(bullpen.pitching).toMatchObject({ G: 70, GS: 0, IPouts: 600, H: 50, HR: 5, BB: 15, HBP: 3, SO: 80, BFP: 300, ER: 20, SV: 30 });
  expect(bullpen.pitchingRates![0]).toBeCloseTo(0.4 / 3, 12);
  expect(bullpen.pitchingRates![2]).toBeCloseTo(0.5 / 3, 12);
  expect(bullpen.bullpen).toEqual({
   members: [
    { seasonId: second.seasonId, playerId: second.playerId, displayName: second.displayName },
    { seasonId: third.seasonId, playerId: third.playerId, displayName: third.displayName }
   ],
   excluded: { seasonId: leader.seasonId, playerId: leader.playerId, displayName: leader.displayName }
  });
  expect(bullpen.estimatedFields).toEqual(expect.arrayContaining(['pooledRelief.BFPWeighted', 'throws.neutral', 'pitching.BFP.estimated', 'pitching.allowedExtraBaseHits.league', 'PPF.neutral']));
  expect(bullpen.estimatedFields).not.toContain('speed.league');
  expect(bullpen.bullpen!.members.some(member => member.seasonId.includes('-13:'))).toBe(false);
 });

 it('uses innings and identity to break saves ties and diagnoses unavailable remainders', () => {
  const compiled = compileProfiles(syntheticTables());
  const tied = compiled.profiles.filter(profile => profile.year === 1960 && profile.teamId === 'OLD0' && profile.pitching?.G === 50);
  tied[0].pitching!.SV = 10;
  tied[1].pitching!.SV = 10;
  tied[0].pitching!.IPouts = 200;
  tied[1].pitching!.IPouts = 100;

  const oneReliever = compiled.profiles.filter(profile => profile.year === 1950 && profile.teamId === 'OLD1' && profile.pitching?.G === 50);
  oneReliever[1].pitching!.GS = oneReliever[1].pitching!.G;
  const emptyRemainder = compiled.profiles.filter(profile => profile.year === 1960 && profile.teamId === 'OLD1' && profile.pitching?.G === 50);
  emptyRemainder.find(profile => profile.pitching!.SV === 0)!.pitching!.BFP = 0;

  const bullpens = buildBullpenCandidates(compiled);
  const tiedBullpen = bullpens.find(profile => profile.seasonId === 'bullpen:1960:AL:OLD0')!;
  expect(tiedBullpen.bullpen!.excluded.seasonId).toBe(tied[0].seasonId);
  tied[1].pitching!.IPouts = tied[0].pitching!.IPouts;
  const identityTiebreak = buildBullpenCandidates(compiled).find(profile => profile.seasonId === 'bullpen:1960:AL:OLD0')!;
  expect(identityTiebreak.bullpen!.excluded.seasonId).toBe(tied.map(profile => profile.seasonId).sort()[0]);
  expect(bullpens.some(profile => profile.seasonId === 'bullpen:1950:NL:OLD1')).toBe(false);
  expect(bullpens.some(profile => profile.seasonId === 'bullpen:1960:NL:OLD1')).toBe(false);
  expect(compiled.diagnostics).toContain('bullpen:1950:NL:OLD1: bullpen excluded: fewer than two relief-dominant pitcher-seasons');
  expect(compiled.diagnostics).toContain('bullpen:1960:NL:OLD1: bullpen excluded: remainder has no positive BFP');
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
  expect(() => compileData(tables, syntheticAttribution, 'fixture', [])).toThrow('WAR');
  const first = compileData(tables, syntheticAttribution, 'fixture', UNMATCHED_REQUIRED_WAR_SOURCE);
  const second = compileData(tables, syntheticAttribution, 'fixture', UNMATCHED_REQUIRED_WAR_SOURCE);
  expect(first.manifest.dataVersion).toBe(second.manifest.dataVersion);
  expect(first.manifest.franchises).toHaveLength(30);
  expect(first.manifest.showcaseUrl).toBe(`/data/${first.manifest.dataVersion}/showcase.json`);
  const showcase = first.files['showcase.json'] as ShowcaseCard[];
  expect(showcase).toHaveLength(32);
  expect(new Set(showcase.map(card => card.profile.seasonId)).size).toBe(32);
  expect(showcase.every(card => card.profile.eligibleSlots.includes(card.slot))).toBe(true);
  for (const key of Object.keys(first.manifest.chunks)) {
   const card = first.files[`gallery-${key}.json`] as ShowcaseCard;
   expect(card).toBeDefined();
   expect(card.profile.eligibleSlots.includes(card.slot)).toBe(true);
  }
  expect(first.manifest.coverage.slice(0, 2)).toEqual([
   { decade: 1950, firstYear: 1950, lastYear: 1950, label: '1950–1950' },
   { decade: 1960, firstYear: 1960, lastYear: 1961, label: '1960–1961' }
  ]);
  const simulation = first.files['simulation.json'] as {
   defenseMethodVersion: string;
   valuationVersion: string;
   opponents: { hitters: { eligibleSlots: string[]; defense: { positions: Record<string, unknown> } }[]; starters: unknown[] }[];
  };
  expect(simulation).toMatchObject({ defenseMethodVersion: 'defense-v1', valuationVersion: 'sim-war-v1' });
  expect(first.manifest.candidates.some(candidate => candidate.seasonId === 'bullpen:1950:AL:OLD0' && candidate.eligibleSlots.includes('BP'))).toBe(true);
  expect((first.files['F0-1950.json'] as { eligibleSlots: string[] }[]).some(profile => profile.eligibleSlots.includes('BP'))).toBe(true);
  expect(simulation.opponents).toHaveLength(30);
  for (const team of simulation.opponents) {
   expect(team.starters).toHaveLength(5);
   for (const hitter of team.hitters) {
    const slot = hitter.eligibleSlots[0];
    if (slot !== 'DH') expect(hitter.defense.positions[slot]).toBeDefined();
   }
   expect(team.hitters.map(profile => profile.eligibleSlots[0]).sort()).toEqual([...POSITIONS, 'DH'].sort());
  }
  expect(first.manifest.diagnostics.excludedBatting).toBe(0);
  expect(canonicalJSON({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
 });
 it('selects the smallest validated season and first canonical slot independent of chunk order', () => {
  const profiles = compileProfiles(syntheticTables()).profiles.filter(profile => profile.franchiseId === 'F0' && Math.floor(profile.year / 10) * 10 === 1960);
  const expected = [...profiles].sort((a, b) => compareId(a.seasonId, b.seasonId)).find(profile => SLOTS.some(slot => profile.eligibleSlots.includes(slot)))!;
  const gallery = buildGallery({ 'F0-1960': [...profiles].reverse() });
  expect(gallery['F0-1960']).toMatchObject({ profile: { seasonId: expected.seasonId }, slot: SLOTS.find(slot => expected.eligibleSlots.includes(slot)) });
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
