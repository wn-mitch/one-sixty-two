import { describe, expect, it } from 'vitest';
import type { LibraryEntry, SavedBatter, SavedPitcher } from '../game/library.ts';
import type { CardEra } from '../cards/view-model.ts';
import { ERA_STICKER_SLOTS, ERA_SET_SHAPES, setPoints, solveStickerSlots, STICKER_LAYOUT, STICKER_MARGIN, stickerFits, type EraStickerSlots } from './sticker-slots.ts';
import { faceStickers, LEGACY_FACE_SLOTS, familyStickers, RARITY, seasonStickers, STICKER_BY_KIND, STICKER_RULES_VERSION, STICKER_SPOTS, STICKERS, type PlacedSticker } from './stickers.ts';

const batter = (seasonId: string, line: Partial<SavedBatter>): SavedBatter => ({
 seasonId, label: seasonId, slot: 'LF', PA: 650, AB: 560, H: 140, doubles: 30, triples: 2, HR: 15, BB: 40, HBP: 5, SF: 5, RBI: 80, SB: 5, war: 3, ...line
});
const pitcher = (seasonId: string, line: Partial<SavedPitcher>): SavedPitcher => ({
 seasonId, label: seasonId, slot: 'SP1', outs: 900, H: 200, BB: 60, SO: 150, R: 150, starts: 54, war: 4, ...line
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
 it('foils the top four tiers of each laddered family, best first, and leaves single stickers plain', () => {
  const foil = (kind: string) => STICKER_BY_KIND.get(kind)!.foil;
  expect(['grade-perfect', 'grade-s-plus', 'grade-s', 'grade-aa', 'grade-a'].map(foil)).toEqual(['gem', 'gold', 'silver', 'bronze', undefined]);
  expect(['perfect', 'wins-160', 'wins-155', 'wins-150', 'wins-145'].map(foil)).toEqual(['gem', 'gold', 'silver', 'bronze', undefined]);
  expect(['perfect-game-2', 'perfect-game', 'mvp'].map(foil)).toEqual(['gem', 'gold', undefined]);
 });

 it('awards no-hitter and perfect-game tiers from the saved counts', () => {
  const entry = season(19, [], [pitcher('two', { noHitters: 2, perfectGames: 1 }), pitcher('old', {})]);
  expect(kinds(entry, 'two')).toEqual(['no-hitter-2', 'perfect-game']);
  // Seasons saved before feats were counted earn neither.
  expect(kinds(entry, 'old')).toEqual([]);
 });

 it('awards season WAR to hitters and pitchers on one ladder, top step only', () => {
  const entry = season(19, [batter('bat', { war: 16 }), batter('short', { war: 13.99 }), batter('old', { war: undefined as unknown as number })],
   [pitcher('arm', { war: 14.4 }), pitcher('ace', { war: 21.99 }), pitcher('absurd', { war: 22 })]);
  expect(kinds(entry, 'bat')).toEqual(['war-16']);
  expect(kinds(entry, 'arm')).toEqual(['war-14']);
  expect(kinds(entry, 'ace')).toEqual(['war-20']);
  expect(kinds(entry, 'absurd')).toEqual(['war-22']);
  // Under the first step, and lines saved before WAR was kept, earn nothing.
  expect(kinds(entry, 'short')).toEqual([]);
  expect(kinds(entry, 'old')).toEqual([]);
 });

 it('awards counting stickers exactly at their thresholds', () => {
  const entry = season(19, [
   batter('at', { HR: 40, AB: 620, H: 200, BB: 10, RBI: 130, SB: 30 }),
   batter('below', { HR: 39, AB: 620, H: 199, BB: 10, RBI: 129, SB: 29 }),
   batter('sixty', { HR: 60 })
  ], []);
  expect(kinds(entry, 'at')).toEqual(['club-30', 'hits-200', 'hr-40', 'rbi-130', 'sb-30']);
  // One short of each threshold lands on the step below it.
  expect(kinds(entry, 'below')).toEqual(['hits-175', 'hr-30', 'rbi-115', 'sb-20']);
  expect(kinds(entry, 'sixty')).toEqual(['hr-60']);
 });

 it('requires a qualifying season for rate stickers', () => {
  // .400 OBP: (H + BB + HBP) / (AB + BB + HBP + SF) = 220 / 550.
  const onBase = { AB: 450, H: 150, BB: 65, HBP: 5, SF: 30 };
  const entry = season(19, [batter('qualified', { ...onBase, PA: 502 }), batter('short', { ...onBase, PA: 501 })], [
   pitcher('ace', { outs: 486, R: 44 }), // 2.44 RA9
   pitcher('short-ace', { outs: 485, R: 10 }),
   pitcher('closer', { slot: 'CL', outs: 90, R: 6 }),
   pitcher('leaky-closer', { slot: 'CL', outs: 90, R: 7 }),
   pitcher('short-closer', { slot: 'CL', outs: 89, R: 0 })
  ]);
  const rates = (seasonId: string) => kinds(entry, seasonId).filter(kind => kind.startsWith('obp-'));
  expect(rates('qualified')).toEqual(['obp-400']);
  expect(rates('short')).toEqual([]);
  expect(kinds(entry, 'ace')).toEqual(['ace']);
  expect(kinds(entry, 'short-ace')).toEqual([]);
  expect(kinds(entry, 'closer')).toEqual(['closer']);
  // 2.10 RA9 misses Lights out; under 30 innings no closer sticker is possible.
  expect(kinds(entry, 'leaky-closer')).toEqual([]);
  expect(kinds(entry, 'short-closer')).toEqual([]);
  const runs = season(19, [], [pitcher('dominant', { outs: 900, R: 33 })]); // 0.99 RA9
  expect(kinds(runs, 'dominant')).toEqual(['ace-100']);
 });

 it('puts team stickers and the MVP on the right cards', () => {
  expect(kinds(season(100, [batter('a', {})], [pitcher('b', {})], 'b'), 'a')).toEqual(['wins-100']);
  expect(kinds(season(100, [batter('a', {})], [pitcher('b', {})], 'b'), 'b')).toEqual(['mvp', 'wins-100']);
  expect(kinds(season(119, [batter('a', {})], []), 'a')).toEqual(['wins-100']);
  expect(kinds(season(120, [batter('a', {})], []), 'a')).toEqual(['wins-120']);
  expect(kinds(season(162, [batter('a', {})], []), 'a')).toEqual(['perfect']);
  // The ladder: every 20 to 120, then 130, 140 and every 5 to 160; each season shows its top step.
  expect(kinds(season(19, [batter('a', {})], []), 'a')).toEqual([]);
  expect(kinds(season(85, [batter('a', {})], []), 'a')).toEqual(['wins-80']);
  expect(kinds(season(139, [batter('a', {})], []), 'a')).toEqual(['wins-130']);
  expect(kinds(season(149, [batter('a', {})], []), 'a')).toEqual(['wins-145']);
  expect(kinds(season(161, [batter('a', {})], []), 'a')).toEqual(['wins-160']);

  // Titles read as English: an 80-win team.
  expect(['wins-80', 'wins-100'].map(kind => STICKER_BY_KIND.get(kind)!.title)).toEqual(['On an 80-win team', 'On a 100-win team']);
 });

 it('gives every card on a complete season that season\'s grade, and shows the best grade earned', () => {
  const grades = (wins: number) => seasonStickers(season(wins, [batter('a', {})], [pitcher('b', {})])).filter(item => item.kind.startsWith('grade-'));
  expect(grades(138)).toEqual([{ seasonId: 'a', kind: 'grade-b' }, { seasonId: 'b', kind: 'grade-b' }]);
  expect(grades(139).map(item => item.kind)).toEqual(['grade-a', 'grade-a']);
  expect(grades(162).map(item => item.kind)).toEqual(['grade-perfect', 'grade-perfect']);
  const sticker = (kind: string): PlacedSticker => ({ kind, x: 0.9, y: 0.92, hidden: false, earnedAt: '2026-01-01' });
  expect(faceStickers([sticker('grade-aa'), sticker('grade-s'), sticker('grade-f')]).map(item => item.kind)).toEqual(['grade-s']);
 });

 it('awards closer saves, and a perfect closer only over enough opportunities without a blown save', () => {
  const closer = (seasonId: string, line: Partial<SavedPitcher>) => pitcher(seasonId, { slot: 'CL', outs: 200, R: 40, ...line });
  const entry = season(19, [], [
   closer('perfect', { saves: 40, blownSaves: 0, saveOpportunities: 20 }),
   closer('one-blown', { saves: 39, blownSaves: 1, saveOpportunities: 40 }),
   closer('few-chances', { saves: 19, blownSaves: 0, saveOpportunities: 19 }),
   pitcher('setup', { slot: 'RP1', saves: 30, blownSaves: 0, saveOpportunities: 30 }),
   closer('old', {})
  ]);
  expect(kinds(entry, 'perfect')).toEqual(['perfect-closer', 'saves-40']);
  expect(kinds(entry, 'one-blown')).toEqual(['saves-30']);
  expect(kinds(entry, 'few-chances')).toEqual([]);
  // Saves count for any pitcher; perfect closer is the closer's.
  expect(kinds(entry, 'setup')).toEqual(['saves-30']);
  expect(kinds(entry, 'old')).toEqual([]);
 });

 it('awards single-game feats and the club ladder from the saved counts', () => {
  const entry = season(19, [
   batter('feats', { cycles: 2, mostHomeRunsInGame: 4, grandSlams: 1, walkOffHomeRuns: 3, HR: 41, SB: 40 }),
   batter('three', { mostHomeRunsInGame: 3, HR: 30, SB: 29 }),
   batter('old', { HR: 30, SB: 30 })
  ], [pitcher('arm', { shutouts: 3, twentyStrikeoutGames: 1 })]);
  expect(kinds(entry, 'feats')).toEqual(['club-40', 'cycle-2', 'grand-slam', 'hr-40', 'hr-game-4', 'sb-40', 'walk-off-3']);
  expect(kinds(entry, 'three')).toEqual(['hr-30', 'hr-game-3', 'sb-20']);
  // Seasons saved before feats were counted still earn the club from their season totals.
  expect(kinds(entry, 'old')).toEqual(['club-30', 'hr-30', 'sb-30']);
  expect(kinds(entry, 'arm')).toEqual(['k-game-20', 'shutout-3']);
 });

 it('shows the highest visible tier of each family and skips unknown kinds', () => {
  const sticker = (kind: string, hidden = false): PlacedSticker => ({ kind, x: 0.5, y: 0.5, hidden, earnedAt: '2026-01-01' });
  expect(familyStickers([sticker('hr-40'), sticker('hr-60'), sticker('wins-100'), sticker('unknown'), sticker('closer-zero')]).map(item => item.kind)).toEqual(['wins-100', 'hr-60']);
  expect(familyStickers([sticker('hr-40', true), sticker('hr-60', true)])).toEqual([]);
  expect(faceStickers([sticker('closer-zero'), sticker('unknown')])).toEqual([]);
 });

 it('ranks the face from a rarity table that covers every season sticker under the current rules', () => {
  expect(RARITY.rulesVersion).toBe(STICKER_RULES_VERSION);
  expect(Object.keys(RARITY.reached).sort()).toEqual(STICKERS.filter(sticker => sticker.family !== 'loyalty').map(sticker => sticker.kind).sort());
 });

 it('puts the grade and the three rarest families on the face, in fixed slots unless moved', () => {
  const sticker = (kind: string, at?: { x: number; y: number }, hidden = false): PlacedSticker =>
   ({ kind, ...(at ?? STICKER_SPOTS[STICKER_BY_KIND.get(kind)!.family]), hidden, earnedAt: '2026-01-01' });
  // A fixed table: of 1,000 sampled cards, 900 reached 20 wins, 300 hit 20 HR, 100 had 150 hits; four-homer games and two cycles never happened.
  const rarity = { cards: 1000, reached: { 'wins-20': 900, 'hr-20': 300, 'hits-150': 100, 'hr-game-3': 5, 'hr-game-4': 0, cycle: 2, 'cycle-2': 0 } };
  const held = ['grade-a', 'wins-20', 'hr-20', 'hits-150', 'hr-game-4', 'cycle-2', 'drafted-100'];
  const face = faceStickers(held.map(kind => sticker(kind)), { era: '1990s', table: rarity });
  // Never-sampled kinds outrank observed ones; loyalty, earned by drafting, ranks last.
  expect(face.map(item => item.kind)).toEqual(['grade-a', 'cycle-2', 'hr-game-4', 'hits-150']);
  // Unmoved stickers take the era's set, grade first; without an era they keep the shared legacy spots.
  const slots = ERA_STICKER_SLOTS['1990s'];
  expect(face.map(({ x, y }) => ({ x, y }))).toEqual([slots.grade, ...slots.face]);
  const legacy = faceStickers(held.map(kind => sticker(kind)), { table: rarity });
  expect(legacy[0]).toMatchObject(STICKER_SPOTS.grade);
  expect(legacy.slice(1).map(({ x, y }) => ({ x, y }))).toEqual(LEGACY_FACE_SLOTS);
  // A moved sticker keeps its spot, grade included; hiding one lets the next rarest family onto the face.
  const moved = faceStickers([...held.filter(kind => kind !== 'cycle-2' && kind !== 'grade-a').map(kind => sticker(kind)), sticker('cycle-2', { x: 0.3, y: 0.6 }), sticker('grade-a', { x: 0.4, y: 0.5 })], { era: '1990s', table: rarity });
  expect(moved.find(item => item.kind === 'cycle-2')).toMatchObject({ x: 0.3, y: 0.6 });
  expect(moved.find(item => item.kind === 'grade-a')).toMatchObject({ x: 0.4, y: 0.5 });
  const hidden = faceStickers([...held.filter(kind => kind !== 'cycle-2').map(kind => sticker(kind)), sticker('cycle-2', undefined, true)], { table: rarity });
  expect(hidden.map(item => item.kind)).toEqual(['grade-a', 'hr-game-4', 'hits-150', 'hr-20']);
 });

 it('commits the slot table its measured layout solves to', () => {
  for (const era of Object.keys(STICKER_LAYOUT.eras) as CardEra[]) expect(solveStickerSlots(STICKER_LAYOUT.eras[era], STICKER_LAYOUT, ERA_SET_SHAPES[era]), era).toEqual(ERA_STICKER_SLOTS[era]);
 // The full solve searches every era's measured layout; it runs in seconds alone and longer beside the rest of the suite.
 }, 60_000);

 it('lines each era\'s set up evenly, a margin clear of its protected layers and frame', () => {
  const pitch = 2 * STICKER_LAYOUT.radius + STICKER_MARGIN;
  for (const [era, slots] of Object.entries(ERA_STICKER_SLOTS) as [CardEra, EraStickerSlots][]) {
   const points = [slots.grade, ...slots.face];
   const layout = STICKER_LAYOUT.eras[era];
   for (const point of points) expect(stickerFits(point, layout, STICKER_LAYOUT), `${era} ${point.x},${point.y}`).toBe(true);
   const axis = layout.photo.x + layout.photo.w / 2;
   const expected = setPoints(slots.shape, pitch, points[0].x, points[0].y * STICKER_LAYOUT.aspect, axis);
   for (const [index, point] of points.entries()) {
    expect(point.x, `${era} sticker ${index} x`).toBeCloseTo(expected[index][0], 3);
    expect(point.y * STICKER_LAYOUT.aspect, `${era} sticker ${index} y`).toBeCloseTo(expected[index][1], 3);
   }
  }
 });

 it('keeps the set off the 1990s name the old shared spots covered', () => {
  const layout = STICKER_LAYOUT.eras['1990s'];
  expect(stickerFits(LEGACY_FACE_SLOTS[0], layout, STICKER_LAYOUT)).toBe(false);
  expect(stickerFits(ERA_STICKER_SLOTS['1990s'].face[0], layout, STICKER_LAYOUT)).toBe(true);
 });

 it('splits the 1970s set into mirrored pairs in the top corners, grade top left', () => {
  const slots = ERA_STICKER_SLOTS['1970s'];
  expect(slots.shape).toMatch(/^split/);
  const [grade, rarest, second, third] = [slots.grade, ...slots.face];
  expect(grade.x).toBeLessThan(0.5);
  expect(third.x).toBeGreaterThan(0.5);
  expect(grade.y).toBeLessThan(STICKER_LAYOUT.eras['1970s'].photo.y);
  expect(grade.x + third.x).toBeCloseTo(rarest.x + second.x, 3);
 });
});
