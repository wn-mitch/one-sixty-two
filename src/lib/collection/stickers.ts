import type { LibraryEntry, SavedBatter, SavedPitcher } from '../game/library.ts';
import { onBase, QUALIFYING_OUTS, QUALIFYING_PA, ra9 } from '../game/library-stats.ts';
import { seasonGrade } from '../game/grade.ts';
import {
 ACE_STICKERS, CLOSER_STICKERS, CLUB_STICKERS, CONTACT_STICKERS, CYCLE_STICKERS, EYE_STICKERS, GRADE_STICKERS, GRAND_SLAM_STICKERS, HOMER_GAME_STICKERS,
 LOYALTY_STICKERS, NO_HITTER_STICKERS, PERFECT_CLOSER_OPPORTUNITIES, PERFECT_CLOSER_STICKERS, PERFECT_GAME_STICKERS, POWER_STICKERS, PRODUCTION_STICKERS,
 SAVE_STICKERS, SHUTOUT_STICKERS, SPEED_STICKERS, STRIKEOUT_GAME_STICKERS, STRIKEOUT_STICKERS, TEAM_WIN_STICKERS, WALK_OFF_STICKERS, type LadderStep
} from './sticker-ladders.ts';
import rarity from './sticker-rarity.json' with { type: 'json' };
import type { CardEra } from '../cards/view-model.ts';
import { ERA_STICKER_SLOTS } from './sticker-slots.ts';

export * from './sticker-ladders.ts';

/**
 * Stickers are cosmetic marks a card earns on the player's own teams. They are derived only from
 * saved season lines and team records, never reach a draft or the simulation, and are earned once
 * per player-season and kind. Thresholds sit near the top decile and top two percent of simulated
 * Classic seasons.
 */
export const STICKER_RULES_VERSION = 'stickers-v4';

export type StickerFamily = 'grade' | 'team' | 'mvp' | 'power' | 'contact' | 'production' | 'speed' | 'eye' | 'club' | 'cycle' | 'homerGame' | 'grandSlam' | 'walkOff'
 | 'strikeouts' | 'ace' | 'closer' | 'saves' | 'perfectCloser' | 'noHitter' | 'perfectGame' | 'shutout' | 'strikeoutGame' | 'loyalty';

export interface StickerDefinition {
 kind: string;
 family: StickerFamily;
 /** Higher tiers of a family replace lower ones on the card face. */
 tier: number;
 /** Two short lines printed on the sticker. */
 label: [string, string];
 title: string;
 /** The top four tiers of a laddered family are foil, best first: gem, gold, silver, bronze. */
 foil?: StickerFoil;
}

export type StickerFoil = 'gem' | 'gold' | 'silver' | 'bronze';
const FOILS: readonly StickerFoil[] = ['gem', 'gold', 'silver', 'bronze'];

/** Default spot (card-normalized centre) for each family; spots are shared by families a card cannot both hold. */
export const STICKER_SPOTS: Readonly<Record<StickerFamily, { x: number; y: number; tilt: number }>> = {
 // Defaults hug the left and right frame edges between the corner marks and the name band, clear of the face and the stat row.
 // The season grade every card earns heads the right column.
 mvp: { x: 0.1, y: 0.2, tilt: -9 },
 grade: { x: 0.9, y: 0.2, tilt: -6 },
 contact: { x: 0.1, y: 0.3, tilt: -6 },
 ace: { x: 0.1, y: 0.3, tilt: -6 },
 team: { x: 0.9, y: 0.3, tilt: 8 },
 eye: { x: 0.1, y: 0.4, tilt: 5 },
 noHitter: { x: 0.1, y: 0.4, tilt: 5 },
 power: { x: 0.9, y: 0.4, tilt: 7 },
 strikeouts: { x: 0.9, y: 0.4, tilt: 7 },
 speed: { x: 0.1, y: 0.5, tilt: 3 },
 perfectGame: { x: 0.1, y: 0.5, tilt: 3 },
 production: { x: 0.9, y: 0.5, tilt: -5 },
 closer: { x: 0.9, y: 0.5, tilt: -5 },
 club: { x: 0.1, y: 0.6, tilt: -4 },
 shutout: { x: 0.1, y: 0.6, tilt: -4 },
 loyalty: { x: 0.9, y: 0.6, tilt: -3 },
 cycle: { x: 0.1, y: 0.7, tilt: 6 },
 saves: { x: 0.1, y: 0.7, tilt: 6 },
 homerGame: { x: 0.9, y: 0.7, tilt: -7 },
 strikeoutGame: { x: 0.9, y: 0.7, tilt: -7 },
 grandSlam: { x: 0.1, y: 0.8, tilt: 4 },
 perfectCloser: { x: 0.1, y: 0.8, tilt: 4 },
 walkOff: { x: 0.9, y: 0.8, tilt: -4 }
};

