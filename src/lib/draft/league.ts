import { compareId, HITTER_SLOTS, MODEL_VERSION, RULES_VERSION, STARTER_SLOTS, validateReliefRoles, type Profile, type ReliefAssignment, type SimulationData } from '../game/types.ts';
import { randomStream, shuffle } from '../game/random.ts';
import { stadiumRef } from '../sim/park.ts';
import { LEAGUE_SEGMENTS, SEGMENTS_PER_CHAPTER, type Crowd, type Fixture, type LeagueGame, type LeagueSegmentInput, type LeagueSegmentResult, type RestState } from '../sim/league-types.ts';
import type { ScheduledGame } from '../game/season-calendar.ts';
import type { BatterLine, PitcherLine } from '../sim/types.ts';
import { afterSegment, crowd, EXPECTATION_RANGE, openingFans, payday, paydayTotal, priors, type FanState, type Payday } from './fans.ts';
import { segmentDecree } from './decrees.ts';
import { availability, fieldedLineup, hurt, resolvePushes, type Injury, type Push } from './injuries.ts';
import { RIVALS } from './franchises.ts';
import { franchisePackage } from './packages.ts';
import { developed, type Upgrade } from './training.ts';
import { canFill, DEFAULT_DRAFT_RELIEF_ROLES, DRAFT_BULLPEN_SLOTS, type DraftBullpenSlot } from './rules.ts';
import type { DraftRun } from './run.ts';
import type { DraftCard, DraftSlot, Submission } from './types.ts';

/** League season format: rival matching, AI lineups, fans, cash and the stored segment record. */
export const LEAGUE_VERSION = 'league-v8' as const;

/**
 * A club's lineup for the next segment. The cards are the club's submitted roster; at each stop
 * only their places change: who fields which slot, who sits in reserve, the batting and rotation
 * orders and the relief roles.
 */
export interface ClubLineup {
 active: Record<DraftSlot, string>;
 reserves: string[];
 battingOrder: string[];
 starterOrder: string[];
 reliefRoles: ReliefAssignment<DraftBullpenSlot>[];
}

/**
 * One played segment as the device keeps it: compact games, each club's lines, the rest carried
 * forward, and each club's home crowd and payday.
 */
export interface SegmentRecord {
 games: LeagueGame[];
 lines: { batting: BatterLine[]; pitching: PitcherLine[] }[];
 carry: RestState[][];
 crowds: Crowd[];
 paydays: Payday[];
}

export interface LeagueSeason {
 version: typeof LEAGUE_VERSION;
 /** Four seat pairs; the player's pair is the player and the guaranteed rival. */
 rivals: [number, number][];
 lineups: ClubLineup[];
 segments: SegmentRecord[];
 /** Each club's fans going into the next segment. */
 fans: FanState[];
 /** Each club's banked cash: every payday credited, less what it has spent. */
 cash: number[];
 /** Every training bought this season, in purchase order; each stays with its card. */
 upgrades: Upgrade[];
 /** The last stop at which AI clubs shopped, so they shop once per stop; -1 before the first. */
 aiShopped: number;
 /** Every push taken this season, in order. */
 pushes: Push[];
 /** Every injury, by the segment it affects. */
 injuries: Injury[];
}

export class LineupError extends Error {}

const HITTER_ROWS = HITTER_SLOTS as readonly DraftSlot[];
const STARTER_ROWS = STARTER_SLOTS as readonly DraftSlot[];

/**
 * Pairs the eight seats as rivals: the player with the guaranteed rival (or a seeded seat when the
 * franchise has none), then known rivalries among the rest in seeded order, then seeded pairs.
 */
export function matchRivals(run: DraftRun): [number, number][] {
 const { seats, humanSeat, rival } = run.seating;
 const random = randomStream(run.setup.seed, 'draft:league:rivals');
 const open = shuffle(seats.map((_, seat) => seat).filter(seat => seat !== humanSeat), random);
 const take = (seat: number) => open.splice(open.indexOf(seat), 1)[0];
 const pairs: [number, number][] = [[humanSeat, take(rival === null ? open[0] : seats.indexOf(rival))]];
 for (const seat of [...open]) {
  if (!open.includes(seat)) continue;
  const partner = open.find(other => other !== seat && (RIVALS[seats[seat]] ?? []).includes(seats[other]));
  if (partner !== undefined) pairs.push([take(seat), take(partner)]);
 }
 while (open.length) pairs.push([take(open[0]), take(open[0])]);
 return pairs;
}

