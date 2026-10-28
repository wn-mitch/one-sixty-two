import type { LineupMove, LineupView } from '../game/lineup-view.ts';
import { HITTER_SLOTS, type Profile } from '../game/types.ts';
import { innings } from '../game/format.ts';
import type { BatterLine, PitcherLine } from '../sim/types.ts';
import { canSwap, type LeagueSeason, type Place } from './league.ts';
import { DRAFT_BULLPEN_SLOTS, canFill, rosterSize } from './rules.ts';
import { movesFor, ownedBy, placementOf, windowLineup, windowReport, type DraftRun } from './run.ts';
import type { DraftSlot, LegalityFailure } from './types.ts';
import { money } from '../components/draft-mode/format.ts';

/** `onMove`'s key for the bench in the opening window. */
export const BENCH = 'bench';

/** A slot as a card's position menu shows it: a position it learned by cross-training with a +. */
const slotFor = (run: DraftRun, seasonId: string, slot: DraftSlot): string => run.pool.ledger.cards.get(seasonId)?.learned?.some(learned => learned === slot) ? `${slot}+` : slot;

/**
 * The opening window's lineup: the field as placed, the bench beneath it, and the saved orders.
 * It is complete once the roster is legal, full, and every card has loaded.
 */
export function windowLineupView(run: DraftRun, profiles: ReadonlyMap<string, Profile>): LineupView {
 const lineup = windowLineup(run);
 const human = run.seating.humanSeat;
 const owned = ownedBy(run, human);
 const loaded = owned.every(card => profiles.has(card.seasonId));
 const report = windowReport(run, { seat: human, active: lineup.active, reserves: lineup.reserves });
 const name = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
 const { reserves } = run.pool.rules;
 return {
  slots: new Map(Object.entries(lineup.active).map(([slot, id]) => [id!, slot as DraftSlot])),
  battingOrder: lineup.battingOrder,
  starterOrder: lineup.starterOrder,
  bullpen: DRAFT_BULLPEN_SLOTS.map(slot => ({ slot, seasonId: lineup.active[slot] ?? null })),
  reliefRoles: lineup.reliefRoles,
  reserves: { heading: `Bench · ${reserves} reserve${reserves === 1 ? '' : 's'}`, ids: lineup.reserves },
  ready: loaded,
  complete: loaded && report.legal && owned.length === rosterSize(run.pool.rules),
  incomplete: '',
  places(seasonId) {
   const from = placementOf(run, seasonId);
   const current = from ?? BENCH;
   const options: LineupMove[] = movesFor(run, seasonId).map(({ slot, swapWith }) => {
    if (slot === null) return { key: BENCH, label: 'Bench', available: true, announce: `${name(seasonId)} to the bench.` };
    if (!swapWith) return { key: slot, label: `${slotFor(run, seasonId, slot)} · open`, available: true, announce: `${name(seasonId)} to ${slot}.` };
    const back = from !== null && canFill(run.pool.ledger.cards.get(swapWith)!, from) ? from : 'the bench';
    return { key: slot, label: `${slotFor(run, seasonId, slot)} · ${name(swapWith)} to ${back === 'the bench' ? 'bench' : back}`, available: true, announce: `${name(seasonId)} to ${slot}; ${name(swapWith)} to ${back}.` };
   });
   return { current, options: [{ key: current, label: from === null ? 'Bench' : slotFor(run, seasonId, from), available: false, announce: '' }, ...options] };
  }
 };
}

const placeKey = (place: Place) => typeof place === 'number' ? `R${place}` : place;
/** The lineup place named by a season `onMove` key. */
export const placeFromKey = (key: string): Place => /^R\d+$/.test(key) ? Number(key.slice(1)) : key as DraftSlot;
const placeLabel = (place: Place) => typeof place === 'number' ? `Reserve ${place + 1}` : place;

/** A chapter stop's lineup: the club's cards trade places among the active slots and the reserves. */
export function seasonLineupView(run: DraftRun, season: LeagueSeason, profiles: ReadonlyMap<string, Profile>): LineupView {
 const lineup = season.lineups[run.seating.humanSeat];
 const name = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
 const cardAt = (place: Place) => typeof place === 'number' ? lineup.reserves[place] : lineup.active[place];
 const all: Place[] = [...run.pool.rules.activeSlots, ...lineup.reserves.map((_, index) => index)];
 const listed = [...Object.values(lineup.active), ...lineup.reserves];
 const loaded = listed.every(id => profiles.has(id));
 return {
  slots: new Map(Object.entries(lineup.active).map(([slot, id]) => [id, slot as DraftSlot])),
  battingOrder: lineup.battingOrder,
  starterOrder: lineup.starterOrder,
  bullpen: DRAFT_BULLPEN_SLOTS.map(slot => ({ slot, seasonId: lineup.active[slot] })),
  reliefRoles: lineup.reliefRoles,
  reserves: { heading: 'Reserves', ids: lineup.reserves },
  ready: loaded,
  complete: true,
  incomplete: '',
  places(seasonId) {
   const from = all.find(place => cardAt(place) === seasonId);
   if (from === undefined) return null;
   // A reserve trades only with an active card; two reserves trading would change nothing.
   const options = all.filter(to => (typeof from !== 'number' || typeof to !== 'number') && canSwap(run, lineup, from, to)).map((to): LineupMove => ({
    key: placeKey(to), label: `${typeof to === 'number' ? placeLabel(to) : slotFor(run, seasonId, to)} · swap with ${name(cardAt(to))}`, available: true,
    announce: `${name(seasonId)} to ${placeLabel(to)}, ${name(cardAt(to))} to ${placeLabel(from)}.`
   }));
   return { current: placeKey(from), options: [{ key: placeKey(from), label: typeof from === 'number' ? placeLabel(from) : slotFor(run, seasonId, from), available: false, announce: '' }, ...options] };
  }
 };
}

