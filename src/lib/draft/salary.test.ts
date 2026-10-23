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
 // Public WAR runs against modeled value on purpose: the market sees the great hitter as ordinary.
 const WAR: Record<string, number> = { weak: 1, average: 1, good: 3, great: 1, glove: 2, stone: 2, ace: 4, arm: 2, gopher: 0 };
 const warOf = (seasonId: string) => {
  const war = WAR[seasonId.split(':')[0]];
  return war === undefined ? undefined : { battingWAR162: war, pitchingWAR162: war };
 };
 const table = buildDraftCardTable(profiles, environment, warOf);
 const at = (id: string) => table.seasonId.indexOf(`${id}:2025:AL:T`);
 const salary = (id: string) => table.salary[at(id)];
 const value = (id: string) => table.valueRuns[at(id)];

 it('values hitters by modeled runs above replacement, with fielding at the position', () => {
  expect(value('good')).toBeGreaterThan(value('average'));
  expect(value('great')).toBeGreaterThan(value('good'));
  expect(value('glove')).toBeGreaterThan(value('stone'));
 });

 it('values pitchers by runs prevented over a starter workload', () => {
  expect(value('ace')).toBeGreaterThan(value('arm'));
  expect(value('arm')).toBeGreaterThan(value('gopher'));
  expect(table.pricedSlot[at('ace')]).toBe('SP1');
 });

 it('prices public WAR on each role\'s market line, not modeled value', () => {
  // Same role and WAR, same price, however the engine values them.
  expect(salary('great')).toBe(salary('average'));
  expect(value('great')).toBeGreaterThan(value('average'));
  // So the great hitter is the bargain: more modeled runs per salary than the good one.
  expect(salary('good')).toBeGreaterThan(salary('great'));
  expect(salary('ace')).toBeGreaterThan(salary('arm'));
  const { market } = table.method;
  expect(market.hitter.slope).toBeGreaterThan(0);
  expect(market.starter.cards).toBe(3);
  const expected = market.starter.intercept + market.starter.slope * 4;
  expect(salary('ace')).toBe(SALARY_METHOD.minSalary + Math.round(SALARY_METHOD.pricePerRun * Math.max(0, expected)));
 });

 it('prices a card without WAR at its role\'s zero-WAR level', () => {
  const unknown = buildDraftCardTable(profiles, environment, id => id.startsWith('great:') ? undefined : warOf(id));
  const line = unknown.method.market.hitter;
  expect(unknown.salary[at('great')]).toBe(SALARY_METHOD.minSalary + Math.round(SALARY_METHOD.pricePerRun * Math.max(0, line.intercept)));
 });
});
