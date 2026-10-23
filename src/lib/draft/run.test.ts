import { describe, expect, it } from 'vitest';
import { chooseAiPick, explainPick, scorePile, trueJudgment, type Personality } from './ai.ts';
import { RIVALS, seatTable } from './franchises.ts';
import { auditLedger } from './ledger.ts';
import { arrangeRoster, checkSubmission, submissionFrom } from './legality.ts';
import { startLeague } from './league.ts';
import { applyAction, heldPile, movesFor, newRunSetup, openSlotsFor, ownedBy, placementOf, replayRun, RunActionError, seatView, startRun, windowLineup, type DraftRun, type RunData } from './run.ts';
import { baselineBudget, canFill, DRAFT_RULES, rosterSize } from './rules.ts';
import { pickAction, playDraft, submitAction, testCard, testUniverse, TEST_ROLES } from './test-fixtures.ts';
import type { DraftCard, DraftSlot } from './types.ts';

const FRANCHISES = Object.keys(RIVALS);
const CARDS = testUniverse(120);
const DATA: RunData = { cards: CARDS, franchiseIds: FRANCHISES, parkFit: () => 0 };

const view = (pile: DraftCard[], owned: DraftCard[] = [], seenElsewhere: DraftCard[] = [], parkFit: (id: string) => number = () => 0) => ({ pile, owned, budget: baselineBudget(1500), seenElsewhere, parkFit, judge: trueJudgment });
const BALANCED: Personality = { archetype: 'balanced', thrift: 1, bias: 'none', decade: null, franchiseId: 'TST' };
const eventsOf = (run: DraftRun) => run.pool.ledger.events.map(event => [event.op, event.cardId, JSON.stringify(event.to)]);

describe('table seating', () => {
 it('seats the player, a rival from their shortlist and six other distinct franchises', () => {
  for (let seed = 0; seed < 40; seed++) {
   const table = seatTable(seed, 'CHC', FRANCHISES, 8);
   expect(new Set(table.seats).size).toBe(8);
   expect(table.seats[table.humanSeat]).toBe('CHC');
   expect(RIVALS.CHC).toContain(table.rival);
   expect(table.seats).toContain(table.rival);
  }
  expect(new Set(Array.from({ length: 40 }, (_, seed) => seatTable(seed, 'CHC', FRANCHISES, 8).humanSeat)).size).toBeGreaterThan(4);
 });

 it('always gives a Mets player the Yankees and gives a rival-less franchise none', () => {
  for (let seed = 0; seed < 20; seed++) expect(seatTable(seed, 'NYM', FRANCHISES, 8).rival).toBe('NYY');
  expect(seatTable(3, 'SEA', FRANCHISES, 8).rival).toBeNull();
  expect(() => seatTable(3, 'XXX', FRANCHISES, 8)).toThrow('Unknown franchise');
 });
});

