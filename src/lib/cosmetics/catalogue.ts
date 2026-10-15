import type { Finish } from '../cards/finish.ts';
import { PLATES, type FoilPlate } from '../cards/surface/foil-plates.ts';
import { FILMS, PALETTES, type HoloPattern } from '../cards/surface/holo-films.ts';

export type CustomTier = 'foil' | 'emboss' | 'gem';
export type CardAppearance = { plate?: FoilPlate; film?: HoloPattern; palette?: number };
export type CosmeticItem = { id: string; name: string; kind: 'plate' | 'film' | 'colorway'; plate?: FoilPlate; film?: HoloPattern; cost: number };

const plates: readonly CosmeticItem[] = PLATES.map(plate => ({ id: `plate:${plate.name}`, name: plate.name, kind: 'plate', plate: plate.name as FoilPlate, cost: 1 }));
const films: readonly CosmeticItem[] = FILMS.map(film => ({ id: `film:${film.name}`, name: film.name, kind: 'film', film: film.name as HoloPattern, cost: 1 }));
const stock: readonly CosmeticItem[] = [];
/** Palette numbers retain their shipped shader indices; custom editing is not a shop colorway. */
export const COLORWAYS: readonly { id: string; name: string; palette: number }[] = PALETTES
 .map((palette, index) => ({ id: palette.name, name: palette.name, palette: index }))
 .filter(palette => palette.id !== 'custom');
const colorways: readonly CosmeticItem[] = COLORWAYS.map(colorway => ({ id: colorwayItemId(colorway.id), name: colorway.name, kind: 'colorway', cost: 1 }));
export const COSMETICS: readonly CosmeticItem[] = [...plates, ...films, ...colorways];

/** The unlock that owns a colorway; colorways recolor any Gem holo, including an era's own film. */
export function colorwayItemId(colorway: string): string {
 return `colorway:${colorway}`;
}

export function costOf(id: string): number {
 const item = COSMETICS.find(entry => entry.id === id);
 if (!item) throw new Error('Unknown cosmetic finish.');
 return item.cost;
}

export function itemsForTier(tier: Finish): readonly CosmeticItem[] {
 return tier === 'gem' ? films : tier === 'foil' || tier === 'emboss' ? plates : stock;
}

/** A finish's player-facing name: `diamond-plate` reads as Diamond Plate. */
export function finishName(item: Pick<CosmeticItem, 'name'>): string {
 return item.name.split(/[-_\s]+/).filter(Boolean).map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

/** Null leaves the card's original era finish untouched. */
export function appearanceFor(itemId: string | null, colorway: string | null = null): CardAppearance {
 const item = itemId === null ? null : COSMETICS.find(item => item.id === itemId);
 if (itemId !== null && (!item || item.kind === 'colorway')) throw new Error('Unknown cosmetic finish.');
 // Without an item the era keeps its own plate or film; a colorway recolors that film.
 if (!item) return colorway === null ? {} : { palette: paletteOf(colorway) };
 if (item.kind === 'plate') {
  if (colorway !== null) throw new Error('Colorways are only available for Gem holo patterns.');
  return { plate: item.plate };
 }
 return colorway === null ? { film: item.film } : { film: item.film, palette: paletteOf(colorway) };
}

function paletteOf(colorway: string): number {
 const palette = COLORWAYS.find(palette => palette.id === colorway);
 if (!palette) throw new Error('Unknown holo colorway.');
 return palette.palette;
}
