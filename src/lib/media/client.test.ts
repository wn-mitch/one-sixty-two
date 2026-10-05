import { describe, expect, it, vi } from 'vitest';
import { selectLogo, selectPhoto, validateMedia } from './client.ts';
import type { MediaAsset, MediaManifest, PlayerPhoto } from './types.ts';

const version = 'a'.repeat(64);
function image(file: string, mediaVersion = version): MediaAsset {
 return { url: `/media/${mediaVersion}/${file}.webp`, width: 256, height: 320,
  sourceUrl: 'https://images.invalid/source', license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', credit: 'Synthetic contributor' };
}
function photo(year: number, mediaVersion = version): PlayerPhoto { return { ...image(`portrait-${year}`, mediaVersion), year }; }
function manifest(mediaVersion = version): MediaManifest {
 return { schemaVersion: 1, version: mediaVersion, dataVersion: 'b'.repeat(64),
  modifications: 'Synthetic image transformations',
  teams: { A: { name: 'Club A', color: '#224466', logo: image('modern', mediaVersion), historical: [{ ...image('predecessor', mediaVersion), firstYear: 1969, lastYear: 2004 }] } },
  players: { anonymous: { name: 'Player A', firstYear: 1961, lastYear: 1975, photos: [photo(1972, mediaVersion), photo(1961, mediaVersion), photo(1966, mediaVersion)] } },
  diagnostics: { playersSearched: 1, playersWithPhotos: 1, photos: 3, logos: 1, historicalLogos: 1, excluded: 0 } };
}

describe('verified playing-career portraits', () => {
 it('selects the exact capture year rather than a generic portrait', () => {
  const media = manifest();
  expect(selectPhoto(media, 'anonymous', 1966)?.year).toBe(1966);
  expect(selectPhoto(media, 'anonymous', 1970)?.year).toBe(1972);
 });
 it('uses the earlier capture year for an equidistant choice independent of provider order', () => {
  const media = manifest();
  expect(selectPhoto(media, 'anonymous', 1969)?.year).toBe(1966);
  media.players.anonymous.photos.reverse();
  expect(selectPhoto(media, 'anonymous', 1969)?.year).toBe(1966);
 });
 it('never substitutes a post-career portrait or an image for an unknown player', () => {
  const media = manifest();
  media.players.anonymous.photos = [photo(1960), photo(1980), photo(1966)];
  expect(selectPhoto(media, 'anonymous', 1975)?.year).toBe(1966);
  expect(selectPhoto(media, 'anonymous', 1980)).toBeNull();
  expect(selectPhoto(media, 'missing', 1966)).toBeNull();
 });
});

describe('historical team identity', () => {
 it('uses predecessor marks only within the verified period and labels modern fallback separately', () => {
  const media = manifest();
  expect(selectLogo(media, 'A', 1969)?.historical).toBe(true);
  expect(selectLogo(media, 'A', 2004)?.historical).toBe(true);
  expect(selectLogo(media, 'A', 1968)?.historical).toBe(false);
  expect(selectLogo(media, 'A', 2005)?.historical).toBe(false);
  expect(selectLogo(media, 'missing', 2000)).toBeNull();
 });
});

describe('generated image provenance validation', () => {
 it.each([{}, { photos: -1 }, { photos: '3' }])('rejects invalid coverage counts %j', invalid => {
  const media = manifest();
  const diagnostics = Object.keys(invalid).length ? { ...media.diagnostics, ...invalid } : invalid;
  expect(() => validateMedia({ ...media, diagnostics }, version)).toThrow('coverage');
 });
 it('rejects an uploaded-photo timestamp outside the recorded playing career', () => {
  const media = manifest();
  media.players.anonymous.photos.push(photo(2025));
  expect(() => validateMedia(media, version)).toThrow('capture date');
 });
 it('rejects foreign-version or external assets rather than following an incompatible index', () => {
  const media = manifest();
  media.players.anonymous.photos[0].url = '/media/other-version/portrait.webp';
  expect(() => validateMedia(media, version)).toThrow();
  media.players.anonymous.photos[0].url = 'https://images.invalid/portrait.webp';
  expect(() => validateMedia(media, version)).toThrow();
 });
});

it('refreshes the mutable image pointer after a failed manifest publication', async () => {
 vi.resetModules();
 const nextVersion = 'c'.repeat(64);
 let pointerReads = 0;
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (url === '/media/current.json') {
   const current = ++pointerReads === 1 ? version : nextVersion;
   return Response.json({ schemaVersion: 1, version: current, manifestUrl: `/media/${current}/manifest.json` });
  }
  return url === `/media/${nextVersion}/manifest.json`
   ? Response.json(manifest(nextVersion)) : new Response(null, { status: 404 });
 }));
 try {
  // Fresh module-scoped promise caches require loading after reset; a static import retains prior state.
  const { loadMedia } = await import('./client.ts');
  await expect(loadMedia()).rejects.toThrow('404');
  expect((await loadMedia()).version).toBe(nextVersion);
 } finally {
  vi.unstubAllGlobals();
  vi.resetModules();
 }
});
