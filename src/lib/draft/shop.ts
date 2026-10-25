import { randomStream, shuffle } from '../game/random.ts';
import { HITTER_SLOTS, STARTER_SLOTS, type Profile } from '../game/types.ts';
import { LEAGUE_SEGMENTS } from '../sim/league-types.ts';
import type { LeagueSeason } from './league.ts';
import type { DraftRun } from './run.ts';
import { BASIC_KINDS, canTrain, developed, SPECIAL_KINDS, train, TRAININGS, woba, type SpecialKind, type TrainingKind, type Upgrade } from './training.ts';

/**
 * The training shop at every season stop: the four basics and two specials drawn for that stop,
 * the same for every club. A club may buy one training per card per visit with its banked cash.
 */
export const SPECIALS_PER_VISIT = 2;

export class ShopError extends Error {}

/** The specials on offer at stop `stop` (segments played), seeded and different from stop to stop. */
export function specialsAt(seed: number, stop: number): SpecialKind[] {
 return shuffle([...SPECIAL_KINDS], randomStream(seed, `draft:shop:${stop}`)).slice(0, SPECIALS_PER_VISIT);
}

export const offersAt = (seed: number, stop: number): TrainingKind[] => [...BASIC_KINDS, ...specialsAt(seed, stop)];

/** A seat's season cards: its active lineup and reserves. */
export const seasonRoster = (season: LeagueSeason, seat: number): string[] => [...Object.values(season.lineups[seat].active), ...season.lineups[seat].reserves];

/** Whether `cardId` has already been trained at this visit. */
export const trainedThisVisit = (season: LeagueSeason, cardId: string): boolean => season.upgrades.some(upgrade => upgrade.cardId === cardId && upgrade.stop === season.segments.length);

/** Why `seat` cannot buy `kind` for the card now, or null when it can. `profile` is the card's printed profile. */
export function refusal(run: DraftRun, season: LeagueSeason, seat: number, profile: Profile, kind: TrainingKind): string | null {
 const stop = season.segments.length;
 if (stop >= LEAGUE_SEGMENTS) return 'The season is over';
 if (!offersAt(run.setup.seed, stop).includes(kind)) return `${TRAININGS[kind].name} is not on offer at this stop`;
 if (!seasonRoster(season, seat).includes(profile.seasonId)) return `${profile.displayName} is not on this roster`;
 if (trainedThisVisit(season, profile.seasonId)) return `${profile.displayName} has already trained at this stop`;
 if (!canTrain(developed(profile, season.upgrades, stop), kind, season.upgrades)) return `${TRAININGS[kind].name} does not apply to ${profile.displayName}`;
 if (season.cash[seat] < TRAININGS[kind].price) return 'Not enough cash';
 return null;
}

/** Buys `kind` for the card, paid by `seat`; throws `ShopError` with the reason when it cannot. */
export function buyTraining(run: DraftRun, season: LeagueSeason, seat: number, profile: Profile, kind: TrainingKind): Upgrade {
 const reason = refusal(run, season, seat, profile, kind);
 if (reason) throw new ShopError(reason);
 const upgrade: Upgrade = { cardId: profile.seasonId, kind, stop: season.segments.length, paidBy: seat, cost: TRAININGS[kind].price };
 season.upgrades.push(upgrade);
 season.cash[seat] -= upgrade.cost;
 return upgrade;
}

/** Plate appearances or batters faced a season, by role, so a gain in wOBA compares across roles. */
const EXPOSURE = { hitter: 650, starter: 700, reliever: 280 } as const;

/**
 * AI clubs shop once a stop, before the next games: while cash allows, each buys the basic
 * hitting or pitching training with the largest expected gain over its active cards, one per
 * card. AI clubs ignore specials, fielding and baserunning.
 */
export function aiShop(run: DraftRun, season: LeagueSeason, profiles: ReadonlyMap<string, Profile>): void {
 const stop = season.segments.length;
 if (stop >= LEAGUE_SEGMENTS || season.aiShopped >= stop) return;
 season.aiShopped = stop;
 for (let seat = 0; seat < season.lineups.length; seat++) {
  if (seat === run.seating.humanSeat) continue;
  const active = season.lineups[seat].active;
  for (;;) {
   let best: { profile: Profile; kind: TrainingKind; gain: number } | null = null;
   for (const [slot, id] of Object.entries(active)) {
    const profile = profiles.get(id);
    if (!profile) continue;
    const now = developed(profile, season.upgrades, stop);
    const kind: TrainingKind = (HITTER_SLOTS as readonly string[]).includes(slot) ? 'hitting' : 'pitching';
    if (refusal(run, season, seat, profile, kind)) continue;
    const after = train(now, kind);
    const gain = kind === 'hitting'
     ? (woba(after.battingRates!) - woba(now.battingRates!)) * EXPOSURE.hitter
     : (woba(now.pitchingRates!) - woba(after.pitchingRates!)) * ((STARTER_SLOTS as readonly string[]).includes(slot) ? EXPOSURE.starter : EXPOSURE.reliever);
    if (!best || gain > best.gain || (gain === best.gain && id < best.profile.seasonId)) best = { profile, kind, gain };
   }
   if (!best || !(best.gain > 0)) break;
   buyTraining(run, season, seat, best.profile, best.kind);
  }
 }
}
