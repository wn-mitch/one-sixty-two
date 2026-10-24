import { compareId } from '../game/types.ts';
import { clubWorth } from './ai.ts';
import { heldBy, transfer, UNOWNED } from './ledger.ts';
import { arrangeRoster } from './legality.ts';
import { recoverSeat, trimSeat } from './recovery.ts';
import { effectiveCap, rosterSize } from './rules.ts';
import type { DraftRun } from './run.ts';
import type { DraftCard, Owner } from './types.ts';

/** A traded card cannot be traded again for two 27-game chapters. */
export const COOLDOWN_GAMES = 54;
/** A trade moves at most this many cards each way. */
export const MAX_TRADE_CARDS = 3;
/** Offers the player may send each AI club per window, counteroffers excluded. */
export const OFFERS_PER_CLUB = 3;
/** Runs an AI club needs to gain before it accepts or offers a trade or claims a card. */
const MARGIN = 1;
/** Extra runs an AI club demands from a partner whose projected payroll is over the cap. */
const LEVERAGE = 3;

export const RELEASED: Owner = Object.freeze({ kind: 'released' });

export type OfferStatus = 'open' | 'accepted' | 'rejected' | 'countered' | 'declined' | 'void';

/** A proposed trade. `give` leaves the proposing seat `from`; `get` leaves the receiving seat `to`. */
export interface TradeOffer {
 id: number;
 from: number;
 to: number;
 give: string[];
 get: string[];
 status: OfferStatus;
 /** The offer this one answers, for an AI counteroffer. */
 counterTo: number | null;
 /** An AI club sent it on its own; each club sends at most one per window. */
 unsolicited: boolean;
 /** The AI club's public reason, never a value figure. */
 note: string;
}

/**
 * The opening window's market. In the market step clubs trade and cut to waivers and the player marks
 * claims; closing waivers resolves every club's claims once, sends unclaimed cards to the unowned pool
 * and moves to the cleanup step, where cuts are final and commons fill the roster.
 */
export interface Market {
 step: 'market' | 'cleanup';
 /** Games played when the window opened; trade cooldowns count from here. */
 game: number;
 offers: TradeOffer[];
 /** Offers the player has sent each seat this window. */
 proposals: number[];
 /** Waiver cards the player will claim, in the order they were marked. */
 claims: string[];
 /** The seat that released each card on waivers. */
 releasedBy: Map<string, number>;
 /** Seats in waiver claim order: lowest drafted value first. */
 priority: number[];
 /** Claims made when waivers closed, in order. */
 claimed: { cardId: string; seat: number }[];
}

/** An action the market refuses; nothing has changed. */
export class MarketError extends Error {}

/** Moves the player's arriving and departing cards on the field and bench. */
export interface Seating { arrive(cardId: string): void; leave(cardId: string): void }

const roster = (seat: number): Owner => ({ kind: 'roster', seat });
const cardOf = (run: DraftRun, id: string): DraftCard => run.pool.ledger.cards.get(id)!;
const ownedIds = (run: DraftRun, seat: number): string[] => heldBy(run.pool.ledger, roster(seat));
const payroll = (run: DraftRun, ids: readonly string[]): number => ids.reduce((sum, id) => sum + run.pool.ledger.instances.get(id)!.startingSalary, 0);

/** A card may be traded once its cooldown has run: never traded, or the window's game is at or past its deadline. */
export function tradeable(run: DraftRun, cardId: string): boolean {
 const deadline = run.pool.ledger.instances.get(cardId)?.tradeDeadline ?? null;
 return deadline === null || run.market!.game >= deadline;
}

/** How `seat` values a roster: its own judgment for an AI club, or an AI club's judgment of the player's roster. */
function worth(run: DraftRun, judgeSeat: number, seat: number, ids: readonly string[]): number {
 const judge = run.judges[judgeSeat]!;
 const thrift = seat === judgeSeat ? run.personalities[judgeSeat]!.thrift : 1;
 const home = run.seating.seats[seat];
 return clubWorth(ids.map(id => cardOf(run, id)), judge, id => run.data.parkFit(home, id), run.budgets[seat], thrift, run.pool.rules);
}

/** Whether a club's projected payroll, open rows filled with commons, is over its cap: visible leverage for a trade partner. */
function underPressure(run: DraftRun, seat: number): boolean {
 const ids = ownedIds(run, seat);
 const open = arrangeRoster(ids.map(id => cardOf(run, id)), run.pool.rules).open.length;
 return payroll(run, ids) + open * run.pool.rules.commonSalaryMax > effectiveCap(run.budgets[seat]);
}

