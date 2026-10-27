import { randomStream, shuffle } from '../game/random.ts';
import { HITTER_SLOTS, STARTER_SLOTS, type Position, type Profile } from '../game/types.ts';
import { LEAGUE_SEGMENTS } from '../sim/league-types.ts';
import { BASE_RISK, pushRefusal, pushRisk, takePush, type Injury } from './injuries.ts';
import { seasonExchange, standings, type LeagueSeason } from './league.ts';
import { isCommon } from './cleanup.ts';
import { learnPosition } from './ledger.ts';
import { franchisePackage, trainingGainFor, trainingPriceFor } from './packages.ts';
import type { DraftRun } from './run.ts';
import type { LearnedPosition } from './types.ts';
import { BASIC_KINDS, canTrain, developed, INTENSIVE_SCALE, learnedGlove, SPECIAL_KINDS, train, TRAININGS, woba, type SpecialKind, type TrainingKind, type Upgrade } from './training.ts';

/**
 * The training shop at every season stop: the four basics and two specials drawn for that stop,
 * the same for every club, plus any its franchise always offers. A club may buy one training per
 * card per visit with its banked cash, at its franchise's prices and gains.
 */
export const SPECIALS_PER_VISIT = 2;

export class ShopError extends Error {}

/** The specials on offer at stop `stop` (segments played), seeded and different from stop to stop. */
export function specialsAt(seed: number, stop: number): SpecialKind[] {
 return shuffle([...SPECIAL_KINDS], randomStream(seed, `draft:shop:${stop}`)).slice(0, SPECIALS_PER_VISIT);
}

export const offersAt = (seed: number, stop: number): TrainingKind[] => [...BASIC_KINDS, ...specialsAt(seed, stop)];

/** What `seat` may buy at stop `stop`: the stop's offers and its franchise's standing ones. */
export function offersFor(run: DraftRun, seat: number, stop: number): TrainingKind[] {
 const offers = offersAt(run.setup.seed, stop);
 const extra = (franchisePackage(run.seating.seats[seat])?.alwaysOffered ?? []).filter(kind => !offers.includes(kind));
 return [...offers, ...extra];
}

/** What `kind` costs `seat` at this stop. */
export const priceFor = (run: DraftRun, season: LeagueSeason, seat: number, kind: TrainingKind): number => trainingPriceFor(run.seating.seats[seat], TRAININGS[kind].price, seasonExchange(run, season, seat));

/** The gain multiplier `seat` gets on `kind` now: intensive training, times its franchise perk. */
export function gainScale(run: DraftRun, season: LeagueSeason, seat: number, kind: TrainingKind, intensive = false): number {
 const commons = Object.values(season.lineups[seat].active).filter(id => isCommon(run.pool.ledger.cards.get(id)!, run.pool.rules)).length;
 return (intensive ? INTENSIVE_SCALE : 1) * trainingGainFor(run.seating.seats[seat], kind, commons);
}

/** A seat's season cards: its active lineup and reserves. */
export const seasonRoster = (season: LeagueSeason, seat: number): string[] => [...Object.values(season.lineups[seat].active), ...season.lineups[seat].reserves];

/** Whether `cardId` has already been trained at this visit. */
export const trainedThisVisit = (season: LeagueSeason, cardId: string): boolean => season.upgrades.some(upgrade => upgrade.cardId === cardId && upgrade.stop === season.segments.length && !upgrade.free);

/**
 * Why `seat` cannot buy `kind` for the card now, intensively or not, or null when it can. `profile`
 * is the card's printed profile; cross-training names the `position` to learn.
 */
export function refusal(run: DraftRun, season: LeagueSeason, seat: number, profile: Profile, kind: TrainingKind, intensive = false, position?: Position): string | null {
 const stop = season.segments.length;
 if (stop >= LEAGUE_SEGMENTS) return 'The season is over';
 if (run.phase !== 'season') return 'Finish the chapter market first';
 if (!offersFor(run, seat, stop).includes(kind)) return `${TRAININGS[kind].name} is not on offer at this stop`;
 if (!seasonRoster(season, seat).includes(profile.seasonId)) return `${profile.displayName} is not on this roster`;
 if (trainedThisVisit(season, profile.seasonId)) return `${profile.displayName} has already trained at this stop`;
 const now = developed(profile, season.upgrades, stop);
 if (!canTrain(now, kind, season.upgrades)) return `${TRAININGS[kind].name} does not apply to ${profile.displayName}`;
 if (kind === 'crossTraining' && (!position || learnedGlove(now, position) === null)) return `${profile.displayName} cannot learn ${position ?? 'a position this way'}`;
 if (season.cash[seat] < priceFor(run, season, seat, kind)) return 'Not enough cash';
 if (intensive && (kind === 'recovery' || kind === 'crossTraining')) return `${TRAININGS[kind].name} cannot be trained intensively`;
 return intensive ? pushRefusal(run, season, seat, profile.seasonId, 'intensive') : null;
}

