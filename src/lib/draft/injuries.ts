import { randomStream, shuffle } from '../game/random.ts';
import { compareId, type Profile } from '../game/types.ts';
import { LEAGUE_SEGMENTS, SEGMENT_MATCHDAYS, SEGMENTS_PER_CHAPTER } from '../sim/league-types.ts';
import { isCommon, stackFor } from './cleanup.ts';
import type { ClubLineup, LeagueSeason } from './league.ts';
import { canFill } from './rules.ts';
import type { DraftRun } from './run.ts';
import { towardWoba, withBatting, withPitching, woba } from './training.ts';
import type { DraftCard, DraftSlot } from './types.ts';

/**
 * Draft Mode injuries come only from pushes: a club knowingly takes a benefit for the next nine
 * games and accepts a disclosed chance of injury. Each push carries a one-in-eight risk, plus one in
 * sixteen for every earlier push on the same card this chapter. A quarter of injuries are major
 * (out for the next nine games); the rest are minor, and a minor injury sits the card for those
 * games unless the club plays him through it, at reduced strength and the risk of making it major.
 * An injured card's slot goes to the best healthy reserve who can play it, else to an emergency
 * call-up: the top common of the club's own stack for that slot, who leaves when the segment ends.
 * Every number is provisional.
 */
export const PUSH_KINDS = ['intensive', 'ride', 'skipRest', 'playThrough'] as const;
export type PushKind = typeof PUSH_KINDS[number];

/** A push taken at `stop` (segments played), with its risk fixed when it was taken. */
export interface Push { seat: number; cardId: string; kind: PushKind; stop: number; risk: number }
/** An injury that affects segment `segment`. */
export interface Injury { seat: number; cardId: string; segment: number; severity: 'minor' | 'major'; cause: PushKind }

export const BASE_RISK = 1 / 8;
export const ESCALATION = 1 / 16;
export const MAJOR_SHARE = 1 / 4;
/** Share of the gap to replacement level a player playing hurt gives up. */
export const HURT_SHARE = .25;
/** Replacement-level wOBA: the 20th percentile of hitters with 300 PA and pitchers with 200 batters faced. */
export const INJURY_FLOORS = { battingWoba: .2941, pitchingWoba: .3308 } as const;

export const PUSHES: Readonly<Record<PushKind, { name: string; benefit: string }>> = {
 intensive: { name: 'Intensive training', benefit: 'The training gains half as much again' },
 ride: { name: 'Ride the starter', benefit: 'He may pitch two more innings a start before relief' },
 skipRest: { name: 'Skip rest', benefit: 'He is available every game, however much he has pitched' },
 playThrough: { name: 'Play through it', benefit: 'He plays the next nine games at reduced strength instead of sitting' }
};

export class PushError extends Error {}

const chapterOf = (segment: number) => Math.floor(segment / SEGMENTS_PER_CHAPTER);

/** Games `first`-`last` of segment `segment`, numbered from 1. */
export const segmentGames = (segment: number): [number, number] => [segment * SEGMENT_MATCHDAYS + 1, (segment + 1) * SEGMENT_MATCHDAYS];

/** The chance a push on the card taken now would injure him. */
export function pushRisk(season: LeagueSeason, cardId: string): number {
 const chapter = chapterOf(season.segments.length);
 const earlier = season.pushes.filter(push => push.cardId === cardId && chapterOf(push.stop) === chapter).length;
 return Math.min(1, BASE_RISK + ESCALATION * earlier);
}

/** The segment a push's injury would affect: the coming one for training, the one after for pushes that act during play. */
export const injurySegment = (kind: PushKind, stop: number): number => kind === 'intensive' ? stop : stop + 1;

export const injuryAt = (season: LeagueSeason, cardId: string, segment: number): Injury | undefined => season.injuries.find(injury => injury.cardId === cardId && injury.segment === segment);
export const pushAt = (season: LeagueSeason, cardId: string, kind: PushKind, stop: number): Push | undefined => season.pushes.find(push => push.cardId === cardId && push.kind === kind && push.stop === stop);

/** Whether the card plays segment `segment`: fit, hurt (a minor injury played through) or out. */
export function availability(season: LeagueSeason, cardId: string, segment: number): 'fit' | 'hurt' | 'out' {
 const injury = injuryAt(season, cardId, segment);
 if (!injury) return 'fit';
 return injury.severity === 'minor' && pushAt(season, cardId, 'playThrough', segment) ? 'hurt' : 'out';
}

