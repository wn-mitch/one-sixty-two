import { describe, expect, it } from 'vitest';
import { explainPick, judgeFor, personalityFor, type Personality } from './ai.ts';
import { RIVALS } from './franchises.ts';
import { heldPile, newRunSetup, startRun, type RunData } from './run.ts';
import { biasBonus, scoutedValue, SHARPNESS, type Difficulty } from './scouting.ts';
import { playDraft, testCard, testUniverse, TEST_ROLES } from './test-fixtures.ts';

const CARDS = testUniverse(120);
const DATA: RunData = { cards: CARDS, franchiseIds: Object.keys(RIVALS), parkFit: () => 0 };

/** Standard deviation of a seat's misjudgment over many cards, relative to the scale it should use. */
function relativeSpread(difficulty: Difficulty, seat: number): { mean: number; sd: number } {
 const errors = CARDS.map(card => (scoutedValue(4, seat, card, difficulty) - card.valueRuns) / (Math.abs(card.valueRuns) + 5));
 const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
 const sd = Math.sqrt(errors.reduce((sum, value) => sum + (value - mean) ** 2, 0) / errors.length);
 return { mean, sd };
}

describe('AI scouting', () => {
 it('misjudges each card by a fixed seeded error that differs between clubs', () => {
  const card = CARDS[3];
  expect(scoutedValue(4, 1, card, 'pro')).toBe(scoutedValue(4, 1, card, 'pro'));
  expect(scoutedValue(4, 1, card, 'pro')).not.toBe(scoutedValue(4, 2, card, 'pro'));
  expect(scoutedValue(5, 1, card, 'pro')).not.toBe(scoutedValue(4, 1, card, 'pro'));
 });

 it('errs without a lean, and errs more at lower difficulty', () => {
  const spreads = (['ace', 'pro', 'rookie'] as const).map(difficulty => relativeSpread(difficulty, 1));
  spreads.forEach((spread, index) => {
   const expected = SHARPNESS[(['ace', 'pro', 'rookie'] as const)[index]].scoutingError;
   expect(Math.abs(spread.mean)).toBeLessThan(expected * 0.15);
   expect(spread.sd).toBeGreaterThan(expected * 0.85);
   expect(spread.sd).toBeLessThan(expected * 1.15);
  });
 });

 it('inflates only the cards a bias favors, more at lower difficulty', () => {
  const lean = (bias: Personality['bias']): Personality => ({ archetype: 'balanced', thrift: 1, bias, decade: bias === 'nostalgic' ? 1970 : null, franchiseId: 'BOS' });
  const gem = { ...testCard('g:1975', TEST_ROLES.SS, 200, 'gem'), franchiseId: 'NYY' };
  const local = { ...testCard('l:2001', TEST_ROLES.SS, 20), franchiseId: 'BOS' };
  expect(biasBonus(lean('gem-chaser'), gem, 15, 'pro')).toBeCloseTo(0.2 * 20);
  expect(biasBonus(lean('gem-chaser'), local, 15, 'pro')).toBe(0);
  expect(biasBonus(lean('homer'), local, 15, 'pro')).toBeCloseTo(4);
  expect(biasBonus(lean('nostalgic'), gem, 15, 'pro')).toBeCloseTo(4);
  expect(biasBonus(lean('nostalgic'), local, 15, 'pro')).toBe(0);
  expect(biasBonus(lean('none'), gem, 15, 'rookie')).toBe(0);
  expect(biasBonus(lean('homer'), local, 15, 'rookie')).toBeGreaterThan(biasBonus(lean('homer'), local, 15, 'ace'));
  // The judged value includes the bias, and the bias part is reported for the ticker.
  const judge = judgeFor(4, 1, lean('homer'), 'pro');
  const judged = judge(local);
  expect(judged.value).toBeCloseTo(scoutedValue(4, 1, local, 'pro') + judged.bias);
  expect(explainPick({ landing: 'SS', fills: true, filled: 'SS', marginal: 20, park: 0, bias: 4, quirk: 'homer', scarcity: 0, capPenalty: 0 })).toBe('fills SS · homer');
 });

 it('cuts a big spender’s thrift by the difficulty’s spender share', () => {
  const spenders = Array.from({ length: 200 }, (_, seed) => personalityFor(seed, 2, 'BOS', 'rookie')).filter(personality => personality.bias === 'big-spender');
  expect(spenders.length).toBeGreaterThan(20);
  for (const spender of spenders) expect(spender.thrift).toBeLessThan(1.8 * SHARPNESS.rookie.spenderThrift + 1e-9);
 });
});

describe('difficulty in a run', () => {
 it('is part of the setup, changes AI picks, and must be a known level', () => {
  const picks = (difficulty: Difficulty) => {
   const run = startRun(newRunSetup(9, 'BOS', 'test-data', difficulty), DATA);
   playDraft(run);
   return run.ticker.filter(pick => pick.seat !== run.seating.humanSeat).map(pick => pick.cardId);
  };
  expect(newRunSetup(9, 'BOS', 'test-data').difficulty).toBe('pro');
  expect(picks('rookie')).not.toEqual(picks('ace'));
  expect(picks('pro')).toEqual(picks('pro'));
  expect(() => startRun({ ...newRunSetup(9, 'BOS', 'test-data'), difficulty: 'legend' as Difficulty }, DATA)).toThrow('difficulty legend');
  const run = startRun(newRunSetup(9, 'BOS', 'test-data'), DATA);
  expect(heldPile(run)).toHaveLength(16);
 });
});