/**
 * Buys `kind` for the card, paid by `seat`; intensive training gains more and rolls its injury at
 * once. Cross-training teaches `position` and makes the card eligible there at once, wherever it
 * goes for the rest of the run. Throws `ShopError` with the reason when it cannot.
 */
export function buyTraining(run: DraftRun, season: LeagueSeason, seat: number, profile: Profile, kind: TrainingKind, intensive = false, position?: Position): { upgrade: Upgrade; injury: Injury | null } {
 const reason = refusal(run, season, seat, profile, kind, intensive, position);
 if (reason) throw new ShopError(reason);
 const scale = kind === 'crossTraining' ? 1 : gainScale(run, season, seat, kind, intensive);
 const upgrade: Upgrade = {
  cardId: profile.seasonId, kind, stop: season.segments.length, paidBy: seat, cost: priceFor(run, season, seat, kind),
  ...(intensive ? { intensive } : {}), ...(scale !== 1 ? { scale } : {}), ...(kind === 'crossTraining' ? { position } : {})
 };
 season.upgrades.push(upgrade);
 if (upgrade.position) learnPosition(run.pool.ledger, upgrade.cardId, upgrade.position);
 season.cash[seat] -= upgrade.cost;
 return { upgrade, injury: intensive ? takePush(run, season, seat, profile.seasonId, 'intensive') : null };
}

/** Plate appearances or batters faced a season, by role, so a gain in wOBA compares across roles. */
const EXPOSURE = { hitter: 650, starter: 700, reliever: 280 } as const;

/** An AI club within this many games of first place pushes its ace and closer. */
export const CONTENDING_GAMES_BACK = 3;

/**
 * AI clubs shop once a stop, before the next games: while cash allows, each buys the basic
 * hitting or pitching training with the largest expected gain over its active cards, one per
 * card. AI clubs ignore specials, fielding and baserunning. After opening day, a club out of
 * contention trains its first purchase intensively; a contender rides its ace and skips its
 * closer's rest. Neither pushes a card twice in a chapter, and neither plays through an injury.
 */
export function aiShop(run: DraftRun, season: LeagueSeason, profiles: ReadonlyMap<string, Profile>): void {
 const stop = season.segments.length;
 if (stop >= LEAGUE_SEGMENTS || season.aiShopped >= stop) return;
 season.aiShopped = stop;
 const table = standings(season);
 const fresh = (id: string) => pushRisk(season, id) === BASE_RISK;
 for (let seat = 0; seat < season.lineups.length; seat++) {
  if (seat === run.seating.humanSeat) continue;
  const lineup = season.lineups[seat];
  const active = lineup.active;
  const contending = stop > 0 && table.find(row => row.seat === seat)!.gamesBack <= CONTENDING_GAMES_BACK;
  let first = true;
  for (;;) {
   let best: { profile: Profile; kind: TrainingKind; gain: number } | null = null;
   for (const [slot, id] of Object.entries(active)) {
    const profile = profiles.get(id);
    if (!profile) continue;
    const now = developed(profile, season.upgrades, stop);
    const kind: TrainingKind = (HITTER_SLOTS as readonly string[]).includes(slot) ? 'hitting' : 'pitching';
    if (refusal(run, season, seat, profile, kind)) continue;
    const after = train(now, kind, gainScale(run, season, seat, kind));
    const gain = kind === 'hitting'
     ? (woba(after.battingRates!) - woba(now.battingRates!)) * EXPOSURE.hitter
     : (woba(now.pitchingRates!) - woba(after.pitchingRates!)) * ((STARTER_SLOTS as readonly string[]).includes(slot) ? EXPOSURE.starter : EXPOSURE.reliever);
    if (!best || gain > best.gain || (gain === best.gain && id < best.profile.seasonId)) best = { profile, kind, gain };
   }
   if (!best || !(best.gain > 0)) break;
   const intensive = first && stop > 0 && !contending && fresh(best.profile.seasonId) && !refusal(run, season, seat, best.profile, best.kind, true);
   buyTraining(run, season, seat, best.profile, best.kind, intensive);
   first = false;
  }
  if (!contending) continue;
  for (const [id, kind] of [[lineup.starterOrder[0], 'ride'], [active.CL, 'skipRest']] as const) {
   if (fresh(id) && !pushRefusal(run, season, seat, id, kind)) takePush(run, season, seat, id, kind);
  }
 }
}

/** Every position cross-trained this season, in purchase order, as the chapter action carries them. */
export const learnedPositions = (season: LeagueSeason): LearnedPosition[] =>
 season.upgrades.flatMap(upgrade => upgrade.kind === 'crossTraining' && upgrade.position ? [{ cardId: upgrade.cardId, position: upgrade.position }] : []);
