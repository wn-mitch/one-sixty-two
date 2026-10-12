import { chooseAiPick, judgeFor, personalityFor, scorePile, type Judgment, type Personality, type PickScore, type SeatView } from './ai.ts';
import { DIFFICULTIES, DEFAULT_DIFFICULTY, type Difficulty } from './scouting.ts';
import { seatTable, type TableSeating } from './franchises.ts';
import { heldBy, transfer, UNOWNED } from './ledger.ts';
import { STACK_ROLES, type StackRole } from './cleanup.ts';
import { checkSubmission } from './legality.ts';
import { recoverSeat } from './recovery.ts';
import { buildRunPool, pileHeldBy, type RunPool } from './pool.ts';
import { baselineBudget, DRAFT_RULES, picksPerSeat, rosterSize } from './rules.ts';
import { randomStream } from '../game/random.ts';
import type { DraftCard, DraftSlot, LegalityReport, PayrollBudget, Submission } from './types.ts';
import { DRAFT_RULES_VERSION, RUN_VERSION, SALARY_VERSION } from './versions.ts';

/** Everything a run is built from besides the player's actions. A seed alone cannot rebuild a run. */
export interface RunSetup {
 runVersion: string;
 rulesVersion: string;
 salaryVersion: string;
 dataVersion: string;
 seed: number;
 franchiseId: string;
 /** How sharply the AI clubs judge cards. */
 difficulty: Difficulty;
}

/** The data version's cards, franchises and park fits that a run is dealt and scored from. */
export interface RunData {
 cards: readonly DraftCard[];
 franchiseIds: readonly string[];
 /** Runs `seasonId` gains or loses over a home half-season in `franchiseId`'s park. */
 parkFit(franchiseId: string, seasonId: string): number;
}

/**
 * One player decision. Runs are rebuilt by replaying these against the setup. A pick drafts from
 * the held pile; in the opening window a cut releases an owned card, a cleanup takes the top card of
 * one of the player's stacks, auto-fix applies the AI clubs' recovery to the player's roster, and a
 * submit fixes the opening roster.
 */
export type RunAction =
 | { type: 'pick'; cardId: string }
 | { type: 'cut'; cardId: string }
 | { type: 'cleanup'; role: StackRole }
 | { type: 'autofix' }
 | { type: 'submit'; active: Record<DraftSlot, string>; reserves: string[] };

/** Drafting, then the opening window, then the league season once the player submits. */
export type RunPhase = 'drafting' | 'window' | 'season';

/** A pick as the ticker shows it; AI picks carry the score that explains them (see `explainPick`). */
export interface TickerPick {
 pick: number;
 seat: number;
 cardId: string;
 reason: Omit<PickScore, 'cardId' | 'score'> | null;
}

export interface DraftRun {
 readonly setup: RunSetup;
 readonly data: RunData;
 readonly pool: RunPool;
 readonly seating: TableSeating;
 /** Seeded personality per seat; null at the player's seat. */
 readonly personalities: readonly (Personality | null)[];
 /** Each AI seat's fixed judgment of cards; null at the player's seat. */
 readonly judges: readonly (((card: DraftCard) => Judgment) | null)[];
 readonly budgets: readonly PayrollBudget[];
 /** Undrafted card ids in each pile, indexed by the seat first dealt it. */
 readonly piles: string[][];
 readonly ticker: TickerPick[];
 readonly actions: RunAction[];
 /** Card ids each seat has held in a pile; an AI seat reasons only from these and the public picks. */
 readonly seen: Set<string>[];
 /** Each seat's opening roster once fixed: AI seats when the draft ends, the player's on submit. */
 readonly submissions: (Submission | null)[];
 pick: number;
 phase: RunPhase;
 readonly aiRandoms: (() => number)[];
}

/** An action the run cannot apply; the run is unchanged. */
export class RunActionError extends Error {}

/** The setup for a new run under the versions this build supports. */
export function newRunSetup(seed: number, franchiseId: string, dataVersion: string, difficulty: Difficulty = DEFAULT_DIFFICULTY): RunSetup {
 return { runVersion: RUN_VERSION, rulesVersion: DRAFT_RULES_VERSION, salaryVersion: SALARY_VERSION, dataVersion, seed: seed >>> 0, franchiseId, difficulty };
}

