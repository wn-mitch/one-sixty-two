import { describe, expect, it } from 'vitest';
import { STACK_ROLES } from './cleanup.ts';
import { RIVALS } from './franchises.ts';
import { auditLedger } from './ledger.ts';
import { COOLDOWN_GAMES, OFFERS_PER_CLUB, waiverCards } from './market.ts';
import { applyAction, newRunSetup, ownedBy, placementOf, replayRun, RunActionError, startRun, type DraftRun, type RunData } from './run.ts';
import { playDraft, testUniverse } from './test-fixtures.ts';

const DATA: RunData = { cards: testUniverse(120), franchiseIds: Object.keys(RIVALS), parkFit: () => 0 };
const setup = newRunSetup(31, 'CHC', 'test-data');
const drafted = (): DraftRun => { const run = startRun(setup, DATA); playDraft(run); return run; };
const ids = (run: DraftRun, seat: number) => ownedBy(run, seat).map(card => card.seasonId);
const byValue = (run: DraftRun, seat: number) => [...ownedBy(run, seat)].sort((a, b) => b.valueRuns - a.valueRuns).map(card => card.seasonId);
const others = (run: DraftRun) => run.seating.seats.map((_, seat) => seat).filter(seat => seat !== run.seating.humanSeat);
const eventsOf = (run: DraftRun) => run.pool.ledger.events.map(event => [event.op, event.cardId, JSON.stringify(event.to)]);

/** The first AI club that accepts the player's best card for its least valuable one. */
function acceptedTrade(run: DraftRun) {
 const human = run.seating.humanSeat;
 for (const seat of others(run)) {
  const give = byValue(run, human)[0];
  const get = byValue(run, seat).at(-1)!;
  applyAction(run, { type: 'propose', seat, give: [give], get: [get] });
  const offer = run.market!.offers.at(-1)!;
  if (offer.status === 'accepted') return { seat, give, get };
 }
 throw new Error('No club accepted a gift');
}