const swap = (ids: readonly string[], out: readonly string[], add: readonly string[]): string[] => [...ids.filter(id => !out.includes(id)), ...add];

/** The runs AI seat `ai` believes it gains by sending `send` and receiving `receive`. */
function gain(run: DraftRun, ai: number, send: readonly string[], receive: readonly string[]): number {
 const ids = ownedIds(run, ai);
 return worth(run, ai, ai, swap(ids, send, receive)) - worth(run, ai, ai, ids);
}

/** Runs AI seat `ai` believes the player gains by sending `send` and receiving `receive`. */
function partnerGain(run: DraftRun, ai: number, partner: number, send: readonly string[], receive: readonly string[]): number {
 const ids = ownedIds(run, partner);
 return worth(run, ai, partner, swap(ids, send, receive)) - worth(run, ai, partner, ids);
}

/**
 * Opens the window once the draft ends: each AI club releases what it cannot keep to waivers, the claim
 * order is fixed from drafted value, and AI clubs with a reason send the player at most one offer each.
 */
export function openMarket(run: DraftRun, game = 0): Market {
 const human = run.seating.humanSeat;
 const seats = run.seating.seats.map((_, seat) => seat);
 const drafted = seats.map(seat => run.ticker.filter(pick => pick.seat === seat).reduce((sum, pick) => sum + cardOf(run, pick.cardId).valueRuns, 0));
 const market: Market = {
  step: 'market', game, offers: [], proposals: seats.map(() => 0), claims: [], releasedBy: new Map(),
  priority: [...seats].sort((a, b) => drafted[a] - drafted[b] || a - b), claimed: []
 };
 run.market = market;
 for (const seat of seats) {
  if (seat === human) continue;
  for (const { cardId } of trimSeat(run.pool, run.budgets[seat], seat, RELEASED, 'release')) market.releasedBy.set(cardId, seat);
 }
 for (const seat of seats) {
  if (seat === human) continue;
  const offer = unsolicitedOffer(run, seat);
  if (offer) market.offers.push({ ...offer, id: market.offers.length });
 }
 return market;
}

/** The trade an AI club offers unprompted, when it has a reason and a deal it believes helps both sides. */
function unsolicitedOffer(run: DraftRun, ai: number): Omit<TradeOffer, 'id'> | null {
 const human = run.seating.humanSeat;
 const theirs = ownedIds(run, ai).filter(id => tradeable(run, id));
 const mine = ownedIds(run, human).filter(id => tradeable(run, id));
 const open = arrangeRoster(theirs.map(id => cardOf(run, id)), run.pool.rules).open.filter(row => row !== null);
 const pressure = underPressure(run, ai);
 if (!pressure && !open.length) return null;
 const top = (ids: readonly string[], score: (id: string) => number, count: number) => ids.map(id => ({ id, score: score(id) }))
  .sort((a, b) => b.score - a.score || compareId(a.id, b.id)).slice(0, count).map(item => item.id);
 // An over-cap club offers its priciest cards; any other club the ones it would miss least.
 const sendPool = top(theirs, id => pressure ? payroll(run, [id]) : gain(run, ai, [id], []), 4);
 const wantPool = top(mine, id => gain(run, ai, [], [id]), 6);
 const shapes: [string[], string[]][] = [];
 for (const send of sendPool) {
  for (const want of wantPool) shapes.push([[send], [want]]);
  for (let i = 0; i < wantPool.length; i++) for (let j = i + 1; j < wantPool.length; j++) shapes.push([[send], [wantPool[i], wantPool[j]]]);
 }
 for (let i = 0; i < sendPool.length; i++) for (let j = i + 1; j < sendPool.length; j++) for (const want of wantPool) shapes.push([[sendPool[i], sendPool[j]], [want]]);
 let best: { send: string[]; want: string[]; value: number } | null = null;
 for (const [send, want] of shapes) {
  const value = gain(run, ai, send, want);
  if (value < MARGIN || partnerGain(run, ai, human, want, send) < MARGIN) continue;
  if (!best || value > best.value) best = { send, want, value };
 }
 if (!best) return null;
 return {
  from: ai, to: human, give: best.send, get: best.want, status: 'open', counterTo: null, unsolicited: true,
  note: pressure ? 'Needs cap room' : `Needs ${needLabel(open[0]!)}`
 };
}