/** An AI club's lineup: hitters and starters by modeled value, relief roles at the slot defaults. */
export function defaultLineup(submission: Submission, card: (id: string) => DraftCard): ClubLineup {
 const active = submission.active as Record<DraftSlot, string>;
 const byValue = (ids: string[]) => ids.sort((a, b) => card(b).valueRuns - card(a).valueRuns || compareId(a, b));
 return {
  active: { ...active }, reserves: [...submission.reserves],
  battingOrder: byValue(HITTER_ROWS.map(slot => active[slot])),
  starterOrder: byValue(STARTER_ROWS.map(slot => active[slot])),
  reliefRoles: DEFAULT_DRAFT_RELIEF_ROLES.map(role => ({ ...role }))
 };
}

/**
 * Opens the season once every seat has submitted: the player with the lineup they submitted, AI
 * clubs with defaults, and every club's fans expecting what its active payroll promises.
 */
export function startLeague(run: DraftRun): LeagueSeason {
 if (run.phase !== 'season' || !run.lineup || run.submissions.some(submission => submission === null)) throw new Error('The league starts once every club has submitted');
 const card = (id: string) => run.pool.ledger.cards.get(id)!;
 const human = run.seating.humanSeat;
 const lineups = run.submissions.map((submission, seat) => seat === human ? structuredClone(run.lineup!) : defaultLineup(submission!, card));
 const payrolls = lineups.map(lineup => activePayroll(run, lineup));
 return {
  version: LEAGUE_VERSION, rivals: matchRivals(run), lineups, segments: [],
  fans: priors(run.seating.seats, payrolls).map(openingFans),
  cash: lineups.map(() => 0), upgrades: [], aiShopped: -1, pushes: [], injuries: []
 };
}

/** A lineup's active payroll at signed salaries: the visible measure fans judge a roster by. */
const activePayroll = (run: DraftRun, lineup: ClubLineup): number => Object.values(lineup.active).reduce((sum, id) => sum + run.pool.ledger.instances.get(id)!.startingSalary, 0);

/**
 * Carries a closed chapter market into the season: the player's submitted lineup, AI clubs'
 * default lineups for their new rosters, and each club's fan expectation moved by as much as its
 * payroll-based prior moved.
 */
export function closeChapter(run: DraftRun, season: LeagueSeason): void {
 if (run.phase !== 'season' || !run.lineup) throw new Error('A chapter closes when the player submits');
 const card = (id: string) => run.pool.ledger.cards.get(id)!;
 const human = run.seating.humanSeat;
 season.lineups = run.submissions.map((submission, seat) => seat === human ? structuredClone(run.lineup!) : defaultLineup(submission!, card));
 const next = priors(run.seating.seats, season.lineups.map(lineup => activePayroll(run, lineup)));
 season.fans = season.fans.map((fans, seat) => ({ ...fans, prior: next[seat], expectation: Math.min(EXPECTATION_RANGE[1], Math.max(EXPECTATION_RANGE[0], Math.round((fans.expectation + next[seat] - fans.prior) * 1e4) / 1e4)) }));
}

/** Where the season stands: segments played, and whether the stop after the last one closes a chapter. */
export function seasonStop(season: LeagueSeason): { played: number; chapter: number; chapterStop: boolean; over: boolean } {
 const played = season.segments.length;
 return { played, chapter: Math.floor(played / SEGMENTS_PER_CHAPTER), chapterStop: played > 0 && played % SEGMENTS_PER_CHAPTER === 0, over: played >= LEAGUE_SEGMENTS };
}

/** Checks a lineup against the seat's submitted cards; throws `LineupError` naming the first problem. */
export function validateLineup(run: DraftRun, seat: number, lineup: ClubLineup): void {
 const submission = run.submissions[seat];
 if (!submission) throw new LineupError('This club has no roster yet');
 checkLineup(submission, id => run.pool.ledger.cards.get(id)!, run.pool.rules.activeSlots, lineup);
}

