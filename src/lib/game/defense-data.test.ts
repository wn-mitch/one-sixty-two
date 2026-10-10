import { describe, expect, it, vi } from 'vitest';

// The first defensive valuation traces the full skill lattice once per contact model.
vi.setConfig({ testTimeout: 120_000 });
import { applyDefense } from '../../../scripts/data/defense.ts';
import { buildFielding } from '../../../scripts/data/fielding.ts';
import type { CsvRow } from '../../../scripts/data/acquire.ts';
import type { Row, Tables } from '../../../scripts/data/counts.ts';
import { groupJoinedWarRows } from '../../../scripts/data/source-join.ts';
import { syntheticProfile } from '../sim/fixtures.ts';
import { testDefenseEnvironment } from '../sim/test-fixtures.ts';
import type { Position, Profile } from './types.ts';

function fieldRow(playerID: string, position: Position | 'OF', overrides: Partial<Row> = {}): Row {
 return {
  playerID,
  yearID: '2000',
  lgID: 'AL',
  teamID: 'AAA',
  stint: '1',
  POS: position,
  PO: '1000',
  A: '200',
  E: '20',
  DP: '180',
  SB: '0',
  CS: '0',
  InnOuts: '4374',
  ...overrides
 };
}

function tablesWith(fielding: Row[], splits: Row[] = []): Tables {
 return {
  Teams: [{ yearID: '2000', lgID: 'AL', teamID: 'AAA', teamIDBR: 'AAA', franchID: 'F', G: '162' }],
  TeamsFranchises: [],
  People: [{ playerID: 'target', bbrefID: 'target01' }],
  Batting: [],
  Pitching: [],
  Appearances: [],
  Fielding: fielding,
  FieldingOFsplit: splits
 };
}

function targetProfile(position: Position, year = 2000): Profile {
 const profile = syntheticProfile('target');
 profile.seasonId = `target:${year}:AL:AAA`;
 profile.playerId = 'target';
 profile.teamId = 'AAA';
 profile.franchiseId = 'F';
 profile.year = year;
 profile.league = 'AL';
 profile.eligibleSlots = [position];
 profile.primaryHitterSlot = position;
 profile.appearances = { [position]: 162 };
 return profile;
}

function warRow(overrides: Partial<CsvRow> = {}): CsvRow {
 return {
  key_bbref: 'target01',
  year_ID: '2000',
  lg_ID: 'AL',
  team_ID: 'AAA',
  stint_ID: '1',
  franch_ID: 'F',
  sched: '162',
  pa: '600',
  innings: '0',
  fld162: '5',
  gms_C: '0',
  gms_1B: '0',
  gms_2B: '0',
  gms_3B: '0',
  gms_SS: '162',
  gms_LF: '0',
  gms_CF: '0',
  gms_RF: '0',
  gms_OF: '0',
  ...overrides
 };
}

function groupedWar(data: Tables, rows: CsvRow[]) {
 return groupJoinedWarRows(rows, { people: data.People, teams: data.Teams });
}