/** The card playing hurt: its batting and pitching each give up `HURT_SHARE` of the gap to replacement level. Upgrades are untouched. */
export function hurt(profile: Profile): Profile {
 let next = profile;
 const bat = next.battingRates;
 if (bat) next = withBatting(next, towardWoba(bat, woba(bat) + HURT_SHARE * (INJURY_FLOORS.battingWoba - woba(bat)), 'down'));
 const pitch = next.pitchingRates;
 if (pitch) next = withPitching(next, towardWoba(pitch, woba(pitch) + HURT_SHARE * (INJURY_FLOORS.pitchingWoba - woba(pitch)), 'up'));
 return next;
}

const slotOf = (lineup: ClubLineup, cardId: string): DraftSlot | undefined => (Object.entries(lineup.active) as [DraftSlot, string][]).find(([, id]) => id === cardId)?.[0];
const onRoster = (lineup: ClubLineup, cardId: string) => !!slotOf(lineup, cardId) || lineup.reserves.includes(cardId);
const isStarterSlot = (slot: DraftSlot | undefined) => slot === 'SP1' || slot === 'SP2' || slot === 'SP3';

/** Why `seat` cannot take the push on the card now, or null when it can. */
export function pushRefusal(run: DraftRun, season: LeagueSeason, seat: number, cardId: string, kind: PushKind): string | null {
 const stop = season.segments.length;
 if (stop >= LEAGUE_SEGMENTS) return 'The season is over';
 if (run.phase !== 'season') return 'Finish the chapter market first';
 const lineup = season.lineups[seat];
 if (!onRoster(lineup, cardId)) return 'He is not on this roster';
 if (pushAt(season, cardId, kind, stop)) return `${PUSHES[kind].name} is already on for him`;
 const slot = slotOf(lineup, cardId);
 if (kind === 'playThrough') {
  if (injuryAt(season, cardId, stop)?.severity !== 'minor') return 'Only a minor injury can be played through';
  return slot ? null : 'Only an active player can play through an injury';
 }
 if (injuryAt(season, cardId, stop)) return 'He is injured';
 if (kind === 'ride' && !isStarterSlot(slot)) return 'Only an active starter can be ridden';
 if (kind === 'skipRest') {
  const role = lineup.reliefRoles.find(item => item.slot === slot);
  if (!role || (role.primary !== 'closer' && role.primary !== 'setup')) return 'Only a closer or setup man can skip rest';
 }
 return null;
}

/** Rolls a push's injury from the run seed, or null when he comes through it. */
function roll(seed: number, push: Push): Injury | null {
 const random = randomStream(seed, `draft:injury:${push.stop}:${push.seat}:${push.cardId}:${push.kind}`);
 if (!(random() < push.risk)) return null;
 const segment = injurySegment(push.kind, push.stop);
 if (segment >= LEAGUE_SEGMENTS) return null;
 // Aggravating an injury always makes it major.
 const severity = push.kind === 'playThrough' || random() < MAJOR_SHARE ? 'major' : 'minor';
 return { seat: push.seat, cardId: push.cardId, segment, severity, cause: push.kind };
}

function addInjury(season: LeagueSeason, injury: Injury): void {
 const existing = injuryAt(season, injury.cardId, injury.segment);
 if (!existing) season.injuries.push(injury);
 else if (injury.severity === 'major') Object.assign(existing, injury);
}

/** Takes a push for `seat`; intensive training rolls at once and returns its injury. Throws `PushError` with the reason when it cannot. */
export function takePush(run: DraftRun, season: LeagueSeason, seat: number, cardId: string, kind: PushKind): Injury | null {
 const reason = pushRefusal(run, season, seat, cardId, kind);
 if (reason) throw new PushError(reason);
 const push: Push = { seat, cardId, kind, stop: season.segments.length, risk: pushRisk(season, cardId) };
 season.pushes.push(push);
 if (kind !== 'intensive') return null;
 const injury = roll(run.setup.seed, push);
 if (injury) addInjury(season, injury);
 return injury;
}

/** Calls off a push taken at this stop before the games; intensive training is already done. */
export function dropPush(season: LeagueSeason, seat: number, cardId: string, kind: PushKind): void {
 if (kind === 'intensive') throw new PushError('Intensive training cannot be undone');
 const index = season.pushes.findIndex(push => push.seat === seat && push.cardId === cardId && push.kind === kind && push.stop === season.segments.length);
 if (index < 0) throw new PushError('That push is not on');
 season.pushes.splice(index, 1);
}

