import { expect, it } from 'vitest';
import { AVERAGE_RATES, syntheticProfile } from './fixtures.ts';
import { buildMatchups, matchup, sampleEvent } from './matchup.ts';

it('preserves neutral profile rates against average opponents', () => {
 const hitter = syntheticProfile('h');
 const pitcher = syntheticProfile('p');
 const actual = matchup(hitter, pitcher, AVERAGE_RATES);
 actual.forEach((value, index) => expect(value).toBeCloseTo(AVERAGE_RATES[index], 12));
 hitter.battingRates = [0.12, 0.012, 0.18, 0.16, 0.05, 0.004, 0.055, 0.419];
 matchup(hitter, pitcher, AVERAGE_RATES).forEach((value, index) => expect(value).toBeCloseTo(hitter.battingRates![index], 12));
 hitter.battingRates = [...AVERAGE_RATES];
 pitcher.pitchingRates = [0.06, 0.01, 0.28, 0.13, 0.04, 0.003, 0.022, 0.455];
 matchup(hitter, pitcher, AVERAGE_RATES).forEach((value, index) => expect(value).toBeCloseTo(pitcher.pitchingRates![index], 12));
});
it('applies switch-handedness and park modifiers only to specified weights', () => {
 const hitter = syntheticProfile('h');
 const pitcher = syntheticProfile('p');
 hitter.bats = 'B'; pitcher.throws = 'L';
 const rates = matchup(hitter, pitcher, AVERAGE_RATES, 100);
 expect(rates[0] / rates[1]).toBeCloseTo(AVERAGE_RATES[0] / AVERAGE_RATES[1] * 1.025, 12);
 expect(rates[2] / rates[1]).toBeCloseTo(AVERAGE_RATES[2] / AVERAGE_RATES[1] * 0.975, 12);
 expect(rates[6] / rates[1]).toBeCloseTo(AVERAGE_RATES[6] / AVERAGE_RATES[1] * 1.025 * 1.2, 12);
 hitter.bats = 'L';
 const same = matchup(hitter, pitcher, AVERAGE_RATES);
 expect(same[0] / same[1]).toBeCloseTo(AVERAGE_RATES[0] / AVERAGE_RATES[1] * 0.95, 12);
 expect(same[2] / same[1]).toBeCloseTo(AVERAGE_RATES[2] / AVERAGE_RATES[1] * 1.05, 12);
});
it('samples a single categorical event at exact cumulative boundaries', () => {
 const table = buildMatchups([syntheticProfile('h')], [syntheticProfile('p')], AVERAGE_RATES);
 expect(sampleEvent(table, 0, 0)).toBe(0);
 expect(sampleEvent(table, 0, table[0])).toBe(1);
 expect(sampleEvent(table, 0, 0.999999)).toBe(7);
 expect(() => sampleEvent(table, 0, 1)).toThrow('random sample');
});