describe('AI general manager', () => {
 it('values a card by the change it makes to the roster, so a second closer is worth only a reserve share', () => {
  const closer = testCard('cl1:2000', TEST_ROLES.CL, 100);
  const better = { ...testCard('cl2:2000', TEST_ROLES.CL, 100), valueRuns: 40 };
  const catcher = { ...testCard('c1:2000', TEST_ROLES.C, 100), valueRuns: 20 };
  const personality = BALANCED;
  const scores = scorePile(view([better, catcher], [{ ...closer, valueRuns: 30 }]), personality, () => 0);
  const byId = Object.fromEntries(scores.map(score => [score.cardId, score.marginal]));
  // A second closer still has an open named relief slot, so it counts in full.
  expect(byId['cl2:2000']).toBe(40);
  expect(byId['c1:2000']).toBe(20);
  // With all six closer-capable slots filled, a seventh closer only reaches a reserve row.
  const pen = [30, 25, 20, 20, 20, 20].map((value, index) => ({ ...testCard(`pen${index}:2000`, TEST_ROLES.CL, 100), valueRuns: value }));
  const [fourth] = scorePile(view([better], pen), personality, () => 0);
  expect(fourth.marginal).toBeCloseTo(20 + 0.25 * 20);
 });

 it('adds scarcity for filling a slot that few seen, undrafted cards could fill', () => {
  const catcher = { ...testCard('c1:2000', TEST_ROLES.C, 50), valueRuns: 10 };
  const others = (count: number) => Array.from({ length: count }, (_, index) => testCard(`c${index + 2}:2000`, TEST_ROLES.C));
  const personality = BALANCED;
  const scarcity = (seen: number) => scorePile(view([catcher], [], others(seen)), personality, () => 0)[0].scarcity;
  expect([scarcity(0), scarcity(4), scarcity(8), scarcity(12)]).toEqual([6, 3, 0, 0]);
  // An upgrade over a catcher-only card fills nothing, so scarcity does not apply; the old catcher drops to a reserve.
  const [upgrade] = scorePile(view([{ ...catcher, eligibleSlots: ['C'] }], [{ ...testCard('c0:2000', ['C']), valueRuns: 1 }]), personality, () => 0);
  expect(upgrade).toMatchObject({ landing: 'C', fills: false, filled: null, scarcity: 0, marginal: 10 - 1 + 0.25 * 1 });
  // A catcher who can also DH pushes the owned catcher to DH; scarcity counts DH options, which any hitter fills.
  const dhOptions = Array.from({ length: 6 }, (_, index) => testCard(`ss${index}:2000`, TEST_ROLES.SS));
  const [pushed] = scorePile(view([catcher], [{ ...testCard('c0:2000', TEST_ROLES.C), valueRuns: 1 }], dhOptions), personality, () => 0);
  expect(pushed).toMatchObject({ landing: 'C', filled: 'DH' });
  expect(pushed.scarcity).toBeCloseTo(6 * (1 - 6 / 8));
 });

 it('explains a pick from its score', () => {
  expect(explainPick({ landing: 'C', fills: true, filled: 'C', marginal: 10, park: 2, bias: 0, quirk: null, scarcity: 3, capPenalty: 0 })).toBe('fills C · suits its home park · few C options left');
  expect(explainPick({ landing: 'SS', fills: false, filled: null, marginal: 4.25, park: -0.2, bias: 0, quirk: null, scarcity: 0, capPenalty: 12.5 })).toBe('upgrades SS · over the cap');
  expect(explainPick({ landing: 'cut', fills: false, filled: null, marginal: 0, park: 0, bias: 0, quirk: null, scarcity: 0, capPenalty: 0 })).toBe('no roster spot');
 });

 it('prefers the card that fits its home park when modeled values are close', () => {
  const pull = { ...testCard('pull:2000', TEST_ROLES.RF, 100), valueRuns: 20 };
  const spray = { ...testCard('spray:2000', TEST_ROLES.RF, 100), valueRuns: 21 };
  const personality = BALANCED;
  const fit = (id: string) => id === 'pull:2000' ? 3 : -1;
  const scores = scorePile(view([pull, spray], [], [], fit), personality, () => 0);
  expect(chooseAiPick(scores).cardId).toBe('pull:2000');
  expect(scores.find(score => score.cardId === 'pull:2000')).toMatchObject({ marginal: 23, park: 3 });
  // Without the park, the better neutral card wins.
  expect(chooseAiPick(scorePile(view([pull, spray]), personality, () => 0)).cardId).toBe('spray:2000');
 });

 it('charges projected payroll over the cap at the seat thrift', () => {
  const star = { ...testCard('star:2000', TEST_ROLES.SS, 1400), valueRuns: 60 };
  const [loose] = scorePile(view([star]), { ...BALANCED, thrift: 0.5 }, () => 0);
  const [tight] = scorePile(view([star]), { ...BALANCED, thrift: 1.5 }, () => 0);
  // 1400 + 19 open rows at 15 = 1685, 185 over a 1500 cap, at 4 salary units per run.
  expect(loose.capPenalty).toBeCloseTo(185 / 4 * 0.5);
  expect(tight.capPenalty).toBeCloseTo(185 / 4 * 1.5);
  expect(chooseAiPick([{ ...loose, cardId: 'b', score: 1 }, { ...loose, cardId: 'a', score: 1 }]).cardId).toBe('a');
 });
});