const define = (kind: string, family: StickerFamily, tier: number, label: [string, string], title: string): StickerDefinition => ({ kind, family, tier, label, title });
const ladder = (steps: readonly LadderStep[], family: StickerFamily): StickerDefinition[] =>
 steps.map((step, index) => define(step.kind, family, index + 1, step.label, step.title));

const PLAIN_STICKERS: readonly StickerDefinition[] = [
 ...GRADE_STICKERS.map(({ grade, kind }, index) => define(kind, 'grade', GRADE_STICKERS.length - index,
  grade === 'Perfect' ? ['162', '–0'] : [grade, 'grade'], grade === 'Perfect' ? 'Graded Perfect: a 162–0 season' : `Graded ${grade} on one of your teams`)),
 ...TEAM_WIN_STICKERS.map((wins, index) => define(`wins-${wins}`, 'team', index + 1, [String(wins), 'wins'], `On a ${wins}-win team`)),
 define('perfect', 'team', TEAM_WIN_STICKERS.length + 1, ['162', '–0'], 'On a team that went 162–0'),
 define('mvp', 'mvp', 1, ['Team', 'MVP'], 'Team MVP'),
 ...ladder(POWER_STICKERS, 'power'),
 ...ladder(CONTACT_STICKERS, 'contact'),
 ...ladder(PRODUCTION_STICKERS, 'production'),
 ...ladder(SPEED_STICKERS, 'speed'),
 ...ladder(EYE_STICKERS, 'eye'),
 ...ladder(CLUB_STICKERS, 'club'),
 ...ladder(CYCLE_STICKERS, 'cycle'),
 ...ladder(HOMER_GAME_STICKERS, 'homerGame'),
 ...ladder(GRAND_SLAM_STICKERS, 'grandSlam'),
 ...ladder(WALK_OFF_STICKERS, 'walkOff'),
 ...ladder(STRIKEOUT_STICKERS, 'strikeouts'),
 ...ladder(ACE_STICKERS, 'ace'),
 ...ladder(CLOSER_STICKERS, 'closer'),
 ...ladder(SAVE_STICKERS, 'saves'),
 ...ladder(PERFECT_CLOSER_STICKERS, 'perfectCloser'),
 ...ladder(NO_HITTER_STICKERS, 'noHitter'),
 ...ladder(PERFECT_GAME_STICKERS, 'perfectGame'),
 ...ladder(SHUTOUT_STICKERS, 'shutout'),
 ...ladder(STRIKEOUT_GAME_STICKERS, 'strikeoutGame'),
 ...ladder(LOYALTY_STICKERS, 'loyalty')
];

/** Every sticker; a family with more than one tier foils its top four. */
export const STICKERS: readonly StickerDefinition[] = PLAIN_STICKERS.map(sticker => {
 const tiers = PLAIN_STICKERS.filter(item => item.family === sticker.family).length;
 const foil = tiers > 1 ? FOILS[tiers - sticker.tier] : undefined;
 return foil ? { ...sticker, foil } : sticker;
});

export const STICKER_BY_KIND: ReadonlyMap<string, StickerDefinition> = new Map(STICKERS.map(sticker => [sticker.kind, sticker]));


