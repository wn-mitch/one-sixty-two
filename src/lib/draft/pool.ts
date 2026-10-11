import { compareId, HITTER_SLOTS, POSITIONS, type Slot } from '../game/types.ts';
import { randomStream, shuffle } from '../game/random.ts';
import { createLedger, transfer, UNOWNED } from './ledger.ts';
import { DRAFT_RULES, type CubeRole, type DraftRules } from './rules.ts';
import type { DraftCard, Ledger, LegalityFailure, PackTier } from './types.ts';

/** A cleanup kit position: an active slot, or null for a flex reserve that any common fills. */
export type KitRow = Slot | null;
/** One full roster of commons; the three rotation slots each take a starter. */
export const KIT_ROWS: readonly KitRow[] = [...POSITIONS, 'DH', 'SP1', 'SP2', 'SP3', 'CL', 'BP', null, null];

export interface RunPool {
 seed: number;
 rules: DraftRules;
 ledger: Ledger;
 /** packs[wave][pack] lists the card ids opened at seat `pack` in that wave. */
 packs: string[][][];
 cleanupStock: string[];
 universeSize: number;
 warnings: string[];
 failures: LegalityFailure[];
}

export const isCommon = (card: DraftCard, rules: DraftRules = DRAFT_RULES): boolean => card.finish === 'base' && card.salary <= rules.commonSalaryMax;

export function cubeRole(card: DraftCard): CubeRole {
 const slot = card.pricedSlot;
 if ((HITTER_SLOTS as readonly Slot[]).includes(slot)) return 'hitter';
 return slot === 'CL' ? 'CL' : slot === 'BP' ? 'BP' : 'SP';
}

/** Seat that opened the pack `seat` holds at `pick`: wave 0 passes left, wave 1 passes right. */
export function packHolder(seat: number, wave: number, pick: number, seats = DRAFT_RULES.seats): number {
 const offset = wave % 2 === 0 ? -pick : pick;
 return ((seat + offset) % seats + seats) % seats;
}

const fitsKit = (card: DraftCard, row: KitRow): boolean => row === null || card.eligibleSlots.includes(row);

/**
 * Builds one run's finite pool from real cards. Cleanup stock is reserved first: one full roster of
 * commons per seat, so every seat could replace its entire draft. The cube is then dealt from the
 * remaining cards by role and tier quota. Everything else stays in the implicit unowned universe.
 * No pool holds a bullpen together with one of its member player-seasons.
 */
export function buildRunPool(seed: number, cards: readonly DraftCard[], rules: DraftRules = DRAFT_RULES): RunPool {
 const universe = shuffle(cards.filter(card => card.year >= rules.minYear && card.year <= rules.maxYear).sort((a, b) => compareId(a.seasonId, b.seasonId)), randomStream(seed, 'draft:pool:order'));
 const ledger = createLedger(cards);
 const pool: RunPool = { seed, rules, ledger, packs: [], cleanupStock: [], universeSize: universe.length, warnings: [], failures: [] };
 const blocked = new Set<string>();
 const available = (card: DraftCard): boolean => !blocked.has(card.seasonId) && !ledger.instances.has(card.seasonId);
 const take = (card: DraftCard): void => {
  blocked.add(card.seasonId);
  for (const conflict of card.conflicts) blocked.add(conflict);
 };

 // Narrow-eligibility commons first, so multi-position cards stay available for scarcer needs.
 const commons = universe.filter(card => isCommon(card, rules)).map((card, order) => ({ card, order }))
  .sort((a, b) => a.card.eligibleSlots.length - b.card.eligibleSlots.length || a.order - b.order).map(entry => entry.card);
 for (const row of KIT_ROWS) {
  const eligible = commons.filter(card => fitsKit(card, row));
  let cursor = 0, filled = 0;
  for (let kit = 0; kit < rules.cleanupKits; kit++) {
   while (cursor < eligible.length && !available(eligible[cursor])) cursor++;
   if (cursor === eligible.length) break;
   const card = eligible[cursor++];
   take(card);
   transfer(ledger, card.seasonId, UNOWNED, { kind: 'cleanup-stock' }, 'reserve-cleanup');
   pool.cleanupStock.push(card.seasonId);
   filled++;
  }
  if (filled < rules.cleanupKits) {
   const slot = row ?? 'reserve';
   const prior = pool.failures.find(failure => failure.code === 'stock-role-shortfall' && failure.slot === slot);
   if (prior && prior.code === 'stock-role-shortfall') prior.needed += rules.cleanupKits;
   else pool.failures.push({ code: 'stock-role-shortfall', slot, needed: rules.cleanupKits, available: filled });
  }
 }

 const tiers: PackTier[] = ['high', 'mid', 'base'];
 const chosen: Record<PackTier, DraftCard[]> = { high: [], mid: [], base: [] };
 const draw = (tier: PackTier, count: number, accepts: (card: DraftCard) => boolean, label: string): number => {
  let drawn = 0;
  for (const card of universe) {
   if (drawn === count) break;
   if (card.packTier !== tier || !available(card) || !accepts(card)) continue;
   take(card);
   chosen[tier].push(card);
   drawn++;
  }
  if (drawn < count) pool.warnings.push(`cube ${label} ${tier}: ${drawn} of ${count}`);
  return drawn;
 };
 // Positional coverage comes from base hitters, before the rest of the hitter quota.
 let positionDraws = 0;
 for (const tier of tiers) for (const role of Object.keys(rules.cubeQuota) as CubeRole[]) {
  const quota = rules.cubeQuota[role][tier];
  if (role === 'hitter' && tier === 'base') {
   for (const position of POSITIONS) {
    const have = [...chosen.high, ...chosen.mid, ...chosen.base].filter(card => cubeRole(card) === 'hitter' && card.eligibleSlots.includes(position)).length;
    const need = Math.min(Math.max(0, rules.cubePositionMinimum - have), quota - positionDraws);
    positionDraws += draw(tier, need, card => cubeRole(card) === 'hitter' && card.eligibleSlots.includes(position), `hitter ${position}`);
   }
   draw(tier, quota - positionDraws, card => cubeRole(card) === 'hitter', 'hitter');
  } else draw(tier, quota, card => cubeRole(card) === role, role);
 }
 for (const position of POSITIONS) {
  const count = [...chosen.high, ...chosen.mid, ...chosen.base].filter(card => cubeRole(card) === 'hitter' && card.eligibleSlots.includes(position)).length;
  if (count < rules.cubePositionMinimum) pool.warnings.push(`cube ${position} coverage ${count} below ${rules.cubePositionMinimum}`);
 }

 const dealing = randomStream(seed, 'draft:pool:deal');
 for (const tier of tiers) shuffle(chosen[tier], dealing);
 for (let wave = 0; wave < rules.waves; wave++) {
  const packs: string[][] = [];
  for (let pack = 0; pack < rules.seats; pack++) {
   const index = wave * rules.seats + pack;
   const cardsInPack = tiers.flatMap(tier => chosen[tier].slice(index * rules.collation[tier], (index + 1) * rules.collation[tier]));
   if (cardsInPack.length !== rules.packSize) pool.warnings.push(`wave ${wave} pack ${pack} has ${cardsInPack.length} cards`);
   for (const card of cardsInPack) transfer(ledger, card.seasonId, UNOWNED, { kind: 'cube', wave, pack }, 'reserve-cube');
   packs.push(shuffle(cardsInPack.map(card => card.seasonId), dealing));
  }
  pool.packs.push(packs);
 }
 return pool;
}
