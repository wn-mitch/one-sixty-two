import type { SavedBatter, SavedPitcher } from '../game/library.ts';
import type { CollectedCard } from './collection.ts';
import {
 CONTACT_STICKERS, LOYALTY_STICKERS, POWER_STICKERS, PRODUCTION_STICKERS, SAVE_STICKERS, SPEED_STICKERS, STICKER_BY_KIND, STICKERS, STRIKEOUT_STICKERS,
 TEAM_WIN_STICKERS, WAR_STICKERS, type LadderStep, type StickerDefinition, type StickerFamily
} from './stickers.ts';

/** How the album names and groups each family, in album order. */
export const ALBUM_GROUPS: readonly { title: string; families: readonly { family: StickerFamily; name: string }[] }[] = [
 { title: 'Season', families: [
  { family: 'grade', name: 'Grade' }, { family: 'team', name: 'Team wins' }, { family: 'mvp', name: 'Team MVP' }, { family: 'war', name: 'WAR' }
 ] },
 { title: 'Hitting', families: [
  { family: 'power', name: 'Home runs' }, { family: 'contact', name: 'Hits' }, { family: 'production', name: 'RBI' }, { family: 'speed', name: 'Steals' },
  { family: 'eye', name: 'On base' }, { family: 'club', name: 'HR–SB club' }, { family: 'grandSlam', name: 'Grand slams' }, { family: 'walkOff', name: 'Walk-offs' },
  { family: 'cycle', name: 'Cycle' }, { family: 'homerGame', name: 'Multi-homer game' }
 ] },
 { title: 'Pitching', families: [
  { family: 'strikeouts', name: 'Strikeouts' }, { family: 'ace', name: 'Ace' }, { family: 'shutout', name: 'Shutouts' }, { family: 'saves', name: 'Saves' },
  { family: 'closer', name: 'Lights out' }, { family: 'perfectCloser', name: 'Perfect closer' }, { family: 'noHitter', name: 'No-hitters' },
  { family: 'perfectGame', name: 'Perfect games' }, { family: 'strikeoutGame', name: '20-strikeout game' }
 ] },
 { title: 'Drafting', families: [{ family: 'loyalty', name: 'Times drafted' }] }
];

/** Single-game feats whose unearned tiers stay secret in the album. */
export const SECRET_FAMILIES: ReadonlySet<StickerFamily> = new Set(['cycle', 'homerGame', 'noHitter', 'perfectGame', 'strikeoutGame']);

/** A grade is earned exactly; every other family is a ladder, so a higher tier also reaches the lower ones. */
const exact = (family: StickerFamily) => family === 'grade';

/** Whether a card holds `definition`, or a higher tier of a laddered family, hidden or not. */
export function holds(card: Pick<CollectedCard, 'stickers'>, definition: StickerDefinition): boolean {
 return card.stickers.some(sticker => {
  const held = STICKER_BY_KIND.get(sticker.kind);
  return !!held && held.family === definition.family && (exact(definition.family) ? held.kind === definition.kind : held.tier >= definition.tier);
 });
}

export interface AlbumSlot { definition: StickerDefinition; held: number; secret: boolean }
export interface AlbumFamily { family: StickerFamily; name: string; slots: AlbumSlot[]; earned: number }
export interface Album { groups: { title: string; families: AlbumFamily[] }[]; earned: number; total: number; held: number }

/** Every sticker kind laid out by family, lowest tier first, with how many cards hold each. */
export function stickerAlbum(cards: readonly Pick<CollectedCard, 'stickers'>[]): Album {
 let earned = 0;
 const groups = ALBUM_GROUPS.map(group => ({
  title: group.title,
  families: group.families.map(({ family, name }) => {
   const slots = STICKERS.filter(item => item.family === family).toSorted((a, b) => a.tier - b.tier).map(definition => {
    const held = cards.filter(card => holds(card, definition)).length;
    return { definition, held, secret: held === 0 && SECRET_FAMILIES.has(family) };
   });
   const familyEarned = slots.filter(slot => slot.held > 0).length;
   earned += familyEarned;
   return { family, name, slots, earned: familyEarned };
  })
 }));
 // Each card shows one sticker per family: its top tier, hidden ones included.
 const held = cards.reduce((sum, card) => sum + new Set(card.stickers.map(sticker => STICKER_BY_KIND.get(sticker.kind)?.family).filter(Boolean)).size, 0);
 return { groups, earned, total: STICKERS.length, held };
}

const isBatter = (line: SavedBatter | SavedPitcher): line is SavedBatter => 'PA' in line;
const most = (values: readonly number[]) => values.length ? Math.max(...values) : null;

/** Counting ladders whose progress a card's own lines measure: the card's best value and the ladder. */
function measure(card: Pick<CollectedCard, 'lines' | 'times' | 'best'>, family: StickerFamily): { value: number; steps: readonly LadderStep[] | readonly number[] } | null {
 const batting = card.lines.filter(isBatter);
 const pitching = card.lines.filter((line): line is SavedPitcher => !isBatter(line));
 const pick = (values: (number | undefined)[], steps: readonly LadderStep[]) => {
  const value = most(values.filter((item): item is number => Number.isFinite(item)));
  return value === null ? null : { value, steps };
 };
 switch (family) {
  case 'power': return pick(batting.map(line => line.HR), POWER_STICKERS);
  case 'contact': return pick(batting.map(line => line.H), CONTACT_STICKERS);
  case 'production': return pick(batting.map(line => line.RBI), PRODUCTION_STICKERS);
  case 'speed': return pick(batting.map(line => line.SB), SPEED_STICKERS);
  case 'strikeouts': return pick(pitching.map(line => line.SO), STRIKEOUT_STICKERS);
  case 'saves': return pick(pitching.map(line => line.saves), SAVE_STICKERS);
  case 'war': return pick(card.lines.map(line => line.war), WAR_STICKERS);
  case 'loyalty': return { value: card.times, steps: LOYALTY_STICKERS };
  case 'team': return { value: card.best.wins, steps: TEAM_WIN_STICKERS };
  default: return null;
 }
}

export interface NextTier { label: string; value: number; target: number; unit: string; fraction: number }

/**
 * Progress from the tier a card holds toward the family's next one, measured on the card's best
 * season line (or times drafted, or best team record). Families without a counting measure, and
 * cards already at the top, have none.
 */
export function nextTier(card: Pick<CollectedCard, 'lines' | 'times' | 'best'>, held: StickerDefinition): NextTier | null {
 const measured = measure(card, held.family);
 if (!measured) return null;
 const thresholds = measured.steps.map(step => typeof step === 'number' ? step : step.at);
 const next = thresholds.find(at => at > measured.value);
 if (next === undefined) return null;
 const ladder = STICKERS.filter(item => item.family === held.family).toSorted((a, b) => a.tier - b.tier);
 const target = ladder[thresholds.indexOf(next)];
 if (!target || target.tier <= held.tier) return null;
 const below = thresholds.filter(at => at <= measured.value).at(-1) ?? 0;
 const value = held.family === 'war' ? Math.round(measured.value * 10) / 10 : measured.value;
 return { label: target.label.join(' '), value, target: next, unit: held.family === 'war' ? 'WAR' : target.label[1], fraction: Math.max(0, Math.min(1, (measured.value - below) / (next - below))) };
}
