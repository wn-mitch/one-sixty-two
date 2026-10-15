import { describe, expect, it } from 'vitest';
import { PLATES } from '../cards/surface/foil-plates.ts';
import { FILMS, PALETTES } from '../cards/surface/holo-films.ts';
import { appearanceFor, COLORWAYS, COSMETICS, itemsForTier } from './catalogue.ts';

describe('shipped cosmetic catalogue', () => {
 it('offers every shipped plate and film once for one token, without changing Base', () => {
  expect(COSMETICS).toHaveLength(PLATES.length + FILMS.length);
  expect(new Set(COSMETICS.map(item => item.id)).size).toBe(COSMETICS.length);
  expect(COSMETICS.every(item => item.cost === 1)).toBe(true);
  expect(itemsForTier('foil').map(item => item.name)).toEqual(PLATES.map(item => item.name));
  expect(itemsForTier('emboss')).toBe(itemsForTier('foil'));
  expect(itemsForTier('gem').map(item => item.name)).toEqual(FILMS.map(item => item.name));
  expect(itemsForTier('base')).toEqual([]);
 });

 it('includes preset palettes at their original shader indices, but not the custom editor', () => {
  expect(COLORWAYS).toEqual(PALETTES.flatMap((palette, index) => palette.name === 'custom' ? [] : [{ id: palette.name, name: palette.name, palette: index }]));
  expect(appearanceFor('film:refractor', 'ice')).toEqual({ film: 'refractor', palette: PALETTES.findIndex(palette => palette.name === 'ice') });
  expect(appearanceFor('film:refractor')).toEqual({ film: 'refractor' });
  expect(appearanceFor('plate:brushed')).toEqual({ plate: 'brushed' });
  expect(appearanceFor(null)).toEqual({});
 });

 it('rejects unknown finishes and palettes and never applies colorways to plates or defaults', () => {
  expect(() => appearanceFor('missing')).toThrow('Unknown cosmetic');
  expect(() => appearanceFor('film:refractor', 'custom')).toThrow('Unknown holo colorway');
  expect(() => appearanceFor('film:refractor', 'missing')).toThrow('Unknown holo colorway');
  expect(() => appearanceFor('plate:brushed', 'ice')).toThrow('only available for Gem');
  expect(() => appearanceFor(null, 'ice')).toThrow('Choose a holo pattern');
 });
});
