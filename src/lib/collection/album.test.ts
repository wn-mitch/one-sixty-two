import { describe, expect, it } from 'vitest';
import type { SavedBatter } from '../game/library.ts';
import { ALBUM_GROUPS, holds, nextTier, SECRET_FAMILIES, stickerAlbum } from './album.ts';
import { STICKER_BY_KIND, STICKERS, type PlacedSticker } from './stickers.ts';

const placed = (kind: string, hidden = false): PlacedSticker => ({ kind, x: 0.5, y: 0.5, hidden, earnedAt: '2026-01-01' });
const card = (...stickers: PlacedSticker[]) => ({ stickers });
const batter = (line: Partial<SavedBatter>): SavedBatter => ({
 seasonId: 's', label: 's', slot: 'LF', PA: 650, AB: 560, H: 140, doubles: 30, triples: 2, HR: 15, BB: 40, HBP: 5, SF: 5, RBI: 80, SB: 5, war: 3, ...line
});
const slotOf = (album: ReturnType<typeof stickerAlbum>, kind: string) =>
 album.groups.flatMap(group => group.families).flatMap(family => family.slots).find(slot => slot.definition.kind === kind)!;

describe('sticker album', () => {
 it('lays out every sticker kind exactly once', () => {
  const kinds = ALBUM_GROUPS.flatMap(group => group.families).flatMap(({ family }) => STICKERS.filter(item => item.family === family).map(item => item.kind));
  expect(kinds.toSorted()).toEqual(STICKERS.map(item => item.kind).toSorted());
 });

 it('counts a higher tier toward the lower rungs of a ladder, but grades only exactly', () => {
  const album = stickerAlbum([card(placed('hr-30')), card(placed('hr-20', true)), card(placed('grade-a'))]);
  expect(slotOf(album, 'hr-20').held).toBe(2);
  expect(slotOf(album, 'hr-30').held).toBe(1);
  expect(slotOf(album, 'hr-40').held).toBe(0);
  expect(slotOf(album, 'grade-a').held).toBe(1);
  expect(slotOf(album, 'grade-b').held).toBe(0);
  expect(album.earned).toBe(3);
  expect(album.total).toBe(STICKERS.length);
  // One sticker per family per card, hidden ones included.
  expect(album.held).toBe(3);
  expect(holds(card(placed('hr-30')), STICKER_BY_KIND.get('hr-40')!)).toBe(false);
 });

 it('keeps unearned single-game feats secret and prints every other threshold', () => {
  const album = stickerAlbum([card(placed('cycle'))]);
  expect(slotOf(album, 'cycle')).toMatchObject({ held: 1, secret: false });
  expect(slotOf(album, 'cycle-2').secret).toBe(true);
  expect(slotOf(album, 'perfect-game').secret).toBe(true);
  expect(slotOf(album, 'hr-70').secret).toBe(false);
  expect([...SECRET_FAMILIES].every(family => STICKERS.some(item => item.family === family))).toBe(true);
 });
});

describe('next tier', () => {
 const base = { times: 1, best: { wins: 100, losses: 62, line: null } };

 it('measures progress on the best line toward the next rung', () => {
  const next = nextTier({ ...base, lines: [batter({ HR: 26 }), batter({ HR: 31 })] }, STICKER_BY_KIND.get('hr-30')!);
  expect(next).toEqual({ label: '40 HR', value: 31, target: 40, unit: 'HR', fraction: 0.1 });
 });

 it('reads WAR, times drafted and team wins, and stops at the top of a ladder', () => {
  expect(nextTier({ ...base, lines: [batter({ war: 15.26 })] }, STICKER_BY_KIND.get('war-14')!)).toMatchObject({ label: '16 WAR', value: 15.3, target: 16 });
  // The top rung's label is a joke; its progress still reads in WAR.
  expect(nextTier({ ...base, lines: [batter({ war: 21.04 })] }, STICKER_BY_KIND.get('war-20')!)).toMatchObject({ label: '22 WAR?!', value: 21, target: 22, unit: 'WAR' });
  expect(nextTier({ ...base, times: 4, lines: [] }, STICKER_BY_KIND.get('drafted-3')!)).toMatchObject({ target: 5, value: 4 });
  expect(nextTier({ ...base, best: { wins: 141, losses: 21, line: null }, lines: [] }, STICKER_BY_KIND.get('wins-140')!)).toMatchObject({ target: 145 });
  expect(nextTier({ ...base, lines: [batter({ HR: 73 })] }, STICKER_BY_KIND.get('hr-70')!)).toBeNull();
  // Single-game feats have no counting measure.
  expect(nextTier({ ...base, lines: [batter({})] }, STICKER_BY_KIND.get('cycle')!)).toBeNull();
 });
});