/** Names the first version a saved setup has that this build does not support, or null. */
export function unsupportedVersion(setup: RunSetup, dataVersion: string): string | null {
 if (setup.runVersion !== RUN_VERSION) return `run format ${setup.runVersion}`;
 if (setup.rulesVersion !== DRAFT_RULES_VERSION) return `draft rules ${setup.rulesVersion}`;
 if (setup.salaryVersion !== SALARY_VERSION) return `salaries ${setup.salaryVersion}`;
 if (setup.dataVersion !== dataVersion) return 'player data';
 if (!DIFFICULTIES.includes(setup.difficulty)) return `difficulty ${String(setup.difficulty)}`;
 return null;
}

/** Seats the table and deals the packs. `data` must be decoded for `setup.dataVersion`. */
export function startRun(setup: RunSetup, data: RunData): DraftRun {
 const stale = unsupportedVersion(setup, setup.dataVersion);
 if (stale) throw new Error(`This build cannot run a draft saved with ${stale}`);
 const rules = DRAFT_RULES;
 const pool = buildRunPool(setup.seed, data.cards, rules);
 if (pool.failures.length || pool.warnings.length) throw new Error('The card data cannot deal a complete table');
 const seating = seatTable(setup.seed, setup.franchiseId, data.franchiseIds, rules.seats);
 const personalities = seating.seats.map((franchiseId, seat) => seat === seating.humanSeat ? null : personalityFor(setup.seed, seat, franchiseId, setup.difficulty));
 return {
  setup, data, pool, seating,
  personalities,
  judges: personalities.map((personality, seat) => personality && judgeFor(setup.seed, seat, personality, setup.difficulty)),
  budgets: seating.seats.map(() => baselineBudget(pool.tableCap)),
  piles: pool.packs.map(packs => packs.flat()),
  ticker: [], actions: [], seen: seating.seats.map(() => new Set<string>()), submissions: seating.seats.map(() => null), pick: 0, phase: 'drafting',
  aiRandoms: seating.seats.map((_, seat) => randomStream(setup.seed, `draft:ai:seat:${seat}`))
 };
}

const card = (run: DraftRun, id: string): DraftCard => run.pool.ledger.cards.get(id)!;

/** Cards a seat has drafted, in id order. */
export const ownedBy = (run: DraftRun, seat: number): DraftCard[] => heldBy(run.pool.ledger, { kind: 'roster', seat }).map(id => card(run, id));

/** The pile a seat holds at the current pick, or an empty list once the draft is over. */
export function heldPile(run: DraftRun, seat = run.seating.humanSeat): DraftCard[] {
 if (run.phase !== 'drafting') return [];
 return run.piles[pileHeldBy(seat, run.pick, run.pool.rules.seats)].map(id => card(run, id));
}

function take(run: DraftRun, seat: number, cardId: string, score: PickScore | null): void {
 const pile = pileHeldBy(seat, run.pick, run.pool.rules.seats);
 transfer(run.pool.ledger, cardId, { kind: 'pile', pile }, { kind: 'roster', seat }, 'draft');
 run.piles[pile].splice(run.piles[pile].indexOf(cardId), 1);
 let reason: TickerPick['reason'] = null;
 if (score) { const { cardId: _id, score: _score, ...parts } = score; reason = parts; }
 run.ticker.push({ pick: run.pick, seat, cardId, reason });
}

/** What `seat` may know when it picks: its pile, its cards, its budget and undrafted cards it saw earlier. */
export function seatView(run: DraftRun, seat: number): SeatView {
 const pile = heldPile(run, seat);
 const inPile = new Set(pile.map(item => item.seasonId));
 const seenElsewhere = [...run.seen[seat]].filter(id => !inPile.has(id) && run.pool.ledger.instances.get(id)?.owner.kind === 'pile').map(id => card(run, id));
 const home = run.seating.seats[seat];
 const judge = run.judges[seat];
 if (!judge) throw new Error(`Seat ${seat} is the player's; it has no AI view`);
 return { pile, owned: ownedBy(run, seat), budget: run.budgets[seat], seenElsewhere, parkFit: id => run.data.parkFit(home, id), judge };
}

/**
 * Applies one player action. A pick takes the card from the player's held pile; every AI seat
 * then picks from the pile it holds, and the piles pass left. When the last pick is made the AI
 * clubs recover their opening rosters and the window opens. Invalid actions throw
 * `RunActionError` before anything changes.
 */