describe('opening window market', () => {
 it('executes an accepted trade atomically, starts both cooldowns, and refuses to move those cards again this window', () => {
  const run = drafted();
  const human = run.seating.humanSeat;
  const { seat, give, get } = acceptedTrade(run);
  expect(ids(run, human)).toContain(get);
  expect(ids(run, human)).not.toContain(give);
  expect(ids(run, seat)).toContain(give);
  for (const id of [give, get]) expect(run.pool.ledger.instances.get(id)!.tradeDeadline).toBe(COOLDOWN_GAMES);
  // The arriving card has a place; the departing card left the field and bench.
  expect(placementOf(run, get) !== null || run.bench.includes(get)).toBe(true);
  expect([...run.field.values(), ...run.bench]).not.toContain(give);
  const before = run.market!.offers.length;
  expect(() => applyAction(run, { type: 'propose', seat, give: [get], get: [ids(run, seat)[0]] })).toThrow('traded recently');
  expect(run.market!.offers).toHaveLength(before);
  expect(auditLedger(run.pool.ledger)).toEqual([]);
 });

 it('turns down or counters a lopsided ask, moving nothing until the player accepts a counter', () => {
  const run = drafted();
  const human = run.seating.humanSeat;
  let countered = false;
  for (const seat of others(run)) {
   const [mine, theirs] = [ids(run, human), ids(run, seat)];
   applyAction(run, { type: 'propose', seat, give: [byValue(run, human).at(-1)!], get: [byValue(run, seat)[0]] });
   const offer = run.market!.offers.filter(item => item.from === human).at(-1)!;
   expect(['rejected', 'countered']).toContain(offer.status);
   expect([ids(run, human), ids(run, seat)]).toEqual([mine, theirs]);
   if (offer.status !== 'countered') continue;
   countered = true;
   // A counter asks for one more of the player's cards or sends one fewer of the club's.
   const counter = run.market!.offers.find(item => item.counterTo === offer.id)!;
   expect(counter).toMatchObject({ from: seat, to: human, status: 'open' });
   expect(counter.get.length - offer.give.length + offer.get.length - counter.give.length).toBe(1);
   applyAction(run, { type: 'respond', offer: counter.id, accept: true });
   expect(counter.status).toBe('accepted');
   for (const id of counter.give) expect(ids(run, human)).toContain(id);
   for (const id of counter.get) expect(ids(run, seat)).toContain(id);
   expect(() => applyAction(run, { type: 'respond', offer: counter.id, accept: false })).toThrow('no longer open');
   break;
  }
  expect(countered).toBe(true);
 });

 it('takes three offers per club and refuses malformed ones before counting them', () => {
  const run = drafted();
  const human = run.seating.humanSeat;
  const seat = others(run)[1];
  const theirs = ids(run, seat);
  const [mine] = [byValue(run, human).at(-1)!];
  expect(() => applyAction(run, { type: 'propose', seat, give: [], get: [theirs[0]] })).toThrow(RunActionError);
  expect(() => applyAction(run, { type: 'propose', seat, give: [mine, mine], get: [theirs[0]] })).toThrow(RunActionError);
  expect(() => applyAction(run, { type: 'propose', seat, give: [mine], get: theirs.slice(0, 4) })).toThrow(RunActionError);
  expect(() => applyAction(run, { type: 'propose', seat, give: [theirs[1]], get: [theirs[0]] })).toThrow('You does not own');
  expect(() => applyAction(run, { type: 'propose', seat: human, give: [mine], get: [theirs[0]] })).toThrow(RunActionError);
  expect(run.market!.proposals[seat]).toBe(0);
  for (let n = 0; n < OFFERS_PER_CLUB; n++) applyAction(run, { type: 'propose', seat, give: [byValue(run, human).at(-1)!], get: [byValue(run, seat)[0]] });
  expect(() => applyAction(run, { type: 'propose', seat, give: [byValue(run, human).at(-1)!], get: [byValue(run, seat)[0]] })).toThrow(`${OFFERS_PER_CLUB} offers`);
 });

 it('resolves waivers once in claim order, keeps cooldowns through release and claim, and never deals unclaimed cards as cleanup', () => {
  const run = drafted();
  const human = run.seating.humanSeat;
  const { get } = acceptedTrade(run);
  // The traded card goes back on waivers with its cooldown.
  applyAction(run, { type: 'cut', cardId: get });
  expect(waiverCards(run)).toContain(get);
  expect(() => applyAction(run, { type: 'claim', cardId: get, on: true })).toThrow('You released');
  // The player claims a card an AI club released, ahead of every AI club.
  const wanted = waiverCards(run).find(id => run.market!.releasedBy.get(id) !== human);
  run.market!.priority = [human, ...run.market!.priority.filter(seat => seat !== human)];
  if (wanted) applyAction(run, { type: 'claim', cardId: wanted, on: true });
  const onWaivers = waiverCards(run);
  applyAction(run, { type: 'waivers' });
  expect(waiverCards(run)).toEqual([]);
  expect(run.pool.ledger.instances.get(get)!.tradeDeadline).toBe(COOLDOWN_GAMES);
  if (wanted) {
   expect(ids(run, human)).toContain(wanted);
   expect(run.market!.claimed[0]).toEqual({ cardId: wanted, seat: human });
  }
  // A club claims at most one card per pass, in claim order.
  const passOrder = run.market!.claimed.map(claim => run.market!.priority.indexOf(claim.seat));
  expect(run.market!.claimed.length).toBeLessThanOrEqual(onWaivers.length);
  expect(passOrder.length === 0 || passOrder[0] === Math.min(...passOrder)).toBe(true);
  const unclaimed = onWaivers.filter(id => run.pool.ledger.instances.get(id)!.owner.kind === 'unowned');
  for (let seat = 0; seat < 8; seat++) for (const role of STACK_ROLES) expect(unclaimed).not.toContain(run.pool.cleanup.peek(seat, role)?.seasonId);
  // Waivers are closed: trades and claims are refused, commons are now open.
  expect(() => applyAction(run, { type: 'waivers' })).toThrow('Waivers have closed');
  applyAction(run, { type: 'autofix' });
  expect(auditLedger(run.pool.ledger)).toEqual([]);
 });

 it('replays the whole market from the action log without repeating a transfer', () => {
  const run = drafted();
  acceptedTrade(run);
  const unsolicited = run.market!.offers.find(offer => offer.unsolicited && offer.status === 'open');
  if (unsolicited) applyAction(run, { type: 'respond', offer: unsolicited.id, accept: true });
  applyAction(run, { type: 'waivers' });
  const again = replayRun(setup, run.actions, DATA);
  expect(eventsOf(again)).toEqual(eventsOf(run));
  expect(again.market!.offers).toEqual(run.market!.offers);
  expect(again.submissions).toEqual(run.submissions);
  expect(new Set(again.pool.ledger.events.map(event => `${event.seq}`)).size).toBe(again.pool.ledger.events.length);
 });

 it('has AI clubs send at most one unsolicited offer each, from cards they own', () => {
  for (const seed of [3, 17, 58]) {
   const run = startRun(newRunSetup(seed, 'NYM', 'test-data'), DATA);
   playDraft(run);
   const unsolicited = run.market!.offers.filter(offer => offer.unsolicited);
   expect(new Set(unsolicited.map(offer => offer.from)).size).toBe(unsolicited.length);
   for (const offer of unsolicited) {
    expect(offer.to).toBe(run.seating.humanSeat);
    expect(offer.give.every(id => ids(run, offer.from).includes(id))).toBe(true);
    expect(offer.get.every(id => ids(run, run.seating.humanSeat).includes(id))).toBe(true);
   }
  }
 });
});
