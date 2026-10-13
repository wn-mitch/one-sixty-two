import { describe, expect, it } from 'vitest';
import type { LibraryEntry, SavedBatter, SavedPitcher } from '../game/library.ts';
import { faceStickers, seasonStickers, type PlacedSticker } from './stickers.ts';

const batter = (seasonId: string, line: Partial<SavedBatter>): SavedBatter => ({
 seasonId, label: seasonId, slot: 'LF', PA: 650, AB: 560, H: 160, doubles: 30, triples: 2, HR: 20, BB: 70, HBP: 5, SF: 5, RBI: 80, SB: 5, war: 3, ...line
});
const pitcher = (seasonId: string, line: Partial<SavedPitcher>): SavedPitcher => ({
 seasonId, label: seasonId, slot: 'SP1', outs: 900, H: 200, BB: 60, SO: 250, R: 150, starts: 54, war: 4, ...line
});
const season = (wins: number, batting: SavedBatter[], pitching: SavedPitcher[], mvp?: string): Pick<LibraryEntry, 'record' | 'roster' | 'batting' | 'pitching' | 'mvp'> => ({
 record: { wins, losses: 162 - wins },
 roster: [...batting, ...pitching].map(line => ({ seasonId: line.seasonId, label: line.label, slot: line.slot })),
 batting, pitching,
 ...(mvp ? { mvp: { seasonId: mvp, label: mvp } } : {})
});
const kinds = (entry: ReturnType<typeof season>, seasonId: string) => seasonStickers(entry)
 .filter(item => item.seasonId === seasonId && !item.kind.startsWith('grade-')).map(item => item.kind).sort();

describe('sticker rules', () => {
 it('awards counting stickers exactly at their thresholds', () => {
  const entry = season(99, [
   batter('at', { HR: 40, AB: 620, H: 200, RBI: 130, SB: 30 }),
   batter('below', { HR: 39, AB: 620, H: 199, RBI: 129, SB: 29 }),
   batter('sixty', { HR: 60 })
  ], []);
  expect(kinds(entry, 'at')).toEqual(['hits-200', 'hr-40', 'rbi-130', 'sb-30']);
  expect(kinds(entry, 'below')).toEqual([]);
  expect(kinds(entry, 'sixty')).toEqual(['hr-60']);
 });

 it('requires a qualifying season for rate stickers', () => {
  // .400 OBP: (H + BB + HBP) / (AB + BB + HBP + SF) = 220 / 550.
  const onBase = { AB: 450, H: 150, BB: 65, HBP: 5, SF: 30 };
  const entry = season(90, [batter('qualified', { ...onBase, PA: 502 }), batter('short', { ...onBase, PA: 501 })], [
   pitcher('ace', { outs: 486, R: 44 }), // 2.44 RA9
   pitcher('short-ace', { outs: 485, R: 10 }),
   pitcher('closer', { slot: 'CL', outs: 90, R: 6 }),
   pitcher('leaky-closer', { slot: 'CL', outs: 90, R: 7 })
  ]);
  expect(kinds(entry, 'qualified')).toEqual(['obp-400']);
  expect(kinds(entry, 'short')).toEqual([]);
  expect(kinds(entry, 'ace')).toEqual(['ace']);
  expect(kinds(entry, 'short-ace')).toEqual([]);
  expect(kinds(entry, 'closer')).toEqual(['closer']);
  expect(kinds(entry, 'leaky-closer')).toEqual([]);
 });

 it('puts team stickers and the MVP on the right cards', () => {
  expect(kinds(season(100, [batter('a', {})], [pitcher('b', {})], 'b'), 'a')).toEqual(['wins-100']);
  expect(kinds(season(100, [batter('a', {})], [pitcher('b', {})], 'b'), 'b')).toEqual(['mvp', 'wins-100']);
  expect(kinds(season(119, [batter('a', {})], []), 'a')).toEqual(['wins-100']);
  expect(kinds(season(120, [batter('a', {})], []), 'a')).toEqual(['wins-120']);
  expect(kinds(season(162, [batter('a', {})], []), 'a')).toEqual(['perfect']);
 });

 it('gives every card on a complete season that season\'s grade, and shows the best grade earned', () => {
  const grades = (wins: number) => seasonStickers(season(wins, [batter('a', {})], [pitcher('b', {})])).filter(item => item.kind.startsWith('grade-'));
  expect(grades(138)).toEqual([{ seasonId: 'a', kind: 'grade-b' }, { seasonId: 'b', kind: 'grade-b' }]);
  expect(grades(139).map(item => item.kind)).toEqual(['grade-a', 'grade-a']);
  expect(grades(162).map(item => item.kind)).toEqual(['grade-perfect', 'grade-perfect']);
  const sticker = (kind: string): PlacedSticker => ({ kind, x: 0.9, y: 0.92, hidden: false, earnedAt: '2026-01-01' });
  expect(faceStickers([sticker('grade-aa'), sticker('grade-s'), sticker('grade-f')]).map(item => item.kind)).toEqual(['grade-s']);
 });

 it('shows the highest visible tier of each family', () => {
  const sticker = (kind: string, hidden = false): PlacedSticker => ({ kind, x: 0.5, y: 0.5, hidden, earnedAt: '2026-01-01' });
  expect(faceStickers([sticker('hr-40'), sticker('hr-60'), sticker('wins-100'), sticker('unknown')]).map(item => item.kind)).toEqual(['wins-100', 'hr-60']);
  expect(faceStickers([sticker('hr-40', true), sticker('hr-60', true)])).toEqual([]);
 });
});