export function applyAction(run: DraftRun, action: RunAction): void {
 if (action.type === 'pick') applyPick(run, action.cardId);
 else if (run.phase !== 'window') throw new RunActionError(run.phase === 'drafting' ? 'The draft is still on' : 'The opening window is closed');
 else applyWindowAction(run, action);
 run.actions.push(action);
}

function applyPick(run: DraftRun, cardId: string): void {
 if (run.phase !== 'drafting') throw new RunActionError('The draft is over');
 const human = run.seating.humanSeat;
 if (!heldPile(run, human).some(item => item.seasonId === cardId)) throw new RunActionError(`${cardId} is not in your pile`);
 for (let seat = 0; seat < run.seating.seats.length; seat++) for (const item of heldPile(run, seat)) run.seen[seat].add(item.seasonId);
 // Every seat holds a different pile, so the AI picks do not depend on the player's pick this round.
 const aiPicks = run.seating.seats.flatMap((_, seat) => {
  if (seat === human) return [];
  const scores = scorePile(seatView(run, seat), run.personalities[seat]!, run.aiRandoms[seat], run.pool.rules);
  return [{ seat, choice: chooseAiPick(scores) }];
 });
 take(run, human, cardId, null);
 for (const { seat, choice } of aiPicks) take(run, seat, choice.cardId, choice);
 run.pick++;
 if (run.pick === picksPerSeat(run.pool.rules)) {
  if (run.piles.some(pile => pile.length)) throw new Error('The draft left undrafted cards');
  run.phase = 'window';
  for (let seat = 0; seat < run.seating.seats.length; seat++) {
   if (seat === human) continue;
   const recovered = recoverSeat(run.pool, run.budgets[seat], seat);
   if (recovered.failures.length) throw new Error(`Seat ${seat} cannot reach a legal opening roster`);
   run.submissions[seat] = recovered.submission;
  }
 }
}

function applyWindowAction(run: DraftRun, action: Exclude<RunAction, { type: 'pick' }>): void {
 const human = run.seating.humanSeat;
 const seat = { kind: 'roster', seat: human } as const;
 const owned = ownedBy(run, human);
 if (action.type === 'cut') {
  if (!owned.some(item => item.seasonId === action.cardId)) throw new RunActionError(`${action.cardId} is not on your roster`);
  transfer(run.pool.ledger, action.cardId, seat, UNOWNED, 'cut');
 } else if (action.type === 'cleanup') {
  if (!STACK_ROLES.includes(action.role)) throw new RunActionError(`Unknown cleanup stack ${String(action.role)}`);
  if (owned.length >= rosterSize(run.pool.rules)) throw new RunActionError('Your roster is full; cut a card first');
  const top = run.pool.cleanup.peek(human, action.role);
  if (!top) throw new RunActionError(`The ${action.role} stack is empty`);
  transfer(run.pool.ledger, top.seasonId, UNOWNED, seat, 'cleanup');
 } else if (action.type === 'autofix') {
  recoverSeat(run.pool, run.budgets[human], human);
 } else if (action.type === 'submit') {
  const submission: Submission = { seat: human, active: { ...action.active }, reserves: [...action.reserves] };
  let report: LegalityReport;
  try { report = checkSubmission(submission, run.pool.ledger, run.budgets[human], run.pool.rules); }
  catch (error) { throw new RunActionError((error as Error).message); }
  if (!report.legal) throw new RunActionError('That roster is not legal yet');
  if (owned.length !== rosterSize(run.pool.rules)) throw new RunActionError('Place or cut every card you own');
  run.submissions[human] = submission;
  run.phase = 'season';
 } else {
  throw new RunActionError(`Unknown action ${(action as { type: string }).type}`);
 }
}

/** The player's roster as it stands, checked against the cap and slots, for the window's checklist. */
export function windowReport(run: DraftRun, submission: Submission): LegalityReport {
 return checkSubmission(submission, run.pool.ledger, run.budgets[run.seating.humanSeat], run.pool.rules);
}

/** Rebuilds a run from its setup and action log; throws if any action no longer applies. */
export function replayRun(setup: RunSetup, actions: readonly RunAction[], data: RunData): DraftRun {
 const run = startRun(setup, data);
 for (const action of actions) applyAction(run, action);
 return run;
}
