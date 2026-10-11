import type { LibraryEntry, SavedBatter, SavedPitcher } from '../game/library.ts';
import { onBase, QUALIFYING_OUTS, QUALIFYING_PA, ra9 } from '../game/library-stats.ts';

/**
 * Stickers are cosmetic marks a card earns on the player's own teams. They are derived only from
 * saved season lines and team records, never reach a draft or the simulation, and are earned once
 * per player-season and kind. Thresholds sit near the top decile and top two percent of simulated
 * Classic seasons.
 */
export const STICKER_RULES_VERSION = 'stickers-v1';

export type StickerFamily = 'team' | 'mvp' | 'power' | 'contact' | 'production' | 'speed' | 'eye' | 'strikeouts' | 'ace' | 'closer' | 'loyalty';

export interface StickerDefinition {
 kind: string;
 family: StickerFamily;
 /** Higher tiers of a family replace lower ones on the card face. */
 tier: number;
 /** Two short lines printed on the sticker. */
 label: [string, string];
 title: string;
}

/** Default spot (card-normalized centre) for each family; spots are shared by families a card cannot both hold. */
export const STICKER_SPOTS: Readonly<Record<StickerFamily, { x: number; y: number; tilt: number }>> = {
 // Defaults keep the name band and the stat row clear and frame the photograph's edges.
 mvp: { x: 0.17, y: 0.3, tilt: -9 },
 team: { x: 0.83, y: 0.3, tilt: 8 },
 contact: { x: 0.17, y: 0.49, tilt: -6 },
 ace: { x: 0.17, y: 0.49, tilt: -6 },
 power: { x: 0.83, y: 0.49, tilt: 7 },
 strikeouts: { x: 0.83, y: 0.49, tilt: 7 },
 eye: { x: 0.17, y: 0.68, tilt: 5 },
 production: { x: 0.83, y: 0.68, tilt: -5 },
 closer: { x: 0.83, y: 0.68, tilt: -5 },
 speed: { x: 0.38, y: 0.71, tilt: 3 },
 loyalty: { x: 0.62, y: 0.71, tilt: -3 }
};

const define = (kind: string, family: StickerFamily, tier: number, label: [string, string], title: string): StickerDefinition => ({ kind, family, tier, label, title });

export const STICKERS: readonly StickerDefinition[] = [
 define('wins-100', 'team', 1, ['100', 'wins'], 'On a 100-win team'),
 define('wins-120', 'team', 2, ['120', 'wins'], 'On a 120-win team'),
 define('perfect', 'team', 3, ['162', '–0'], 'On a team that went 162–0'),
 define('mvp', 'mvp', 1, ['Team', 'MVP'], 'Team MVP'),
 define('hr-40', 'power', 1, ['40', 'HR'], '40 home runs'),
 define('hr-60', 'power', 2, ['60', 'HR'], '60 home runs'),
 define('hits-200', 'contact', 1, ['200', 'hits'], '200 hits'),
 define('rbi-130', 'production', 1, ['130', 'RBI'], '130 runs batted in'),
 define('sb-30', 'speed', 1, ['30', 'SB'], '30 stolen bases'),
 define('obp-400', 'eye', 1, ['.400', 'OBP'], 'A .400 on-base percentage over a qualifying season'),
 define('k-400', 'strikeouts', 1, ['400', 'K'], '400 strikeouts'),
 define('k-600', 'strikeouts', 2, ['600', 'K'], '600 strikeouts'),
 define('ace', 'ace', 1, ['Sub', '2.50'], 'Under 2.50 runs allowed per nine over a qualifying season'),
 define('closer', 'closer', 1, ['Lights', 'out'], 'A closer under 2.00 runs allowed per nine over 30 innings'),
 define('drafted-5', 'loyalty', 1, ['5×', 'drafted'], 'Drafted onto five of your teams'),
 define('drafted-10', 'loyalty', 2, ['10×', 'drafted'], 'Drafted onto ten of your teams')
];

export const STICKER_BY_KIND: ReadonlyMap<string, StickerDefinition> = new Map(STICKERS.map(sticker => [sticker.kind, sticker]));

/** Times-drafted thresholds; the database awards these from its rostering history. */
export const LOYALTY_STICKERS: readonly { kind: string; times: number }[] = [{ kind: 'drafted-5', times: 5 }, { kind: 'drafted-10', times: 10 }];

const CLOSER_OUTS = 90;

function battingStickers(line: SavedBatter): string[] {
 const kinds: string[] = [];
 if (line.HR >= 60) kinds.push('hr-60');
 if (line.HR >= 40) kinds.push('hr-40');
 if (line.H >= 200) kinds.push('hits-200');
 if (line.RBI >= 130) kinds.push('rbi-130');
 if (line.SB >= 30) kinds.push('sb-30');
 if (line.PA >= QUALIFYING_PA && onBase(line) >= 0.4) kinds.push('obp-400');
 return kinds;
}

function pitchingStickers(line: SavedPitcher): string[] {
 const kinds: string[] = [];
 if (line.SO >= 600) kinds.push('k-600');
 if (line.SO >= 400) kinds.push('k-400');
 if (line.slot === 'CL') {
  if (line.outs >= CLOSER_OUTS && ra9(line) < 2) kinds.push('closer');
 } else if (line.outs >= QUALIFYING_OUTS && ra9(line) < 2.5) kinds.push('ace');
 return kinds;
}

/** Every performance sticker one saved season earns, by card; loyalty stickers come from the rostering history. */
export function seasonStickers(entry: Pick<LibraryEntry, 'record' | 'roster' | 'batting' | 'pitching' | 'mvp'>): { seasonId: string; kind: string }[] {
 const team = entry.record.losses === 0 && entry.record.wins === 162 ? ['perfect', 'wins-120', 'wins-100']
  : entry.record.wins >= 120 ? ['wins-120', 'wins-100'] : entry.record.wins >= 100 ? ['wins-100'] : [];
 const earned: { seasonId: string; kind: string }[] = [];
 for (const card of entry.roster) {
  const kinds = [...team];
  if (entry.mvp?.seasonId === card.seasonId) kinds.push('mvp');
  for (const line of entry.batting) if (line.seasonId === card.seasonId) kinds.push(...battingStickers(line));
  for (const line of entry.pitching) if (line.seasonId === card.seasonId) kinds.push(...pitchingStickers(line));
  for (const kind of kinds) earned.push({ seasonId: card.seasonId, kind });
 }
 return earned;
}

export interface PlacedSticker { kind: string; x: number; y: number; hidden: boolean; earnedAt: string }

/** The stickers a card face shows: visible ones, the highest tier of each family, in a stable order. */
export function faceStickers(stickers: readonly PlacedSticker[]): (PlacedSticker & { definition: StickerDefinition })[] {
 const best = new Map<StickerFamily, PlacedSticker & { definition: StickerDefinition }>();
 for (const sticker of stickers) {
  const definition = STICKER_BY_KIND.get(sticker.kind);
  if (!definition || sticker.hidden) continue;
  const current = best.get(definition.family);
  if (!current || definition.tier > current.definition.tier) best.set(definition.family, { ...sticker, definition });
 }
 return [...best.values()].sort((a, b) => STICKERS.indexOf(a.definition) - STICKERS.indexOf(b.definition));
}
