import { compareId } from '../../src/lib/game/types.ts';
import { randomStream } from '../../src/lib/game/random.ts';
import { arrangeRoster, fits } from '../../src/lib/draft/legality.ts';
import { heldBy, transfer } from '../../src/lib/draft/ledger.ts';
import { pileHeldBy, type RunPool } from '../../src/lib/draft/pool.ts';
import { baselineBudget, FINISH_ORDER, picksPerSeat } from '../../src/lib/draft/rules.ts';
import { chooseAiPick, judgeFor, personalityFor, rosterValue, scorePile, trueJudgment, type Judgment, type Personality } from '../../src/lib/draft/ai.ts';
import type { Difficulty } from '../../src/lib/draft/scouting.ts';
import type { DraftCard } from '../../src/lib/draft/types.ts';

/**
 * Pick policies that stress the opening contract. `ai` is the Draft Mode general manager at the
 * run's difficulty, and `perfect` is the same scorer with true values and no quirks, standing in
 * for a strong player. The rest are stand-ins: `value` drives payroll over the cap, `lopsided`
 * leaves roles empty and creates surplus, `needs` drafts toward a complete roster, and `random`
 * ignores both.
 */
export const PICK_POLICIES = ['ai', 'perfect', 'value', 'needs', 'lopsided', 'random'] as const;
export type PickPolicy = typeof PICK_POLICIES[number];

/**
 * AI picks made, picks where the pile held more than one finish, how many of those took the
 * highest finish, the summed home park fit of the picks and of the average card in each pile,
 * and how many picks home park fit decided.
 */
export interface AiPickStats { picks: number; contested: number; topFinish: number; pickedPark: number; pilePark: number; parkDecided: number }

const byValue = (a: DraftCard, b: DraftCard): number => b.valueRuns - a.valueRuns || compareId(a.seasonId, b.seasonId);

const PERFECT: Omit<Personality, 'franchiseId'> = { archetype: 'balanced', thrift: 1.4, bias: 'none', decade: null };

function choose(policy: PickPolicy, options: DraftCard[], owned: DraftCard[], random: () => number, ai: () => DraftCard): DraftCard {
 if (policy === 'ai' || policy === 'perfect') return ai();
 const ranked = [...options].sort(byValue);
 if (policy === 'value') return ranked[0];
 if (policy === 'random') return options[Math.floor(random() * options.length)];
 if (policy === 'lopsided') return ranked.find(card => card.eligibleSlots.includes('DH')) ?? ranked[0];
 const open = arrangeRoster(owned).open.filter(row => row !== null);
 return ranked.find(card => open.some(row => fits(card, row))) ?? ranked[0];
}

/** Runs the pass-left draft: each seat cracks its packs into one pile, takes a card from the pile it holds, then passes. */
export interface TableOptions {
 difficulty: Difficulty;
 /** Home franchise per seat; park fit and homer bias read it. */
 homes: readonly string[];
 parkFit: (seat: number, seasonId: string) => number;
}

/** True roster value per seat after the draft: its best arrangement at true value plus home park fit. */
export type DraftOutcome = AiPickStats & { values: number[] };

export function runDraft(pool: RunPool, policies: readonly PickPolicy[], table: TableOptions): DraftOutcome {
 const { ledger, rules } = pool;
 const parkFit = table.parkFit;
 const personalities: Personality[] = policies.map((policy, seat) => policy === 'perfect' ? { ...PERFECT, franchiseId: table.homes[seat] } : personalityFor(pool.seed, seat, table.homes[seat], table.difficulty));
 const judges: ((card: DraftCard) => Judgment)[] = policies.map((policy, seat) => policy === 'perfect' ? trueJudgment : judgeFor(pool.seed, seat, personalities[seat], table.difficulty));
 const randoms = policies.map((_, seat) => randomStream(pool.seed, `draft:policy:seat:${seat}`));
 const piles = pool.packs.map(packs => packs.flat());
 const seen = policies.map(() => new Set<string>());
 const stats: AiPickStats = { picks: 0, contested: 0, topFinish: 0, pickedPark: 0, pilePark: 0, parkDecided: 0 };
 for (let pick = 0; pick < picksPerSeat(rules); pick++) {
  for (let seat = 0; seat < rules.seats; seat++) {
   const pile = pileHeldBy(seat, pick, rules.seats);
   const options = piles[pile].map(id => ledger.cards.get(id)!);
   if (!options.length) throw new Error(`Seat ${seat} received an empty pile`);
   const owned = heldBy(ledger, { kind: 'roster', seat }).map(id => ledger.cards.get(id)!);
   for (const option of options) seen[seat].add(option.seasonId);
   const ai = (): DraftCard => {
    const inPile = new Set(piles[pile]);
    const seenElsewhere = [...seen[seat]].filter(id => !inPile.has(id) && ledger.instances.get(id)?.owner.kind === 'pile').map(id => ledger.cards.get(id)!);
    const home = (id: string): number => parkFit(seat, id);
    const view = { pile: options, owned, budget: baselineBudget(), seenElsewhere, parkFit: home, judge: judges[seat] };
    const id = chooseAiPick(scorePile(view, personalities[seat], randoms[seat])).cardId;
    if (policies[seat] !== 'ai') return options.find(card => card.seasonId === id)!;
    const picked = options.find(card => card.seasonId === id)!;
    // Choice proof: how often the AI takes the pile's highest finish when finishes differ.
    const ranks = options.map(card => FINISH_ORDER.indexOf(card.finish));
    if (Math.max(...ranks) !== Math.min(...ranks)) {
     stats.contested++;
     if (FINISH_ORDER.indexOf(picked.finish) === Math.max(...ranks)) stats.topFinish++;
    }
    // Park-decided picks: without jitter, the choice with home park fit differs from the choice without it.
    const steady = (fit: (id: string) => number) => chooseAiPick(scorePile({ ...view, parkFit: fit }, personalities[seat], () => 0)).cardId;
    if (steady(home) !== steady(() => 0)) stats.parkDecided++;
    stats.picks++;
    stats.pickedPark += home(picked.seasonId);
    stats.pilePark += options.reduce((sum, card) => sum + home(card.seasonId), 0) / options.length;
    return picked;
   };
   const card = choose(policies[seat], options, owned, randoms[seat], ai);
   transfer(ledger, card.seasonId, { kind: 'pile', pile }, { kind: 'roster', seat }, 'draft');
   piles[pile].splice(piles[pile].indexOf(card.seasonId), 1);
  }
 }
 if (piles.some(pile => pile.length)) throw new Error('The draft left undrafted cards');
 const values = policies.map((_, seat) => rosterValue(heldBy(ledger, { kind: 'roster', seat }).map(id => ledger.cards.get(id)!), trueJudgment, id => parkFit(seat, id), rules));
 return { ...stats, values };
}
