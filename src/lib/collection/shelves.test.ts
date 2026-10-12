import { describe, expect, it } from 'vitest';
import type { Candidate, Franchise } from '../game/types.ts';
import type { CollectedCard } from './collection.ts';
import { completionPercent, shelveCollection } from './shelves.ts';

const candidate = (seasonId: string, franchiseId: string, decade: number): Candidate => ({ seasonId, playerId: seasonId.split(':')[0], franchiseId, decade, eligibleSlots: seasonId.startsWith('bullpen:') ? ['BP'] : ['LF'] });
const CANDIDATES = [
 candidate('a:1955:AL:BOS', 'BOS', 1950), candidate('b:1999:AL:BOS', 'BOS', 1990), candidate('c:1998:NL:ATL', 'ATL', 1990),
 candidate('d:1994:NL:ATL', 'ATL', 1990), candidate('bullpen:1999:AL:BOS', 'BOS', 1990)
];
const FRANCHISES: Franchise[] = [{ id: 'BOS', name: 'Boston Red Sox', decades: [1950, 1990] }, { id: 'ATL', name: 'Atlanta Braves', decades: [1990] }];
const card = (seasonId: string, slot: CollectedCard['slots'][number] = 'LF'): CollectedCard => ({
 seasonId, label: seasonId, slots: [slot], times: 1, firstAt: '', lastAt: '', best: { wins: 100, losses: 62, line: null }, stickers: []
});

describe('collection shelves', () => {
 it('counts completion over player-seasons only and keeps it independent of the shown filter', () => {
  const collected = [card('b:1999:AL:BOS'), card('bullpen:1999:AL:BOS', 'BP'), card('c:1998:NL:ATL'), card('gone:1960:AL:XXX')];
  const shown = collected.filter(item => item.seasonId !== 'c:1998:NL:ATL');
  const team = shelveCollection(collected, shown, CANDIDATES, FRANCHISES, 'team');
  // Four countable seasons; the bullpen and a season missing from the data never count.
  expect([team.owned, team.total]).toEqual([2, 4]);
  // Atlanta has no shown card, so it has no shelf; the filtered-out card still counts toward the total.
  expect(team.shelves.map(shelf => [shelf.label, shelf.owned, shelf.total, shelf.cards.length])).toEqual([
   ['Boston Red Sox', 1, 2, 2], ['Other seasons', 0, 0, 1]
  ]);
 });

 it('orders eras by decade, not by label', () => {
  const collected = [card('c:1998:NL:ATL'), card('a:1955:AL:BOS')];
  const era = shelveCollection(collected, collected, CANDIDATES, FRANCHISES, 'era');
  expect(era.shelves.map(shelf => [shelf.label, shelf.owned, shelf.total])).toEqual([['1950s', 1, 1], ['1990s', 1, 3]]);
 });

 it('never rounds a started collection down to zero', () => {
  expect(completionPercent(1, 43_632)).toBe('<0.01%');
  expect(completionPercent(5, 43_632)).toBe('0.01%');
  expect(completionPercent(1, 3)).toBe('33.3%');
  expect(completionPercent(0, 0)).toBe('—');
 });
});
