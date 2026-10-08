import { fetchJson } from '../game/data.ts';
import type { MediaAsset, MediaManifest, MediaPointer, PlayerPhoto } from './types.ts';
import { comparePhotos, isCaptureDate, isPhotoCrop, reusablePhotoLicense } from './photo-policy.ts';

function record(value: unknown): value is Record<string, unknown> {
 return !!value && typeof value === 'object' && !Array.isArray(value);
}
function httpsUrl(value: unknown): value is string {
 return typeof value === 'string' && value.startsWith('https://');
}
function asset(value: unknown, version: string): value is MediaAsset {
 if (!record(value)) return false;
 return typeof value.url === 'string' && new RegExp(`^/media/${version}/[a-f0-9]{64}\\.webp$`).test(value.url)
  && !value.url.split('/').includes('..') && !/[?#]/.test(value.url)
  && typeof value.width === 'number' && value.width > 0 && Number.isFinite(value.width)
  && typeof value.height === 'number' && value.height > 0 && Number.isFinite(value.height)
  && httpsUrl(value.sourceUrl) && httpsUrl(value.licenseUrl)
  && typeof value.license === 'string' && !!value.license.trim()
  && typeof value.credit === 'string' && !!value.credit.trim();
}
export function validateMedia(value: unknown, version: string): asserts value is MediaManifest {
 if (!record(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 3) || value.version !== version
  || !/^[a-f0-9]{64}$/.test(version) || typeof value.dataVersion !== 'string'
  || typeof value.modifications !== 'string' || !value.modifications.trim()
  || !record(value.teams) || !record(value.players) || !record(value.atmosphere)
  || !record(value.diagnostics)) throw new Error('Image index is incompatible');
 for (const key of ['playersSearched', 'playersWithPhotos', 'photos', 'logos', 'historicalLogos', 'atmospherePhotos', 'excluded']) {
  if (!Number.isInteger(value.diagnostics[key]) || Number(value.diagnostics[key]) < 0) throw new Error('Image coverage counts are incompatible');
 }
 if (Number(value.diagnostics.atmospherePhotos) !== Object.keys(value.atmosphere).length) throw new Error('Atmosphere image count is incompatible');
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
   if (!asset(photo, version) || !record(photo)
    || (photo.captureEvidenceUrl !== undefined && !httpsUrl(photo.captureEvidenceUrl))
    || (photo.identityEvidenceUrl !== undefined && !httpsUrl(photo.identityEvidenceUrl))) {
    throw new Error('Portrait capture date or evidence is incompatible');
   }
   if (value.schemaVersion === 2 || photo.review === 'legacy') {
    if (!Number.isInteger(photo.year) || Number(photo.year) < Number(player.firstYear) || Number(photo.year) > Number(player.lastYear)) {
     throw new Error('Portrait capture date or evidence is incompatible');
    }
    if (value.schemaVersion === 3 && (photo.uniform !== 'unclassified' || photo.context !== 'unclassified')) throw new Error('Legacy portrait classification is incompatible');
   }
   if (value.schemaVersion === 3) {
    if (!isCaptureDate(photo.captureDate) || typeof photo.sourceId !== 'string' || !photo.sourceId.trim()
     || (photo.captureDate.kind === 'exact' ? photo.year !== photo.captureDate.year : photo.year !== undefined)
     || (photo.crop !== undefined && !isPhotoCrop(photo.crop))) throw new Error('Portrait capture date or crop is incompatible');
    if (photo.review !== 'legacy') {
     const evidence = photo.evidence;
     if (photo.review !== 'approved' || !reusablePhotoLicense(photo.license) || !['mlb', 'minor', 'other'].includes(String(photo.uniform))
      || (photo.captureDate.kind !== 'unknown' && !httpsUrl(photo.captureEvidenceUrl))
      || !['playing', 'later'].includes(String(photo.context)) || !record(evidence)
      || !['identityUrl', 'uniformUrl', 'contextUrl', 'rightsUrl'].every(key => httpsUrl(evidence[key]))
      || typeof evidence.rightsBasis !== 'string' || !evidence.rightsBasis.trim()
      || !['sourceChecksum', 'snapshotChecksum'].every(key => /^[a-f0-9]{64}$/.test(String(evidence[key])))) {
      throw new Error('Portrait review evidence is incompatible');
     }
    }
    if (photo.franchiseId !== undefined && (typeof photo.franchiseId !== 'string' || !(photo.franchiseId in value.teams))) throw new Error('Portrait franchise is incompatible');
   }
  }
 }
 for (const [id, photo] of Object.entries(value.atmosphere)) {
  if (!asset(photo, version) || !record(photo) || photo.id !== id
   || typeof photo.caption !== 'string' || !photo.caption.trim()
   || typeof photo.franchiseId !== 'string' || !(photo.franchiseId in value.teams)
   || !Number.isInteger(photo.year)) throw new Error('Atmosphere imagery is incompatible');
 }
}
let loadedIndex: Promise<MediaManifest> | undefined;
export function loadMedia(): Promise<MediaManifest> {
 if (!loadedIndex) loadedIndex = readMedia().catch(error => { loadedIndex = undefined; throw error; });
 return loadedIndex;
}
async function readMedia(): Promise<MediaManifest> {
 const pointer = await fetchJson<MediaPointer>('/media/current.json', value => {
  if (!value || ![2, 3].includes(value.schemaVersion) || !/^[a-f0-9]{64}$/.test(value.version)
   || value.manifestUrl !== `/media/${value.version}/manifest.json`) throw new Error('Image version is incompatible');
 });
 return fetchJson<MediaManifest>(pointer.manifestUrl, value => validateMedia(value, pointer.version));
}
/** Schema 3 uses the uniform policy; schema 2 retains its original selection semantics. */
export function selectPhoto(media: MediaManifest | null | undefined, playerId: string, year: number, franchiseId?: string): PlayerPhoto | null {
 const player = media?.players[playerId];
 if (!player || !Number.isInteger(year) || year < player.firstYear || year > player.lastYear) return null;
 let selected: PlayerPhoto | null = null;
 for (const photo of player.photos) {
  if (media?.schemaVersion === 3) {
   if (photo.review !== 'approved' && photo.review !== 'legacy') continue;
   if (!selected || comparePhotos(photo, selected, year, franchiseId) < 0) selected = photo;
   continue;
  }
  if (photo.year === undefined || !Number.isInteger(photo.year) || photo.year < player.firstYear || photo.year > player.lastYear) continue;
  const distance = Math.abs(photo.year - year);
  const previous = selected?.year !== undefined ? Math.abs(selected.year - year) : Infinity;
  if (distance < previous || (distance === previous && selected && (photo.year < Number(selected.year)
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
