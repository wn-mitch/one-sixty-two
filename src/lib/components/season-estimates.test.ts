import { describe, expect, it } from 'vitest';
import { POSITIONS } from '../game/types.ts';
import { seasonEstimates } from './season-estimates.ts';

const profile = { estimatedFields: [
 ...POSITIONS.map(position => `fielding.${position}.league`), 'catcherCS.league',
 'bats.neutral', 'throws.neutral', 'BPF.neutral', 'PPF.neutral',
 'baserunning.league', 'doublePlay.league', 'speed.league', 'pitching.allowedExtraBaseHits.league'
] };

describe('role-relevant plain-language estimates', () => {
 it('never reports the eight compiler-populated fielding estimates for a DH or pitcher', () => {
  const dh = seasonEstimates(profile, ['DH']).join(' ');
  expect(dh).not.toMatch(/catcher|first base|error rate|pitcher platoon|doubles and triples allowed/);
  expect(dh).toMatch(/Batting handedness/);
  expect(dh).toMatch(/steal-attempt/);
  expect(dh).toMatch(/double-play probability/);
  expect(dh).toMatch(/middle-of-the-pack/);
  const pitcher = seasonEstimates(profile, ['SP1', 'SP2', 'SP3']).join(' ');
  expect(pitcher).not.toMatch(/caught-stealing|extra-base advancement|Batting handedness|error rate/);
  expect(pitcher).toMatch(/Throwing handedness/);
  expect(pitcher).toMatch(/doubles and triples allowed/);
  expect(pitcher).toMatch(/pitching park factor/);
 });
 it('restricts defensive notes to legal positions, then narrows to the selected slot', () => {
  const legal = seasonEstimates(profile, ['C', '1B', 'DH']).join(' ');
  expect(legal).toMatch(/At catcher/);
  expect(legal).toMatch(/At first base/);
  expect(legal).not.toMatch(/At shortstop|At left field/);
  expect(seasonEstimates(profile, ['C', 'DH'], 'DH').join(' ')).not.toMatch(/At catcher|catcher stolen-base/);
  expect(seasonEstimates(profile, ['DH'], 'C')).toEqual(seasonEstimates(profile, ['DH']));
 });
 it('explains generic outfield evidence and missing innings without claiming range or invented counts', () => {
  const notes = seasonEstimates({ estimatedFields: ['fielding.LF.genericOF', 'fielding.LF.InnOuts.unavailable', 'fielding.RF.league'] }, ['LF']).join(' ');
  expect(notes).toMatch(/combined outfield putouts, assists and errors/);
  expect(notes).toMatch(/recorded innings are unavailable/);
  expect(notes).toMatch(/not invented innings/);
  expect(notes).not.toMatch(/right field|genericOF|InnOuts/);
 });
 it('distinguishes the historical catcher baseline from an unavailable baseline using the 2025 prior', () => {
  expect(seasonEstimates({ estimatedFields: ['catcherCS.league'] }, ['C'])[0]).toMatch(/that season and league's caught-stealing rate/);
  const notes = seasonEstimates({ estimatedFields: ['catcherCS.league', 'catcherCS.prior2025'] }, ['C']).join(' ');
  expect(notes).toMatch(/combined 2025 league/);
  expect(notes).toMatch(/baseline is unavailable/);
  expect(seasonEstimates({ estimatedFields: ['catcherCS.prior2025'] }, ['1B'])).toEqual([]);
 });
 it('describes pitcher missing facts honestly instead of implying complete source records', () => {
  const notes = seasonEstimates({ estimatedFields: ['pitching.BFP.estimated', 'pitching.HBP.estimated', 'pitching.ER.estimated', 'pitching.SV.estimated'] }, ['CL']).join(' ');
  expect(notes).toMatch(/outs plus hits, walks and hit batters/);
  expect(notes).toMatch(/missing hit batters/);
  expect(notes).toMatch(/missing earned runs/);
  expect(notes).toMatch(/missing saves/);
  expect(notes).toMatch(/zero when none are present/);
  expect(notes).not.toMatch(/pitching\.|\.estimated/);
 });
 it('classifies a bullpen unit as pitching and discloses aggregate assumptions', () => {
  const aggregate = { estimatedFields: ['pooledRelief.BFPWeighted', 'throws.neutral', 'pitching.BFP.estimated', 'PPF.neutral', 'bats.neutral'] };
  const notes = seasonEstimates(aggregate, ['BP']).join(' ');
  expect(notes).toContain('weighted by batters faced');
  expect(notes).toContain('neutral throwing handedness');
  expect(notes).toContain('outs plus hits, walks and hit batters');
  expect(notes).toContain('pitching park factor');
  expect(notes).not.toContain('Batting handedness');
  expect(notes).not.toContain('exact method is not described');
  expect(seasonEstimates(aggregate, ['DH']).join(' ')).not.toContain('weighted by batters faced');
 });
 it('discloses unknown identifiers once without leaking raw jargon, and filters known irrelevant namespaces', () => {
  const notes = seasonEstimates({ estimatedFields: ['future.internalFlag', 'anotherFlag', 'fielding.LF.futureMethod', 'pitching.futureFact.estimated'] }, ['DH']);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatch(/exact method is not described/);
  expect(notes[0]).not.toMatch(/future|internalFlag|anotherFlag/);
  expect(seasonEstimates({ estimatedFields: [] }, ['C'])).toEqual([]);
 });
});
