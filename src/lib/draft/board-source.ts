import type { BoardSource } from '../game/board-source.ts';
import type { RosterView } from '../game/roster-view.ts';
import type { Profile } from '../game/types.ts';
import { picksPerSeat } from './rules.ts';
import { heldPile, movesFor, openSlotsFor, type DraftRun } from './run.ts';
import type { DraftCard } from './types.ts';

/** The player's arrangement as the field shows it: every active slot, the bench beneath, and any card free to move. */
export function draftRosterView(run: DraftRun): RosterView {
 return {
  slots: run.pool.rules.activeSlots,
  placed: new Map(run.field),
  bench: [...run.bench],
  reserves: run.pool.rules.reserves,
  movable: () => true
 };
}

const printed = new WeakMap<Profile, Profile>();
/** The card's profile with its dealt finish, kept as one object per profile so the grid keeps its identity. */
export function dealtProfile(profile: Profile, card: DraftCard): Profile {
 let value = printed.get(profile);
 if (!value || value.finish !== card.finish) printed.set(profile, value = { ...profile, finish: card.finish, valueRuns: card.valueRuns });
 return value;
}

/**
 * Draft Mode's board: the held pile, once every card in it has loaded, drafted into any open slot it
 * can fill or onto the bench. Each card is its own exact season, so seasons are never grouped.
 */
export function pileBoardSource(run: DraftRun, profiles: ReadonlyMap<string, Profile>): BoardSource {
 const pile = heldPile(run);
 const loaded = pile.every(card => profiles.has(card.seasonId));
 const offer = loaded ? pile.map(card => dealtProfile(profiles.get(card.seasonId)!, card)) : [];
 const cards = new Map(pile.map((card, index) => [card.seasonId, { card, index }]));
 const salary = (profile: Profile) => cards.get(profile.seasonId)?.card.salary ?? 0;
 const dealt = (profile: Profile) => cards.get(profile.seasonId)?.index ?? 0;
 return {
  key: `${run.setup.seed}:${run.pick}:${run.actions.length}`,
  roster: draftRosterView(run),
  offer,
  groupSeasons: false,
  pickNumber: run.pick + 1,
  pickCount: picksPerSeat(run.pool.rules),
  waiting: loaded ? null : 'Dealing your pile…',
  sorts: [
   { value: 'salary', label: 'Salary', compare: (a, b) => salary(b) - salary(a) || dealt(a) - dealt(b) },
   { value: 'dealt', label: 'Dealt', compare: (a, b) => dealt(a) - dealt(b) }
  ],
  viable: seasonId => cards.has(seasonId),
  destinations: seasonId => cards.has(seasonId) ? openSlotsFor(run, seasonId) : [],
  benches: seasonId => cards.has(seasonId),
  moves: seasonId => movesFor(run, seasonId)
 };
}