const CLOSER_OUTS = 90;

/** Every step of a ladder the value reaches; `atMost` ladders count down (runs allowed). */
const reached = (steps: readonly LadderStep[], value: number, atMost = false): string[] =>
 steps.filter(step => atMost ? value < step.at : value >= step.at).map(step => step.kind);

function battingStickers(line: SavedBatter): string[] {
 return [
  ...reached(POWER_STICKERS, line.HR),
  ...reached(CONTACT_STICKERS, line.H),
  ...reached(PRODUCTION_STICKERS, line.RBI),
  ...reached(SPEED_STICKERS, line.SB),
  ...(line.PA >= QUALIFYING_PA ? reached(EYE_STICKERS, onBase(line)) : []),
  ...reached(CLUB_STICKERS, Math.min(line.HR, line.SB)),
  ...reached(CYCLE_STICKERS, line.cycles ?? 0),
  ...reached(HOMER_GAME_STICKERS, line.mostHomeRunsInGame ?? 0),
  ...reached(GRAND_SLAM_STICKERS, line.grandSlams ?? 0),
  ...reached(WALK_OFF_STICKERS, line.walkOffHomeRuns ?? 0)
 ];
}

function pitchingStickers(line: SavedPitcher): string[] {
 const kinds = [
  ...reached(STRIKEOUT_STICKERS, line.SO),
  ...reached(NO_HITTER_STICKERS, line.noHitters ?? 0),
  ...reached(PERFECT_GAME_STICKERS, line.perfectGames ?? 0),
  ...reached(SHUTOUT_STICKERS, line.shutouts ?? 0),
  ...reached(STRIKEOUT_GAME_STICKERS, line.twentyStrikeoutGames ?? 0),
  ...reached(SAVE_STICKERS, line.saves ?? 0)
 ];
 if (line.slot === 'CL') {
  if (line.outs >= CLOSER_OUTS) kinds.push(...reached(CLOSER_STICKERS, ra9(line), true));
  if ((line.saveOpportunities ?? 0) >= PERFECT_CLOSER_OPPORTUNITIES && line.blownSaves === 0) kinds.push(...PERFECT_CLOSER_STICKERS.map(step => step.kind));
 } else if (line.outs >= QUALIFYING_OUTS) kinds.push(...reached(ACE_STICKERS, ra9(line), true));
 return kinds;
}

/** Keeps only the highest tier of each family, so one season never awards 100, 120 and 162–0 side by side. */
function topTiers(kinds: readonly string[]): string[] {
 const best = new Map<StickerFamily, StickerDefinition>();
 for (const kind of kinds) {
  const definition = STICKER_BY_KIND.get(kind)!;
  const current = best.get(definition.family);
  if (!current || definition.tier > current.tier) best.set(definition.family, definition);
 }
 return kinds.filter(kind => best.get(STICKER_BY_KIND.get(kind)!.family)!.kind === kind);
}

/** The performance stickers one saved season earns, by card, at the highest tier per family; loyalty stickers come from the rostering history. */
export function seasonStickers(entry: Pick<LibraryEntry, 'record' | 'roster' | 'batting' | 'pitching' | 'mvp'>): { seasonId: string; kind: string }[] {
 const team = TEAM_WIN_STICKERS.filter(wins => entry.record.wins >= wins).map(wins => `wins-${wins}`);
 if (entry.record.wins === 162 && entry.record.losses === 0) team.push('perfect');
 const earned: { seasonId: string; kind: string }[] = [];
 for (const card of entry.roster) {
  const kinds = [...team];
  const grade = GRADE_STICKERS.find(item => item.grade === seasonGrade(entry.record.wins, entry.record.losses));
  if (grade) kinds.push(grade.kind);
  if (entry.mvp?.seasonId === card.seasonId) kinds.push('mvp');
  for (const line of entry.batting) if (line.seasonId === card.seasonId) kinds.push(...battingStickers(line));
  for (const line of entry.pitching) if (line.seasonId === card.seasonId) kinds.push(...pitchingStickers(line));
  for (const kind of topTiers(kinds)) earned.push({ seasonId: card.seasonId, kind });
 }
 return earned;
}

