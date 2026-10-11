import { describe, expect, it } from 'vitest';
import type { Profile, Rates } from '../game/types.ts';
import { AVERAGE_RATES, syntheticProfile } from '../sim/fixtures.ts';
import { testDefenseEnvironment } from '../sim/test-fixtures.ts';
import { buildDraftCardTable, SALARY_METHOD } from './salary.ts';

/** Shifts `amount` of the out rate into home runs (positive) or home runs into outs (negative). */
const power = (amount: number): Rates => {
 const rates = [...AVERAGE_RATES] as Rates;
 rates[6] += amount;
 rates[7] -= amount;
 return rates;
};

function hitter(id: string, rates: Rates, shortstopRuns: number | null = null): Profile {
 const profile = syntheticProfile(id, rates);
 delete profile.pitchingRates;
 if (shortstopRuns === null) return profile;
 profile.eligibleSlots = ['SS', 'DH'];
 profile.defense.positions.SS = { hitPrevention: 0, doublePlay: 0, outfieldThrowing: 0, errorAvoidance: 0, catcherThrowing: 0, evidence: {} as never, expectedRunsSaved162: shortstopRuns, residualClamped: false };
 return profile;
}

function starter(id: string, rates: Rates): Profile {
 const profile = syntheticProfile(id, rates);
 delete profile.battingRates;
 profile.eligibleSlots = ['SP1', 'SP2', 'SP3'];
 profile.primaryHitterSlot = null;
 return profile;
}

describe('draft salary table', () => {
 const environment = testDefenseEnvironment();
 const profiles = [
  hitter('weak', power(-0.02)), hitter('average', AVERAGE_RATES), hitter('good', power(0.02)), hitter('great', power(0.04)),
  hitter('glove', AVERAGE_RATES, 12), hitter('stone', AVERAGE_RATES, -12),
  starter('ace', power(-0.02)), starter('arm', AVERAGE_RATES), starter('gopher', power(0.03))
 ];
 const table = buildDraftCardTable(profiles, environment, () => undefined);
 const salary = (id: string) => table.salary[table.seasonId.indexOf(`${id}:2025:AL:T`)];

 it('prices hitters by modeled run value with replacement at the minimum', () => {
  expect(salary('weak')).toBe(SALARY_METHOD.minSalary);
  // Average batting sits at the DH replacement percentile in this small universe.
  expect(salary('average')).toBe(SALARY_METHOD.minSalary);
  expect(salary('good')).toBeGreaterThan(salary('average'));
  expect(salary('great')).toBeGreaterThan(salary('good'));
 });

 it('adds fielding runs at the position', () => {
  expect(salary('glove')).toBeGreaterThan(salary('stone'));
 });

 it('prices pitchers by runs prevented over a starter workload', () => {
  expect(salary('ace')).toBeGreaterThan(salary('arm'));
  expect(salary('arm')).toBeGreaterThan(salary('gopher'));
  expect(table.pricedSlot[table.seasonId.indexOf('ace:2025:AL:T')]).toBe('SP1');
 });

 it('keeps the cosmetic finish out of the price', () => {
  const gems = buildDraftCardTable(profiles, environment, () => ({ battingWAR162: 9, pitchingWAR162: 9 }));
  expect(gems.finish.every(finish => finish === 'gem')).toBe(true);
  expect(table.finish.every(finish => finish === 'base')).toBe(true);
  expect(gems.salary).toEqual(table.salary);
 });
});
