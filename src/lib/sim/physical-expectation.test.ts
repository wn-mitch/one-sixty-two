import { describe, expect, it } from 'vitest';
import { contactClasses, eventRunWeights, getPhysicalReference } from './physical-expectation.ts';
import { leagueContactFit } from './contact-profile.ts';
import { testDefenseEnvironment } from './test-fixtures.ts';

const SINGLE_TO_LEFT = 18 + 5 * 3;
const DOUBLE_TO_LEFT = SINGLE_TO_LEFT + 1;
const HOME_RUN = 42;
const SHORTSTOP_GROUND_OUT = 8 + 4;

describe('event run weights', () => {
 const environment = testDefenseEnvironment();
 const reference = getPhysicalReference(environment);
 const weights = eventRunWeights(reference);

 it('values league-rate plate appearances at zero runs', () => {
  const rates = environment.leagueRates;
  const contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
  const classes = contactClasses(environment.contactModel, leagueContactFit(environment.contactModel, rates));
  let value = (rates[0] + rates[1]) * weights.walk + rates[2] * weights.strikeout;
  for (let cls = 0; cls < classes.length; cls++) value += contact * classes[cls] * weights.classes[cls];
  expect(Math.abs(value)).toBeLessThan(1e-9);
 });

 it('orders event values the way run scoring does', () => {
  expect(weights.classes[HOME_RUN]).toBeGreaterThan(weights.classes[DOUBLE_TO_LEFT]);
  expect(weights.classes[DOUBLE_TO_LEFT]).toBeGreaterThan(weights.classes[SINGLE_TO_LEFT]);
  expect(weights.classes[SINGLE_TO_LEFT]).toBeGreaterThan(weights.walk);
  expect(weights.walk).toBeGreaterThan(0);
  expect(weights.strikeout).toBeLessThan(0);
  expect(weights.classes[SHORTSTOP_GROUND_OUT]).toBeLessThan(0);
 });

 it('counts double plays as more than one out', () => {
  expect(weights.classOuts[HOME_RUN]).toBe(0);
  expect(weights.classOuts[SHORTSTOP_GROUND_OUT]).toBeGreaterThan(1);
  expect(weights.classOuts[SHORTSTOP_GROUND_OUT]).toBeLessThan(1.5);
 });
});