const three = (value: number) => value.toFixed(3).replace(/^0/, '');
/** OPS from counting stats; null without at-bats. */
const ops = (c: { AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SF: number }) => {
 if (c.AB <= 0) return null;
 const onBase = (c.H + c.BB + c.HBP) / Math.max(1, c.AB + c.BB + c.HBP + c.SF);
 return onBase + (c.H + c.doubles + 2 * c.triples + 3 * c.HR) / c.AB;
};
/** Unearned runs add about 9% to ERA, so the card's ERA is scaled before it is compared with runs allowed per nine. */
const UNEARNED = 1.09;

/**
 * A card's season so far beside its own line: OPS for hitters, runs allowed per nine for pitchers.
 * It runs hot or cold once the sample is large enough and the gap is wide.
 */
export function seasonForm(profile: Profile | undefined, lines: { batting: ReadonlyMap<string, BatterLine>; pitching: ReadonlyMap<string, PitcherLine> }, id: string): { now: string; card: string; form: 'hot' | 'cold' | null } {
 const pitcher = !profile?.batting || (!!profile.pitching && !profile.eligibleSlots.some(slot => (HITTER_SLOTS as readonly string[]).includes(slot)));
 if (pitcher) {
  const counts = profile?.pitching;
  const era = counts && counts.IPouts > 0 ? counts.ER * 27 / counts.IPouts : null;
  const line = lines.pitching.get(id);
  const ra9 = line && line.outs > 0 ? line.R * 27 / line.outs : null;
  const expected = era === null ? null : era * UNEARNED;
  return {
   card: era === null ? '' : `card ${era.toFixed(2)} ERA`,
   // A reliever's games beside its innings show how often it goes past one inning.
   now: !line || ra9 === null ? 'Not used yet' : `${ra9.toFixed(2)} RA9 · ${innings(line.outs)} IP${line.starts ? '' : ` in ${line.appearances} G`} · ${line.SO} SO`,
   form: expected === null || ra9 === null || line!.outs < 45 ? null : expected - ra9 >= .75 ? 'hot' : ra9 - expected >= .75 ? 'cold' : null
  };
 }
 const card = ops({ ...profile!.batting! });
 const line = lines.batting.get(id);
 const now = line ? ops(line) : null;
 return {
  card: card === null ? '' : `card ${three(card)}`,
  now: !line || now === null ? 'No at-bats yet' : `${three(now)} OPS · ${line.HR} HR · ${line.PA} PA`,
  form: card === null || now === null || !line || line.PA < 30 ? null : now - card >= .06 ? 'hot' : card - now >= .06 ? 'cold' : null
 };
}

function describe(failure: LegalityFailure, name: (id: string) => string): string {
 switch (failure.code) {
  case 'ineligible-role': return `${name(failure.cardId)} cannot play ${failure.slot}`;
  case 'reserve-count': return `${failure.expected - failure.actual} reserve spot${failure.expected - failure.actual === 1 ? '' : 's'} open`;
  case 'over-cap': return `${money(failure.excess)} over the cap`;
  case 'cap-below-guarantee': return 'The cap cannot fit a roster of commons';
  default: return failure.code.replaceAll('-', ' ');
 }
}

/** What stops the opening window's roster from being submitted, in the order the player fixes it. */
export function windowBlockers(run: DraftRun, profiles: ReadonlyMap<string, Profile>): string[] {
 const lineup = windowLineup(run);
 const report = windowReport(run, { seat: run.seating.humanSeat, active: lineup.active, reserves: lineup.reserves });
 const name = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
 const surplus = lineup.reserves.length - run.pool.rules.reserves;
 // Empty slots collapse into one item; an oversized bench is one cut instruction, not a reserve count.
 const empty = report.failures.flatMap(failure => failure.code === 'missing-role' ? [failure.slot] : []);
 return [
  ...(empty.length ? [`Empty: ${empty.join(', ')}`] : []),
  ...report.failures.filter(failure => failure.code !== 'missing-role' && !(failure.code === 'reserve-count' && surplus > 0)).map(failure => describe(failure, name)),
  ...(surplus > 0 ? [`${surplus} card${surplus === 1 ? ' has' : 's have'} no roster spot; cut ${surplus === 1 ? 'it' : 'them'}`] : [])
 ];
}