describe('canonical defensive source compilation', () => {
 it('publishes distinct complete evidence, aggregate DEF and non-applicable skills', () => {
  const profile = targetProfile('SS');
  const data = tablesWith([
   fieldRow('target', 'SS'),
   fieldRow('cohort', 'SS', { PO: '4000', A: '800', E: '80', DP: '720', InnOuts: '17496' })
  ]);
  const diagnostics = applyDefense([profile], buildFielding(data), groupedWar(data, [warRow()]), testDefenseEnvironment());
  const defense = profile.defense.positions.SS!;

  expect(diagnostics).toMatchObject({ aggregateAvailable: 1, aggregateUnavailable: 0, partialSeasonRows: 0 });
  const expectedRuns = defense.expectedRunsSaved162;
  expect(expectedRuns).not.toBeNull();
  expect(Number.isFinite(expectedRuns!)).toBe(true);
  expect(defense.residualClamped).toBe(false);
  expect(expectedRuns!).toBeCloseTo(4374 * 5 / (4374 + 2700), 8);
  expect(defense.evidence.hitPrevention).toMatchObject({ status: 'exact', exposure: 4374 });
  expect(defense.evidence.errorAvoidance).toMatchObject({ status: 'exact', exposure: 1220 });
  expect(defense.evidence.doublePlay).toMatchObject({ status: 'exact', exposure: 4374 });
  expect(defense.evidence.outfieldThrowing.status).toBe('notApplicable');
  expect(defense.evidence.catcherThrowing.status).toBe('notApplicable');
 });

 it('keeps a measured zero aggregate DEF distinct from unavailable evidence', () => {
  const profile = targetProfile('SS');
  const data = tablesWith([
   fieldRow('target', 'SS'),
   fieldRow('cohort', 'SS', { PO: '4000', A: '800', E: '80', DP: '720', InnOuts: '17496' })
  ]);
  applyDefense([profile], buildFielding(data), groupedWar(data, [warRow({ fld162: '0' })]), testDefenseEnvironment());
  const defense = profile.defense.positions.SS!;
  expect(defense.expectedRunsSaved162).toBe(0);
  expect(defense.hitPrevention).toBe(0);
  expect(defense.evidence.hitPrevention).toMatchObject({ status: 'exact', exposure: 4374 });
 });

 it('keeps one incomplete stint from masquerading as complete DP evidence without discarding complete aggregate innings', () => {
  const profile = targetProfile('SS');
  const data = tablesWith([
   fieldRow('target', 'SS', { stint: '1', PO: '500', A: '100', E: '10', DP: '90', InnOuts: '2187' }),
   fieldRow('target', 'SS', { stint: '2', PO: '500', A: '100', E: '10', DP: '', InnOuts: '2187' }),
   fieldRow('cohort', 'SS', { PO: '4000', A: '800', E: '80', DP: '720', InnOuts: '17496' })
  ]);
  applyDefense([profile], buildFielding(data), groupedWar(data, [warRow()]), testDefenseEnvironment());
  const defense = profile.defense.positions.SS!;

  expect(defense.doublePlay).toBe(0);
  expect(defense.evidence.doublePlay).toMatchObject({ status: 'neutralMissingEvidence', exposure: 0 });
  expect(defense.evidence.doublePlay.reason).toContain('incomplete');
  expect(defense.evidence.errorAvoidance.status).toBe('exact');
  expect(defense.evidence.hitPrevention.status).toBe('exact');
  expect(defense.expectedRunsSaved162).not.toBeNull();
 });

 it('excludes an incomplete latest-year aggregate row while retaining independently supported fielding skills', () => {
  const profile = targetProfile('SS', 2025);
  const target = fieldRow('target', 'SS', { yearID: '2025' });
  const cohort = fieldRow('cohort', 'SS', { yearID: '2025', PO: '4000', A: '800', E: '80', DP: '720', InnOuts: '17496' });
  const data = tablesWith([target, cohort]);
  data.Teams[0] = { ...data.Teams[0], yearID: '2025' };
  const source = warRow({ year_ID: '2025', sched: '20' });
  const diagnostics = applyDefense([profile], buildFielding(data), groupedWar(data, [source]), testDefenseEnvironment());
  const defense = profile.defense.positions.SS!;

  expect(diagnostics).toMatchObject({ partialSeasonRows: 1, aggregateAvailable: 0, aggregateUnavailable: 1 });
  expect(defense.expectedRunsSaved162).toBeNull();
  expect(defense.hitPrevention).toBe(0);
  expect(defense.evidence.hitPrevention.status).toBe('neutralMissingEvidence');
  expect(defense.evidence.errorAvoidance.status).toBe('exact');
  expect(defense.evidence.doublePlay.status).toBe('exact');
 });

 it('prefers exact outfield evidence and never adds generic OF totals to a split position', () => {
  const exact = fieldRow('target', 'LF', { A: '100' });
  const cohort = fieldRow('cohort', 'LF', { A: '400', InnOuts: '17496' });
  const generic = fieldRow('target', 'OF', { A: '9999' });
  const baseTables = tablesWith([], [exact, cohort]);
  const mixedTables = tablesWith([generic], [exact, cohort]);
  const base = targetProfile('LF');
  const mixed = targetProfile('LF');
  const source = warRow({ gms_SS: '0', gms_LF: '162' });

  applyDefense([base], buildFielding(baseTables), groupedWar(baseTables, [source]), testDefenseEnvironment());
  applyDefense([mixed], buildFielding(mixedTables), groupedWar(mixedTables, [source]), testDefenseEnvironment());
  expect(mixed.defense.positions.LF!.evidence.outfieldThrowing.status).toBe('exact');
  expect(mixed.defense.positions.LF!.outfieldThrowing).toBe(base.defense.positions.LF!.outfieldThrowing);
 });
});
