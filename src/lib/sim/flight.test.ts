import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileStadiums, type StadiumCatalog } from '../../../scripts/data/stadiums.ts';
import { FEET_TO_METERS, type StadiumConfig } from './park-types.ts';
import { buildStadium, neutralPark, type StadiumSource } from './park.ts';
import {
 FLIGHT_DT,
 TRACE_HOME_RUN,
 TRACE_STOPPED,
 createFlightTrace,
 preparePark,
 traceFlight,
 type ContactSample,
 type FlightTrace
} from './flight.ts';
import {
 OUTCOME_CAUGHT,
 OUTCOME_HIT,
 buildFieldingPlan,
 computeCandidates,
 createFieldingCandidates,
 createFieldingPlan,
 createPhysicalOutcomes,
 fieldingOutcomes
} from './fielding.ts';

const catalog = JSON.parse(readFileSync(new URL('../../../scripts/data/stadiums.json', import.meta.url), 'utf8')) as StadiumCatalog;
const source = (id: string) => catalog.venues.find(venue => venue.franchiseId === id)!;
const anchor = (label: string, bearingDeg: number, distanceFt: number, heightFt: number) => ({
 label, bearingDeg, distanceFt, heightFt,
 provenance: { distance: { kind: 'estimated' as const, sourceUrl: null, note: 'test' }, height: { kind: 'estimated' as const, sourceUrl: null, note: 'test' }, bearing: { kind: 'estimated' as const, sourceUrl: null, note: 'test' } }
});
function park(distanceFt: number, heightFt: number, elevationFt = 0): StadiumConfig {
 const venue: StadiumSource = {
  franchiseId: 'TEST', name: 'Test Park', roof: 'none', notes: [],
  elevationFt: { value: elevationFt, provenance: { kind: 'estimated', sourceUrl: null, note: 'test' } },
  wall: [anchor('LF', -45, distanceFt, heightFt), anchor('CF', 0, distanceFt, heightFt), anchor('RF', 45, distanceFt, heightFt)]
 };
 return { ...buildStadium(venue, 'test'), version: `test-${distanceFt}-${heightFt}-${elevationFt}` };
}
function trace(sample: ContactSample, stadium: StadiumConfig): FlightTrace {
 const output = createFlightTrace();
 traceFlight(sample, preparePark(stadium), output);
 return output;
}
const landing = (output: FlightTrace) => Math.hypot(output.x[output.landing], output.y[output.landing]);
const rest = (output: FlightTrace) => Math.hypot(output.x[output.count - 1], output.y[output.count - 1]);
const DRIVE: ContactSample = { speedMph: 104, launchDeg: 28, sprayDeg: 0 };

describe('ball flight through stadium geometry', () => {
 it('clears a short fence but stays in play against a taller, deeper one', () => {
  expect(trace(DRIVE, park(360, 8)).end).toBe(TRACE_HOME_RUN);
  const deep = trace(DRIVE, park(420, 25));
  expect(deep.end).toBe(TRACE_STOPPED);
  expect(deep.fair).toBe(true);
 });
 it('treats a ball exactly at the wall top as wall contact, not a home run', () => {
  const tall = trace(DRIVE, park(360, 79));
  const height = tall.firstEventHeight;
  expect(height).toBeGreaterThan(3);
  expect(trace(DRIVE, park(360, height / FEET_TO_METERS)).end).not.toBe(TRACE_HOME_RUN);
  expect(trace(DRIVE, park(360, height / FEET_TO_METERS - 0.5)).end).toBe(TRACE_HOME_RUN);
 });
 it('rebounds off the wall back into the field', () => {
  const output = trace({ speedMph: 100, launchDeg: 18, sprayDeg: 0 }, park(330, 60));
  expect(output.rebounds).toBeGreaterThan(0);
  expect(rest(output)).toBeLessThan(330 * FEET_TO_METERS);
 });
 it('carries farther in thin air with identical geometry', () => {
  const sea = trace({ ...DRIVE, launchDeg: 24 }, park(499, 79));
  const mile = trace({ ...DRIVE, launchDeg: 24 }, park(499, 79, 5200));
  expect(landing(mile) - landing(sea)).toBeGreaterThan(5);
 });
 it('lands exactly on the ground within one integration step of the previous sample', () => {
  const output = trace({ speedMph: 95, launchDeg: 30, sprayDeg: -10 }, park(499, 79));
  const index = output.landing;
  expect(index).toBeGreaterThan(0);
  expect(output.t[index] - output.t[index - 1]).toBeLessThanOrEqual(FLIGHT_DT + 1e-12);
  expect(output.z[index]).toBeCloseTo(0, 9);
 });
 it('makes Fenway\'s Green Monster stop a drive that clears a low left-field wall', () => {
  const { configs } = compileStadiums({ ...catalog, venues: [source('BOS'), source('LAD')] }, ['BOS', 'LAD']);
  const [boston, dodgers] = configs;
  const pull = { speedMph: 100, launchDeg: 24, sprayDeg: -40 };
  expect(trace(pull, dodgers).end).toBe(TRACE_HOME_RUN);
  expect(trace(pull, boston).end).not.toBe(TRACE_HOME_RUN);
 });
});

describe('fielding range', () => {
 it('turns the same fly ball from a hit into a catch when the center fielder is faster', () => {
  const output = trace({ speedMph: 98, launchDeg: 22, sprayDeg: 12 }, neutralPark());
  const outcomes = (skill: number) => {
   const candidates = createFieldingCandidates();
   const plan = createFieldingPlan();
   const result = createPhysicalOutcomes();
   const skills = new Float64Array(8);
   skills[6] = skill;
   computeCandidates(output, skills, candidates);
   buildFieldingPlan(output, candidates, new Uint8Array(8).fill(1), new Float64Array(8), plan);
   fieldingOutcomes(plan, 0.5, result);
   let caught = 0, hit = 0;
   for (let index = 0; index < result.count; index++) {
    if (result.kind[index] === OUTCOME_CAUGHT) caught += result.probability[index];
    if (result.kind[index] === OUTCOME_HIT) hit += result.probability[index];
   }
   return { caught, hit };
  };
  const slow = outcomes(-1);
  const fast = outcomes(1);
  expect(fast.caught).toBeGreaterThan(slow.caught + 0.05);
  expect(fast.hit).toBeLessThan(slow.hit);
 });
});
