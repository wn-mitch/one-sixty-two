import { describe, expect, it } from 'vitest';
import { applyPhotoFraming, framingMatchesPhoto, resolvePhotoFit, validateFramingRegistry } from './framing.ts';
import type { PhotoFraming, PhotoFramingRegistry, PlayerPhoto } from './types.ts';
import reviewedRegistry from '../../../scripts/media/photo-framing.json';

const framing: PhotoFraming = {
 schemaVersion: 1, sourceId: 'commons:1', derivativeChecksum: 'a'.repeat(64),
 subtype: 'tight-headshot', subjectBounds: { x: .1, y: .05, width: .8, height: .9 },
 focalPoint: { x: .5, y: .3 }, fit: { mode: 'cover', position: { x: .5, y: .22 } },
 eras: { '2000s': { mode: 'cover', position: { x: .5, y: 0 } } }
};
const registry: PhotoFramingRegistry = { schemaVersion: 1, entries: [framing] };
const photo = (): PlayerPhoto => ({ sourceId: 'commons:1', url: `${'a'.repeat(64)}.webp`, width: 100, height: 200, sourceUrl: '', license: '', licenseUrl: '', credit: '' });

describe('reviewed photo framing', () => {
 it('keeps reviewed faces visible without widening the acceptable Blackwell close-up', () => {
  validateFramingRegistry(reviewedRegistry);
  const fit = (id: string) => reviewedRegistry.entries.find(entry => entry.sourceId === id)!.fit;
  expect(fit('commons:122877314').position.y).toBe(0); // Beltrán: head, not torso.
  expect(fit('commons:101931704').position.y).toBe(0); // González: narrow standing photo.
  expect(fit('commons:143213371')).toEqual({ mode: 'cover', position: { x: .5, y: .22 } });
  expect(fit('commons:108337049').position.y).toBe(.65); // Morandini: smile below tall cap.
  expect(fit('commons:10979131')).toMatchObject({ displayCrop: { x: .48, y: .64, width: .36, height: .36 } });
  expect(fit('commons:91335275')).toMatchObject({ mode: 'contain', position: { x: 1, y: .5 }, displayCrop: { x: 0, y: 0, width: .6, height: 1 } }); // Clear both the season badge and left sticker column.
 });
 it('preserves an intentional close-up and applies only the requested era override', () => {
  const asset = photo();
  applyPhotoFraming(asset, registry);
  expect(resolvePhotoFit(asset.framing, '1950s')).toEqual(framing.fit);
  expect(resolvePhotoFit(asset.framing, '2000s')?.position.y).toBe(0);
 });
 it('invalidates review when a different derivative or source replaces the reviewed bytes', () => {
  const asset = photo();
  asset.url = `${'b'.repeat(64)}.webp`;
  applyPhotoFraming(asset, registry);
  expect(asset.framing).toBeUndefined();
  expect(framingMatchesPhoto({ ...asset, framing })).toBe(false);
  const pinned = { ...framing, sourceChecksum: 'c'.repeat(64) };
  const replacement = photo();
  applyPhotoFraming(replacement, { schemaVersion: 1, entries: [pinned] });
  expect(replacement.framing).toBeUndefined();
  const removed = { ...photo(), framing };
  applyPhotoFraming(removed, { schemaVersion: 1, entries: [] });
  expect(removed.framing).toBeUndefined();
 });
 it('rejects malformed coordinates, unknown eras, duplicate reviews, and unsupported versions', () => {
  for (const entry of [
   { ...framing, focalPoint: { x: NaN, y: .5 } },
   { ...framing, subjectBounds: { x: .5, y: 0, width: .8, height: 1 } },
   { ...framing, eras: { '2030s': framing.fit } },
   { ...framing, fit: { ...framing.fit, displayCrop: { x: .5, y: 0, width: .8, height: 1 } } }
  ]) expect(() => validateFramingRegistry({ schemaVersion: 1, entries: [entry] })).toThrow();
  expect(() => validateFramingRegistry({ schemaVersion: 1, entries: [framing, framing] })).toThrow('Duplicate');
  expect(() => validateFramingRegistry({ schemaVersion: 2, entries: [] })).toThrow('incompatible');
 });
});