/** A slot as an AI club names its need. */
const needLabel = (slot: string): string => slot.startsWith('SP') ? 'a starter' : slot === 'CL' ? 'a closer' : slot.startsWith('RP') ? 'a reliever' : `a ${slot}`;

/** Executes an accepted trade atomically and starts both sides' cooldowns. */
function execute(run: DraftRun, offer: TradeOffer, seating: Seating): void {
 const human = run.seating.humanSeat;
 const deadline = run.market!.game + COOLDOWN_GAMES;
 const moves: [string, number, number][] = [...offer.give.map(id => [id, offer.from, offer.to] as [string, number, number]), ...offer.get.map(id => [id, offer.to, offer.from] as [string, number, number])];
 for (const [id, from] of moves) if (from === human) seating.leave(id);
 for (const [id, from, to] of moves) {
  transfer(run.pool.ledger, id, roster(from), roster(to), 'trade');
  run.pool.ledger.instances.get(id)!.tradeDeadline = deadline;
 }
 for (const [id, , to] of moves) if (to === human) seating.arrive(id);
 offer.status = 'accepted';
 // Any other open offer that named a card that just moved can no longer happen.
 const moved = new Set(moves.map(([id]) => id));
 for (const other of run.market!.offers) if (other.status === 'open' && [...other.give, ...other.get].some(id => moved.has(id))) other.status = 'void';
}

function checkSide(run: DraftRun, seat: number, ids: unknown, label: string): string[] {
 if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_TRADE_CARDS || new Set(ids).size !== ids.length || !ids.every(id => typeof id === 'string')) {
  throw new MarketError(`A trade moves one to ${MAX_TRADE_CARDS} different cards each way`);
 }
 const owned = new Set(ownedIds(run, seat));
 for (const id of ids as string[]) {
  if (!owned.has(id)) throw new MarketError(`${label} does not own ${id}`);
  if (!tradeable(run, id)) throw new MarketError(`${id} was traded recently and cannot move again yet`);
 }
 return [...ids as string[]];
}

/**
 * The player offers `give` for AI seat `seat`'s `get`. The club accepts when it gains enough by its own
 * judgment, asking more of a player over the cap; otherwise it counters with the smallest change that
 * would satisfy it (one more of the player's cards, or one fewer of its own) or rejects.
 */
export function propose(run: DraftRun, seat: number, give: unknown, get: unknown, seating: Seating): TradeOffer {
 const market = run.market!;
 const human = run.seating.humanSeat;
 if (!Number.isInteger(seat) || seat === human || seat < 0 || seat >= run.seating.seats.length) throw new MarketError('Choose another club to trade with');
 if (market.proposals[seat] >= OFFERS_PER_CLUB) throw new MarketError(`That club takes ${OFFERS_PER_CLUB} offers per window`);
 const sent = checkSide(run, human, give, 'You');
 const asked = checkSide(run, seat, get, 'That club');
 market.proposals[seat]++;
 const offer: TradeOffer = { id: market.offers.length, from: human, to: seat, give: sent, get: asked, status: 'open', counterTo: null, unsolicited: false, note: '' };
 market.offers.push(offer);
 const needed = MARGIN + (underPressure(run, human) ? LEVERAGE : 0);
 if (gain(run, seat, asked, sent) >= needed) {
  offer.note = 'Accepted';
  execute(run, offer, seating);
  return offer;
 }
 const mine = ownedIds(run, human).filter(id => tradeable(run, id) && !sent.includes(id));
 const variants: { give: string[]; get: string[]; value: number }[] = [];
 if (sent.length < MAX_TRADE_CARDS) for (const id of mine) variants.push({ give: [...sent, id], get: asked, value: gain(run, seat, asked, [...sent, id]) });
 if (asked.length > 1) for (const id of asked) variants.push({ give: sent, get: asked.filter(other => other !== id), value: gain(run, seat, asked.filter(other => other !== id), sent) });
 // The least it can ask for: the smallest gain that still clears its bar.
 const counter = variants.filter(variant => variant.value >= needed).sort((a, b) => a.value - b.value || compareId([...a.give, ...a.get].join(), [...b.give, ...b.get].join()))[0];
 if (!counter) {
  offer.status = 'rejected';
  offer.note = 'Not interested';
  return offer;
 }
 offer.status = 'countered';
 offer.note = counter.give.length > sent.length ? 'Wants more' : 'Will send less';
 market.offers.push({ id: market.offers.length, from: seat, to: human, give: counter.get, get: counter.give, status: 'open', counterTo: offer.id, unsolicited: false, note: offer.note });
 return offer;
}

