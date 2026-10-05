import { fetchJson } from '../game/data.ts';
import type { MediaAsset, MediaManifest, MediaPointer, PlayerPhoto } from './types.ts';

function record(value: unknown): value is Record<string, unknown> {
 return !!value && typeof value === 'object' && !Array.isArray(value);
}
function asset(value: unknown, version: string): value is MediaAsset {
 if (!record(value)) return false;
 return typeof value.url === 'string' && value.url.startsWith(`/media/${version}/`)
  && !value.url.split('/').includes('..') && !/[?#]/.test(value.url)
  && typeof value.width === 'number' && value.width > 0 && Number.isFinite(value.width)
  && typeof value.height === 'number' && value.height > 0 && Number.isFinite(value.height)
  && typeof value.sourceUrl === 'string' && value.sourceUrl.startsWith('https://')
  && typeof value.licenseUrl === 'string' && value.licenseUrl.startsWith('https://')
  && typeof value.license === 'string' && !!value.license && typeof value.credit === 'string';
}
export function validateMedia(value: unknown, version: string): asserts value is MediaManifest {
 if (!record(value) || value.schemaVersion !== 1 || value.version !== version
  || !/^[a-f0-9]{64}$/.test(version) || typeof value.dataVersion !== 'string'
  || typeof value.modifications !== 'string' || !value.modifications.trim()
  || !record(value.teams) || !record(value.players) || !record(value.diagnostics)) throw new Error('Image index is incompatible');
 for (const key of ['playersSearched', 'playersWithPhotos', 'photos', 'logos', 'historicalLogos', 'excluded']) {
  if (!Number.isInteger(value.diagnostics[key]) || Number(value.diagnostics[key]) < 0) throw new Error('Image coverage counts are incompatible');
 }
 for (const team of Object.values(value.teams)) {
  if (!record(team) || typeof team.name !== 'string' || typeof team.color !== 'string'
   || !/^#[a-f0-9]{6}$/i.test(team.color) || !Array.isArray(team.historical)
   || (team.logo !== null && !asset(team.logo, version))) throw new Error('Team imagery is incompatible');
  for (const logo of team.historical) {
   if (!asset(logo, version) || !record(logo) || !Number.isInteger(logo.firstYear)
    || !Number.isInteger(logo.lastYear) || Number(logo.firstYear) > Number(logo.lastYear)) throw new Error('Historical logo dates are incompatible');
  }
 }
 for (const player of Object.values(value.players)) {
  if (!record(player) || typeof player.name !== 'string' || !Number.isInteger(player.firstYear) || !Number.isInteger(player.lastYear)
   || Number(player.firstYear) > Number(player.lastYear) || !Array.isArray(player.photos)) throw new Error('Portrait career dates are incompatible');
  for (const photo of player.photos) {
   if (!asset(photo, version) || !record(photo) || !Number.isInteger(photo.year)
    || Number(photo.year) < Number(player.firstYear) || Number(photo.year) > Number(player.lastYear)) throw new Error('Portrait capture date is outside the playing career');
  }
 }
}
let loadedIndex: Promise<MediaManifest> | undefined;
export function loadMedia(): Promise<MediaManifest> {
 if (!loadedIndex) loadedIndex = readMedia().catch(error => { loadedIndex = undefined; throw error; });
 return loadedIndex;
}
async function readMedia(): Promise<MediaManifest> {
 const pointer = await fetchJson<MediaPointer>('/media/current.json', value => {
  if (!value || value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.version)
   || value.manifestUrl !== `/media/${value.version}/manifest.json`) throw new Error('Image version is incompatible');
 });
 return fetchJson<MediaManifest>(pointer.manifestUrl, value => validateMedia(value, pointer.version));
}
/** Exact capture year wins; otherwise the closest verified career year, with earlier-year ties. */
export function selectPhoto(media: MediaManifest | null | undefined, playerId: string, year: number): PlayerPhoto | null {
 const player = media?.players[playerId];
 if (!player || !Number.isInteger(year) || year < player.firstYear || year > player.lastYear) return null;
 let selected: PlayerPhoto | null = null;
 for (const photo of player.photos) {
  if (!Number.isInteger(photo.year) || photo.year < player.firstYear || photo.year > player.lastYear) continue;
  const distance = Math.abs(photo.year - year);
  const previous = selected ? Math.abs(selected.year - year) : Infinity;
  if (distance < previous || (distance === previous && selected && (photo.year < selected.year
   || (photo.year === selected.year && photo.url < selected.url)))) selected = photo;
 }
 return selected;
}
export function selectLogo(media: MediaManifest | null | undefined, franchiseId: string, year?: number): { asset: MediaAsset; historical: boolean } | null {
 const team = media?.teams[franchiseId];
 if (!team) return null;
 if (year !== undefined) {
  const historical = team.historical.find(logo => year >= logo.firstYear && year <= logo.lastYear);
  if (historical) return { asset: historical, historical: true };
 }
 return team.logo ? { asset: team.logo, historical: false } : null;
}