/** Checks that `lineup` places exactly the submission's cards, each where it can play, with complete orders and roles. */
export function checkLineup(submission: Submission, card: (id: string) => DraftCard, slots: readonly DraftSlot[], lineup: ClubLineup): void {
 const owned = [...Object.values(submission.active), ...submission.reserves].sort(compareId);
 const listed = [...Object.values(lineup.active), ...lineup.reserves].sort(compareId);
 if (Object.keys(lineup.active).length !== slots.length || slots.some(slot => !lineup.active[slot]) || listed.join() !== owned.join()) {
  throw new LineupError('A lineup uses exactly the club\'s cards, one per slot');
 }
 for (const slot of slots) {
  const item = card(lineup.active[slot]);
  if (!canFill(item, slot)) throw new LineupError(`${item.seasonId} cannot play ${slot}`);
 }
 const same = (order: string[], rows: readonly DraftSlot[]) => Array.isArray(order) && order.length === rows.length && [...order].sort(compareId).join() === rows.map(slot => lineup.active[slot]).sort(compareId).join();
 if (!same(lineup.battingOrder, HITTER_ROWS)) throw new LineupError('The batting order lists the nine active hitters once each');
 if (!same(lineup.starterOrder, STARTER_ROWS)) throw new LineupError('The rotation lists the three starters once each');
 try { validateReliefRoles(lineup.reliefRoles, true, DRAFT_BULLPEN_SLOTS); }
 catch { throw new LineupError('Every bullpen arm needs a role, and a backup role may not repeat it'); }
}

/** A lineup place: an active slot, or a reserve by index. */
export type Place = DraftSlot | number;

const cardAt = (lineup: ClubLineup, place: Place): string => typeof place === 'number' ? lineup.reserves[place] : lineup.active[place];

/**
 * The lineup with the cards at two places exchanged. A card coming off the reserve list takes the
 * batting or rotation spot of the card it replaces; active cards that trade slots keep theirs.
 */
export function swapPlaces(lineup: ClubLineup, a: Place, b: Place): ClubLineup {
 const next = structuredClone(lineup);
 const first = cardAt(lineup, a);
 const second = cardAt(lineup, b);
 const put = (place: Place, id: string) => { if (typeof place === 'number') next.reserves[place] = id; else next.active[place] = id; };
 put(a, second);
 put(b, first);
 const before = new Set(Object.values(lineup.active));
 const after = new Set(Object.values(next.active));
 const entering = [...after].find(id => !before.has(id));
 const leaving = [...before].find(id => !after.has(id));
 if (entering && leaving) {
  next.battingOrder = next.battingOrder.map(id => id === leaving ? entering : id);
  next.starterOrder = next.starterOrder.map(id => id === leaving ? entering : id);
 }
 return next;
}

/** Whether the cards at `a` and `b` can trade places: each must be able to play the other's slot. */
export function canSwap(run: DraftRun, lineup: ClubLineup, a: Place, b: Place): boolean {
 if (a === b) return false;
 const card = (place: Place) => run.pool.ledger.cards.get(cardAt(lineup, place))!;
 const fitsPlace = (item: DraftCard, place: Place) => typeof place === 'number' || canFill(item, place);
 return fitsPlace(card(a), b) && fitsPlace(card(b), a);
}

/** Sets the player's lineup for the next segment. */
export function setLineup(run: DraftRun, season: LeagueSeason, lineup: ClubLineup): void {
 if (season.segments.length >= LEAGUE_SEGMENTS) throw new LineupError('The season is over');
 validateLineup(run, run.seating.humanSeat, lineup);
 season.lineups[run.seating.humanSeat] = structuredClone(lineup);
}

/** Each club's home crowd for the next segment, from its fans now. */
export const seasonCrowds = (run: DraftRun, season: LeagueSeason): Crowd[] => season.fans.map((fans, seat) => crowd(run.seating.seats[seat], fans));

/** Every card the clubs field in the next segment: active cards, with reserves and call-ups in for the injured. */
export const fieldedIds = (run: DraftRun, season: LeagueSeason): string[] =>
 season.lineups.flatMap((_, seat) => Object.values(fieldedLineup(run, season, seat, season.segments.length).lineup.active));