export interface PlacedSticker { kind: string; x: number; y: number; hidden: boolean; earnedAt: string }

/** The highest visible tier of each family a card holds, in a stable order; unknown kinds are skipped. */
export function familyStickers(stickers: readonly PlacedSticker[]): (PlacedSticker & { definition: StickerDefinition })[] {
 const best = new Map<StickerFamily, PlacedSticker & { definition: StickerDefinition }>();
 for (const sticker of stickers) {
  const definition = STICKER_BY_KIND.get(sticker.kind);
  if (!definition || sticker.hidden) continue;
  const current = best.get(definition.family);
  if (!current || definition.tier > current.definition.tier) best.set(definition.family, { ...sticker, definition });
 }
 return [...best.values()].sort((a, b) => STICKERS.indexOf(a.definition) - STICKERS.indexOf(b.definition));
}

/** How many non-grade stickers a card face shows beside its grade. */
export const FACE_RARE_STICKERS = 3;
/** The shared face slots used before each era had its own, rarest first; kept for comparison sheets and era-less faces. */
export const LEGACY_FACE_SLOTS: readonly { x: number; y: number }[] = [{ x: 0.1, y: 0.2 }, { x: 0.1, y: 0.4 }, { x: 0.9, y: 0.4 }];

/**
 * Simulated card-seasons that reached each kind or a higher tier of its family, from `just sticker-rarity`.
 * A kind the sample never produced counts as rarer than any observed kind; loyalty stickers come from
 * the player's own drafting, not a season, and rank as the most common.
 */
export interface StickerRarity { cards: number; reached: Readonly<Record<string, number>> }
export const RARITY: StickerRarity & { rulesVersion: string } = rarity;
function earnRate(definition: StickerDefinition, table: StickerRarity): number {
 if (definition.family === 'loyalty') return Infinity;
 return (table.reached[definition.kind] ?? 0) / table.cards;
}

function unmoved(sticker: PlacedSticker & { definition: StickerDefinition }): boolean {
 const spot = STICKER_SPOTS[sticker.definition.family];
 return Math.abs(sticker.x - spot.x) < 1e-6 && Math.abs(sticker.y - spot.y) < 1e-6;
}

/**
 * The stickers a card face shows: its best visible grade and the three rarest other families' top
 * tiers. Ties among never-observed kinds go to the higher tier. A sticker still at its family's
 * default spot takes its era's grade spot or its rank's face slot (`ERA_STICKER_SLOTS`), clear of
 * that era's name, logo, badges and stats; one the player moved keeps its position. Without an era
 * the grade stays at its default and the rest take `LEGACY_FACE_SLOTS`.
 */
export function faceStickers(stickers: readonly PlacedSticker[], { era, table = RARITY }: { era?: CardEra; table?: StickerRarity } = {}): (PlacedSticker & { definition: StickerDefinition })[] {
 const slots = era ? ERA_STICKER_SLOTS[era] : null;
 const families = familyStickers(stickers);
 const grade = families.filter(sticker => sticker.definition.family === 'grade')
  .map(sticker => slots && unmoved(sticker) ? { ...sticker, ...slots.grade } : sticker);
 const rare = families.filter(sticker => sticker.definition.family !== 'grade')
  .map(sticker => ({ sticker, rate: earnRate(sticker.definition, table) }))
  .sort((a, b) => a.rate - b.rate || (a.rate === 0 ? b.sticker.definition.tier - a.sticker.definition.tier : 0) || STICKERS.indexOf(a.sticker.definition) - STICKERS.indexOf(b.sticker.definition))
  .slice(0, FACE_RARE_STICKERS)
  .map(({ sticker }, index) => unmoved(sticker) ? { ...sticker, ...(slots ? slots.face[index] : LEGACY_FACE_SLOTS[index]) } : sticker);
 return [...grade, ...rare];
}