describe('draft run', () => {
 const setup = newRunSetup(11, 'BOS', 'test-data');

 it('drafts all 128 cards from the held piles in sixteen rounds and audits clean', () => {
  const run = startRun(setup, DATA);
  expect(heldPile(run)).toHaveLength(16);
  playDraft(run);
  expect(run.phase).toBe('window');
  expect(run.ticker).toHaveLength(128);
  expect(run.piles.every(pile => pile.length === 0)).toBe(true);
  // AI clubs recover to a legal 20-card roster as the window opens; the player still holds the 16 drafted.
  for (let seat = 0; seat < 8; seat++) expect(ownedBy(run, seat)).toHaveLength(seat === run.seating.humanSeat ? 16 : rosterSize(DRAFT_RULES));
  for (let seat = 0; seat < 8; seat++) {
   const submission = run.submissions[seat];
   if (seat === run.seating.humanSeat) expect(submission).toBeNull();
   else expect(checkSubmission(submission!, run.pool.ledger, run.budgets[seat]).legal).toBe(true);
  }
  expect(auditLedger(run.pool.ledger)).toEqual([]);
  // AI picks explain themselves; the player's do not need to.
  expect(run.ticker.filter(pick => pick.seat !== run.seating.humanSeat).every(pick => pick.reason !== null)).toBe(true);
 });

 it('shows an AI seat only its pile and the undrafted cards it held before', () => {
  const run = startRun(setup, DATA);
  const seat = (run.seating.humanSeat + 3) % 8;
  expect(seatView(run, seat).seenElsewhere).toEqual([]);
  const first = heldPile(run, seat).map(card => card.seasonId);
  applyAction(run, pickAction(run, heldPile(run)[0].seasonId));
  const seen = seatView(run, seat).seenElsewhere.map(card => card.seasonId);
  // The pile it held, less the card it took, now sits with its neighbour.
  expect(seen).toHaveLength(15);
  expect(seen.every(id => first.includes(id))).toBe(true);
  const unseen = run.piles.flat().filter(id => !first.includes(id) && !heldPile(run, seat).some(card => card.seasonId === id));
  expect(unseen.length).toBeGreaterThan(0);
  expect(seen.some(id => unseen.includes(id))).toBe(false);
 });

 it('scores each AI seat at its own home park', () => {
  const calls: string[] = [];
  const run = startRun(setup, { ...DATA, parkFit: (franchiseId, seasonId) => { calls.push(franchiseId); return seasonId.length % 3; } });
  const seat = (run.seating.humanSeat + 2) % 8;
  const card = heldPile(run, seat)[0].seasonId;
  expect(seatView(run, seat).parkFit(card)).toBe(card.length % 3);
  expect(calls).toEqual([run.seating.seats[seat]]);
 });

 it('rejects a card outside the player pile without changing the run', () => {
  const run = startRun(setup, DATA);
  const elsewhere = heldPile(run, (run.seating.humanSeat + 1) % 8)[0].seasonId;
  expect(() => applyAction(run, { type: 'pick', cardId: elsewhere, slot: null })).toThrow(RunActionError);
  expect(run.pick).toBe(0);
  expect(run.pool.ledger.events.filter(event => event.op === 'draft')).toEqual([]);
  playDraft(run);
  expect(() => applyAction(run, { type: 'pick', cardId: elsewhere, slot: null })).toThrow('The draft is over');
 });

 it('replays the same table from the setup and action log, and a different choice changes rosters', () => {
  const first = startRun(setup, DATA);
  const actions = playDraft(first);
  const again = replayRun(setup, actions, DATA);
  expect(eventsOf(again)).toEqual(eventsOf(first));
  expect(again.ticker).toEqual(first.ticker);

  const other = startRun(setup, DATA);
  playDraft(other, pile => pile.at(-1)!.seasonId);
  const human = first.seating.humanSeat;
  expect(ownedBy(other, human).map(card => card.seasonId)).not.toEqual(ownedBy(first, human).map(card => card.seasonId));
  expect(other.pool.packs).toEqual(first.pool.packs);
 });

 it('opens a window where the player cuts, takes cleanup commons and submits a legal roster', () => {
  const run = startRun(setup, DATA);
  playDraft(run);
  const human = run.seating.humanSeat;
  const submit = () => {
   applyAction(run, submitAction(run));
  };
  // Four short of a full roster: submitting now fails and changes nothing.
  expect(submit).toThrow(RunActionError);
  expect(run.phase).toBe('window');
  const dropped = ownedBy(run, human)[0].seasonId;
  applyAction(run, { type: 'cut', cardId: dropped });
  expect(run.pool.ledger.instances.get(dropped)!.owner).toEqual({ kind: 'unowned' });
  expect(() => applyAction(run, { type: 'cut', cardId: dropped })).toThrow(RunActionError);
  const top = run.pool.cleanup.peek(human, 'C')!;
  applyAction(run, { type: 'cleanup', role: 'C' });
  expect(ownedBy(run, human).map(card => card.seasonId)).toContain(top.seasonId);
  expect(() => applyAction(run, { type: 'pick', cardId: top.seasonId, slot: null })).toThrow('The draft is over');
  // Auto-fix fills the rest the way the AI clubs recover.
  applyAction(run, { type: 'autofix' });
  expect(ownedBy(run, human)).toHaveLength(rosterSize(DRAFT_RULES));
  expect(() => applyAction(run, { type: 'cleanup', role: 'SP' })).toThrow('roster is full');
  submit();
  expect(run.phase).toBe('season');
  expect(() => applyAction(run, { type: 'autofix' })).toThrow('window is closed');
  // The whole window replays from the log.
  const again = replayRun(setup, run.actions, DATA);
  expect(eventsOf(again)).toEqual(eventsOf(run));
  expect(again.submissions).toEqual(run.submissions);
  expect(auditLedger(run.pool.ledger)).toEqual([]);
 });

 it('keeps the window orders for cards still on the field, and the submitted lineup opens the season', () => {
  const run = startRun(setup, DATA);
  playDraft(run);
  const human = run.seating.humanSeat;
  applyAction(run, { type: 'autofix' });
  const lineup = windowLineup(run);
  expect(lineup.battingOrder).toHaveLength(9);
  const reversed = [...lineup.battingOrder].reverse();
  const roles = lineup.reliefRoles.map(role => role.slot === 'RP5' ? { ...role, primary: 'stopper' as const, secondary: null } : role);
  // An order may not name a card the player does not own.
  const stranger = ownedBy(run, (human + 1) % 8)[0].seasonId;
  expect(() => applyAction(run, { type: 'order', orders: { battingOrder: [stranger], starterOrder: [], reliefRoles: roles } })).toThrow(RunActionError);
  applyAction(run, { type: 'order', orders: { battingOrder: reversed, starterOrder: lineup.starterOrder, reliefRoles: roles } });
  expect(windowLineup(run).battingOrder).toEqual(reversed);
  // A hitter benched leaves the order; the card taking the slot joins it at the bottom.
  const leaving = reversed[0];
  const slot = placementOf(run, leaving)!;
  const entering = run.bench.find(id => canFill(run.pool.ledger.cards.get(id)!, slot));
  applyAction(run, { type: 'place', cardId: leaving, slot: null });
  expect(windowLineup(run).battingOrder).toEqual(reversed.slice(1));
  if (entering) {
   applyAction(run, { type: 'place', cardId: entering, slot });
   expect(windowLineup(run).battingOrder).toEqual([...reversed.slice(1), entering]);
  } else {
   applyAction(run, { type: 'place', cardId: leaving, slot });
  }
  const submitted = windowLineup(run);
  applyAction(run, submitAction(run));
  const season = startLeague(run);
  expect(season.lineups[human]).toEqual(submitted);
  expect(season.lineups[human].reliefRoles.find(role => role.slot === 'RP5')?.primary).toBe('stopper');
  expect(replayRun(setup, run.actions, DATA).lineup).toEqual(run.lineup);
 });

 it('places each pick where the player chose and moves cards between slots and the bench', () => {
  const run = startRun(setup, DATA);
  const human = run.seating.humanSeat;
  const pile = heldPile(run);
  const hitter = pile.find(card => card.eligibleSlots.includes('C') || card.eligibleSlots.includes('SS'))!;
  const slot = openSlotsFor(run, hitter.seasonId)[0];
  const pitcherOnly = pile.find(card => card.eligibleSlots.every(item => item.startsWith('SP') || item === 'CL'))!;
  // An ineligible slot is refused before anything changes.
  expect(() => applyAction(run, { type: 'pick', cardId: pitcherOnly.seasonId, slot: 'C' })).toThrow('C is not open');
  expect(run.pick).toBe(0);
  applyAction(run, { type: 'pick', cardId: hitter.seasonId, slot });
  expect(placementOf(run, hitter.seasonId)).toBe(slot);
  expect(openSlotsFor(run, hitter.seasonId)).not.toContain(slot);
  // A taken slot is no longer open to a second card that could fill it.
  const rival = heldPile(run).find(card => canFill(card, slot))!;
  expect(rival).toBeDefined();
  expect(() => applyAction(run, { type: 'pick', cardId: rival.seasonId, slot })).toThrow('is not open');
  applyAction(run, { type: 'pick', cardId: rival.seasonId, slot: null });
  expect(run.bench).toEqual([rival.seasonId]);

  // Moving the bench card onto the occupied slot swaps; a bench card has no slot to give, so the occupant is benched.
  expect(movesFor(run, rival.seasonId)).toContainEqual({ slot, swapWith: hitter.seasonId });
  applyAction(run, { type: 'place', cardId: rival.seasonId, slot });
  expect(placementOf(run, rival.seasonId)).toBe(slot);
  expect(run.bench).toEqual([hitter.seasonId]);
  const placed = [...run.field.values()][0];
  applyAction(run, { type: 'place', cardId: placed, slot: null });
  expect(run.bench).toContain(placed);
  expect(() => applyAction(run, { type: 'place', cardId: placed, slot: null })).toThrow('already on the bench');

  playDraft(run);
  // Every owned card has exactly one place, and the place survives a replay.
  const owned = ownedBy(run, human).map(card => card.seasonId).sort();
  expect([...run.field.values(), ...run.bench].sort()).toEqual(owned);
  for (const [at, id] of run.field) expect(canFill(run.pool.ledger.cards.get(id)!, at)).toBe(true);
  const again = replayRun(setup, run.actions, DATA);
  expect([...again.field]).toEqual([...run.field]);
  expect(again.bench).toEqual(run.bench);

  // Cuts leave the field, cleanup lands in an open slot it fits, and auto-fix keeps every card placed.
  const cut = [...run.field.values()][0];
  applyAction(run, { type: 'cut', cardId: cut });
  expect(placementOf(run, cut)).toBeNull();
  expect(run.bench).not.toContain(cut);
  applyAction(run, { type: 'autofix' });
  expect([...run.field.values(), ...run.bench].sort()).toEqual(ownedBy(run, human).map(card => card.seasonId).sort());
  expect(run.field.size).toBe(DRAFT_RULES.activeSlots.length);
  expect(run.bench).toHaveLength(DRAFT_RULES.reserves);
 });

 it('refuses a setup from other rules', () => {
  expect(() => startRun({ ...setup, rulesVersion: 'draft-d00' }, DATA)).toThrow('draft rules draft-d00');
 });
});