/**
 * The engine input for the next segment. `profiles` must hold every fielded card's printed
 * profile (`fieldedIds`); each plays with the training in force, and at reduced strength when
 * playing through an injury. Pushes taken at this stop ride starters and rest-skipping relievers.
 * `names` labels each seat's club, and each club plays in its franchise's park before its own crowd.
 */
export function segmentInput(run: DraftRun, season: LeagueSeason, profiles: ReadonlyMap<string, Profile>, data: SimulationData, names: readonly string[]): LeagueSegmentInput {
 const segment = season.segments.length;
 if (segment >= LEAGUE_SEGMENTS) throw new Error('The season is over');
 return {
  modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, seed: run.setup.seed, data, segment, crowds: seasonCrowds(run, season),
  rivals: season.rivals, carry: season.segments.at(-1)?.carry ?? [], detailClub: run.seating.humanSeat, rules: { ...segmentDecree(run.setup.seed, segment).rules },
  clubs: season.lineups.map((_, seat) => {
   const { lineup } = fieldedLineup(run, season, seat, segment);
   const franchiseId = run.seating.seats[seat];
   const pushed = (kind: Push['kind'], slots: (slot: string) => boolean) => Object.entries(lineup.active)
    .filter(([slot, id]) => slots(slot) && season.pushes.some(push => push.seat === seat && push.cardId === id && push.kind === kind && push.stop === segment))
    .map(([, id]) => id).sort();
   const stadium = data.stadiums.find(item => item.franchiseId === franchiseId);
   if (!stadium) throw new Error(`No home park for ${franchiseId}`);
   return {
    id: franchiseId, name: names[seat], homeStadium: stadiumRef(stadium),
    roster: run.pool.rules.activeSlots.map(slot => {
     const profile = profiles.get(lineup.active[slot]);
     if (!profile) throw new Error(`Missing profile ${lineup.active[slot]}`);
     const trained = developed(profile, season.upgrades, segment);
     return { profile: availability(season, profile.seasonId, segment) === 'hurt' ? hurt(trained) : trained, slot };
    }),
    battingOrder: [...lineup.battingOrder], starterOrder: [...lineup.starterOrder], reliefRoles: lineup.reliefRoles.map(role => ({ ...role })),
    quickRecovery: Object.values(lineup.active).filter(id => season.upgrades.some(upgrade => upgrade.cardId === id && upgrade.kind === 'recovery')).sort(),
    ridden: pushed('ride', slot => slot.startsWith('SP')), tireless: pushed('skipRest', slot => slot === 'CL' || slot.startsWith('RP')),
    parkPackage: franchisePackage(franchiseId)?.park ?? null
   };
  })
 };
}

/**
 * Keeps a played segment, in segment order: credits each club's payday from the crowd that watched
 * it, then moves its fans on the results. Each payday is credited once, with the segment it pays for.
 */
export function recordSegment(run: DraftRun, season: LeagueSeason, result: LeagueSegmentResult): void {
 if (result.segment !== season.segments.length) throw new Error(`Expected segment ${season.segments.length + 1}, got ${result.segment + 1}`);
 const franchises = run.seating.seats;
 const crowds = seasonCrowds(run, season);
 const paydays = season.fans.map((fans, seat) => payday(seat, franchises, fans, result.games));
 season.segments.push({ games: result.games, lines: result.totals.map(box => ({ batting: box.batting, pitching: box.pitching })), carry: result.carry, crowds, paydays });
 const records = standings(season);
 season.fans = season.fans.map((fans, seat) => {
  const row = records.find(item => item.seat === seat)!;
  return afterSegment(seat, franchises, fans, result.games, { wins: row.wins, games: row.wins + row.losses });
 });
 season.cash = season.cash.map((cash, seat) => cash + paydayTotal(paydays[seat]));
 resolvePushes(run, season, result.segment);
}

export interface Standing { seat: number; wins: number; losses: number; runsFor: number; runsAgainst: number; gamesBack: number }

/**
 * Standings by winning percentage, then run differential, then seat. Games back counts from the leader.
 */