/** The player accepts or declines an open offer from an AI club. Accepting re-checks that every card can still move. */
export function respond(run: DraftRun, offerId: unknown, accept: unknown, seating: Seating): TradeOffer {
 const offer = run.market!.offers.find(item => item.id === offerId);
 if (!offer || offer.to !== run.seating.humanSeat) throw new MarketError('There is no such offer for you');
 if (offer.status !== 'open') throw new MarketError('That offer is no longer open');
 if (typeof accept !== 'boolean') throw new MarketError('Accept or decline the offer');
 if (!accept) { offer.status = 'declined'; return offer; }
 checkSide(run, offer.from, offer.give, 'That club');
 checkSide(run, offer.to, offer.get, 'You');
 execute(run, offer, seating);
 return offer;
}

/** Releases one of `seat`'s cards to waivers. */
export function release(run: DraftRun, seat: number, cardId: string): void {
 transfer(run.pool.ledger, cardId, roster(seat), RELEASED, 'release');
 run.market!.releasedBy.set(cardId, seat);
}

/** Cards on waivers, in id order. */
export const waiverCards = (run: DraftRun): string[] => heldBy(run.pool.ledger, RELEASED);

/** Marks or unmarks a waiver card the player will claim when waivers close. */
export function setClaim(run: DraftRun, cardId: unknown, on: unknown): void {
 const market = run.market!;
 if (typeof cardId !== 'string' || !waiverCards(run).includes(cardId)) throw new MarketError('That card is not on waivers');
 if (market.releasedBy.get(cardId) === run.seating.humanSeat) throw new MarketError('You released that card');
 if (typeof on !== 'boolean') throw new MarketError('Claim or unclaim the card');
 market.claims = market.claims.filter(id => id !== cardId);
 if (on) market.claims.push(cardId);
}

/** A seat may claim a card while it has room and could still fill every open row with commons under the cap. */
export function canClaim(run: DraftRun, seat: number, cardId: string): boolean {
 const ids = ownedIds(run, seat);
 const size = rosterSize(run.pool.rules);
 if (ids.length >= size || run.market!.releasedBy.get(cardId) === seat) return false;
 return payroll(run, [...ids, cardId]) + (size - ids.length - 1) * run.pool.rules.commonSalaryMax <= effectiveCap(run.budgets[seat]);
}

/**
 * Closes waivers: in claim order, each club takes one card per pass (the player its first marked card it
 * can afford, an AI club the card it gains most from) until a pass claims nothing. A claimed card keeps
 * its trade deadline. Unclaimed cards return to the unowned pool for good, the AI clubs fill their
 * rosters from cleanup and submit, and the window moves to cleanup.
 */
export function closeWaivers(run: DraftRun, seating: Seating): void {
 const market = run.market!;
 const human = run.seating.humanSeat;
 for (let claimedThisPass = true; claimedThisPass;) {
  claimedThisPass = false;
  for (const seat of market.priority) {
   const pool = waiverCards(run).filter(id => canClaim(run, seat, id));
   let choice: string | undefined;
   if (seat === human) choice = market.claims.find(id => pool.includes(id));
   else {
    const scored = pool.map(id => ({ id, value: gain(run, seat, [], [id]) })).filter(item => item.value >= MARGIN);
    choice = scored.sort((a, b) => b.value - a.value || compareId(a.id, b.id))[0]?.id;
   }
   if (!choice) continue;
   transfer(run.pool.ledger, choice, RELEASED, roster(seat), 'claim');
   market.claimed.push({ cardId: choice, seat });
   if (seat === human) seating.arrive(choice);
   claimedThisPass = true;
  }
 }
 for (const id of waiverCards(run)) transfer(run.pool.ledger, id, RELEASED, UNOWNED, 'cut');
 for (const offer of market.offers) if (offer.status === 'open') offer.status = 'void';
 for (let seat = 0; seat < run.seating.seats.length; seat++) {
  if (seat === human) continue;
  const recovered = recoverSeat(run.pool, run.budgets[seat], seat);
  if (recovered.failures.length) throw new Error(`Seat ${seat} cannot reach a legal opening roster`);
  run.submissions[seat] = recovered.submission;
 }
 market.step = 'cleanup';
}