/** Rolls every push that acted during segment `segment` once it has been played. */
export function resolvePushes(run: DraftRun, season: LeagueSeason, segment: number): void {
 for (const push of season.pushes) {
  if (push.stop !== segment || push.kind === 'intensive') continue;
  const injury = roll(run.setup.seed, push);
  if (injury) addInjury(season, injury);
 }
}

/** One slot the club fills for an injured card: a reserve, or an emergency call-up from outside the roster. */
export interface Substitution { slot: DraftSlot; out: string; in: string; callUp: boolean }

/** The top common of `seat`'s emergency stack for the slot: unowned commons who can play it, in the seat's seeded order. */
function callUp(run: DraftRun, seat: number, slot: DraftSlot, used: ReadonlySet<string>): DraftCard {
 const { minYear, maxYear } = run.pool.rules;
 const candidates = [...run.pool.ledger.cards.values()]
  .filter(card => isCommon(card, run.pool.rules) && card.year >= minYear && card.year <= maxYear && !run.pool.ledger.instances.has(card.seasonId) && !used.has(card.seasonId) && canFill(card, slot))
  .sort((a, b) => compareId(a.seasonId, b.seasonId));
 const card = shuffle(candidates, randomStream(run.setup.seed, `draft:callup:${seat}:${stackFor(slot)}`))[0];
 if (!card) throw new Error(`No emergency call-up can play ${slot}`);
 return card;
}

/**
 * The lineup `seat` fields in segment `segment`: each card out for the segment, plus `extraOut`
 * when asking who would replace him, gives his slot to the most valuable healthy reserve who can
 * play it, else to an emergency call-up; the replacement takes his batting or rotation spot.
 */
export function fieldedLineup(run: DraftRun, season: LeagueSeason, seat: number, segment: number, extraOut?: string): { lineup: ClubLineup; substitutions: Substitution[] } {
 const base = season.lineups[seat];
 const lineup = structuredClone(base);
 const card = (id: string) => run.pool.ledger.cards.get(id)!;
 const out = (id: string) => id === extraOut || availability(season, id, segment) === 'out';
 const used = new Set([...Object.values(base.active), ...base.reserves]);
 const taken = new Set<string>();
 const substitutions: Substitution[] = [];
 for (const slot of run.pool.rules.activeSlots) {
  const id = base.active[slot];
  if (!out(id)) continue;
  const reserve = base.reserves
   .filter(other => !taken.has(other) && !out(other) && canFill(card(other), slot))
   .sort((a, b) => card(b).valueRuns - card(a).valueRuns || compareId(a, b))[0];
  const replacement = reserve ?? callUp(run, seat, slot, used).seasonId;
  taken.add(replacement);
  used.add(replacement);
  lineup.active[slot] = replacement;
  if (reserve) lineup.reserves = lineup.reserves.map(other => other === reserve ? id : other);
  lineup.battingOrder = lineup.battingOrder.map(other => other === id ? replacement : other);
  lineup.starterOrder = lineup.starterOrder.map(other => other === id ? replacement : other);
  substitutions.push({ slot, out: id, in: replacement, callUp: !reserve });
 }
 return { lineup, substitutions };
}

/** The pushes `seat` could take on its active pitchers now: ride each starter, skip rest for each closer and setup man. */
export function pushCandidates(season: LeagueSeason, seat: number): { cardId: string; kind: 'ride' | 'skipRest' }[] {
 const lineup = season.lineups[seat];
 const starters = (['SP1', 'SP2', 'SP3'] as const).map(slot => ({ cardId: lineup.active[slot], kind: 'ride' as const }));
 const relievers = lineup.reliefRoles.filter(role => role.primary === 'closer' || role.primary === 'setup').map(role => ({ cardId: lineup.active[role.slot], kind: 'skipRest' as const }));
 return [...starters, ...relievers];
}

/** Who would take each push candidate's slot if the push injured him for the following segment. */
export function pushBackups(run: DraftRun, season: LeagueSeason, seat: number): Map<string, Substitution> {
 const next = Math.min(season.segments.length + 1, LEAGUE_SEGMENTS - 1);
 return new Map(pushCandidates(season, seat).map(({ cardId }) => [cardId, fieldedLineup(run, season, seat, next, cardId).substitutions.find(item => item.out === cardId)!]));
}

/** The chance a push taken now injures the card; nothing carries past the last game. */
export const pushChance = (season: LeagueSeason, cardId: string, kind: PushKind): number =>
 injurySegment(kind, season.segments.length) >= LEAGUE_SEGMENTS ? 0 : pushRisk(season, cardId);