export function standings(season: LeagueSeason): Standing[] {
 const rows: Standing[] = season.lineups.map((_, seat) => ({ seat, wins: 0, losses: 0, runsFor: 0, runsAgainst: 0, gamesBack: 0 }));
 for (const game of season.segments.flatMap(segment => segment.games)) {
  const home = rows[game.home];
  const away = rows[game.away];
  home.runsFor += game.homeRuns; home.runsAgainst += game.awayRuns;
  away.runsFor += game.awayRuns; away.runsAgainst += game.homeRuns;
  if (game.homeRuns > game.awayRuns) { home.wins++; away.losses++; } else { away.wins++; home.losses++; }
 }
 const pct = (row: Standing) => row.wins + row.losses ? row.wins / (row.wins + row.losses) : 0;
 rows.sort((a, b) => pct(b) - pct(a) || (b.runsFor - b.runsAgainst) - (a.runsFor - a.runsAgainst) || a.seat - b.seat);
 const leader = rows[0];
 for (const row of rows) row.gamesBack = ((leader.wins - row.wins) + (row.losses - leader.losses)) / 2;
 return rows;
}

/**
 * `seat`'s 162 games in schedule order, numbered from 1, with results for the segments played.
 * Unplayed games carry no runs and are not wins.
 */
export function clubSchedule(run: DraftRun, season: LeagueSeason, schedule: readonly (readonly Fixture[])[], seat: number, clubName: (seat: number) => string): ScheduledGame[] {
 const played = new Map(season.segments.flatMap(segment => segment.games).filter(game => game.home === seat || game.away === seat).map(game => [game.matchday, game]));
 return schedule.map((day, matchday) => {
  const fixture = day.find(item => item.home === seat || item.away === seat);
  if (!fixture) throw new Error(`Club ${seat} has no game on matchday ${matchday + 1}`);
  const isHome = fixture.home === seat;
  const opponent = isHome ? fixture.away : fixture.home;
  const game = played.get(matchday);
  const challengeRuns = game ? (isHome ? game.homeRuns : game.awayRuns) : 0;
  const opponentRuns = game ? (isHome ? game.awayRuns : game.homeRuns) : 0;
  return { number: matchday + 1, opponentId: run.seating.seats[opponent], opponentName: clubName(opponent), isHome, win: !!game && challengeRuns > opponentRuns, challengeRuns, opponentRuns };
 });
}

/** Head-to-head record of `seat` against `opponent` so far. */
export function headToHead(season: LeagueSeason, seat: number, opponent: number): { wins: number; losses: number } {
 let wins = 0;
 let losses = 0;
 for (const game of season.segments.flatMap(segment => segment.games)) {
  if (!((game.home === seat && game.away === opponent) || (game.home === opponent && game.away === seat))) continue;
  const won = game.home === seat ? game.homeRuns > game.awayRuns : game.awayRuns > game.homeRuns;
  if (won) wins++; else losses++;
 }
 return { wins, losses };
}

const sumInto = <T extends object>(target: T, source: T): void => {
 for (const [key, value] of Object.entries(source)) {
  const record = target as Record<string, unknown>;
  if (typeof value === 'number' && key !== 'year') record[key] = (record[key] as number) + value;
  else if (value && typeof value === 'object') sumInto(record[key] as object, value as object);
 }
};

/** A club's season lines so far, one per card, summed over segments in first-appearance order. */
export function seasonLines(season: LeagueSeason, seat: number): { batting: BatterLine[]; pitching: PitcherLine[] } {
 const batting = new Map<string, BatterLine>();
 const pitching = new Map<string, PitcherLine>();
 for (const segment of season.segments) {
  const lines = segment.lines[seat];
  for (const line of lines.batting) {
   const total = batting.get(line.seasonId);
   if (total) sumInto(total, line); else batting.set(line.seasonId, structuredClone(line));
  }
  for (const line of lines.pitching) {
   const total = pitching.get(line.seasonId);
   if (total) sumInto(total, line); else pitching.set(line.seasonId, structuredClone(line));
  }
 }
 return { batting: [...batting.values()], pitching: [...pitching.values()] };
}
