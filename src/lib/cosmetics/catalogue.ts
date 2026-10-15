import type { Finish } from '../cards/finish.ts';
import { PLATES, type FoilPlate } from '../cards/surface/foil-plates.ts';
import { FILMS, PALETTES, type HoloPattern } from '../cards/surface/holo-films.ts';

export type CustomTier = 'foil' | 'emboss' | 'gem';
export type CardAppearance = { plate?: FoilPlate; film?: HoloPattern; palette?: number };
export type CosmeticItem = { id: string; name: string; kind: 'plate' | 'film'; plate?: FoilPlate; film?: HoloPattern; cost: number };

const plates: readonly CosmeticItem[] = PLATES.map(plate => ({ id: `plate:${plate.name}`, name: plate.name, kind: 'plate', plate: plate.name as FoilPlate, cost: 1 }));
const films: readonly CosmeticItem[] = FILMS.map(film => ({ id: `film:${film.name}`, name: film.name, kind: 'film', film: film.name as HoloPattern, cost: 1 }));
const stock: readonly CosmeticItem[] = [];
export const COSMETICS: readonly CosmeticItem[] = [...plates, ...films];

/** Palette numbers retain their shipped shader indices; custom editing is not a shop colorway. */
export const COLORWAYS: readonly { id: string; name: string; palette: number }[] = PALETTES
 .map((palette, index) => ({ id: palette.name, name: palette.name, palette: index }))
 .filter(palette => palette.id !== 'custom');

export function itemsForTier(tier: Finish): readonly CosmeticItem[] {
 return tier === 'gem' ? films : tier === 'foil' || tier === 'emboss' ? plates : stock;
}

/** Null leaves the card's original era finish untouched. */
export function appearanceFor(itemId: string | null, colorway: string | null = null): CardAppearance {
 if (itemId === null) {
  if (colorway !== null) throw new Error('Choose a holo pattern before choosing a colorway.');
  return {};
 }
 const item = COSMETICS.find(item => item.id === itemId);
 if (!item) throw new Error('Unknown cosmetic finish.');
 if (item.kind === 'plate') {
  if (colorway !== null) throw new Error('Colorways are only available for Gem holo patterns.');
  return { plate: item.plate };
 }
 if (colorway === null) return { film: item.film };
 const palette = COLORWAYS.find(palette => palette.id === colorway);
 if (!palette) throw new Error('Unknown holo colorway.');
 return { film: item.film, palette: palette.palette };
}
