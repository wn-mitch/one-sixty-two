import { CARD_ERAS, type CardEra } from '../cards/era.ts';
import type { PhotoFit, PhotoFraming, PhotoFramingRegistry, PlayerPhoto } from './types.ts';

const subtypes = ['tight-headshot', 'head-and-shoulders', 'upper-body-portrait', 'upper-body-action', 'full-body-portrait', 'full-body-action', 'team-group'];
function record(value: unknown): value is Record<string, unknown> {
 return !!value && typeof value === 'object' && !Array.isArray(value);
}
function unit(value: unknown): value is number {
 return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function point(value: unknown): boolean {
 return record(value) && unit(value.x) && unit(value.y);
}
function fit(value: unknown): value is PhotoFit {
 return record(value) && (value.mode === 'cover' || value.mode === 'contain') && point(value.position)
  && (value.displayCrop === undefined || bounds(value.displayCrop));
}
function bounds(value: unknown): boolean {
 return record(value) && unit(value.x) && unit(value.y) && unit(value.width) && unit(value.height)
  && value.width > 0 && value.height > 0 && value.x + value.width <= 1.000001 && value.y + value.height <= 1.000001;
}
export function isPhotoFraming(value: unknown): value is PhotoFraming {
 if (!record(value) || value.schemaVersion !== 1 || typeof value.sourceId !== 'string' || !value.sourceId.trim()
  || (value.sourceChecksum !== undefined && (typeof value.sourceChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceChecksum)))
  || typeof value.derivativeChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.derivativeChecksum)
  || !subtypes.includes(String(value.subtype)) || !point(value.focalPoint) || !fit(value.fit)
  || (value.notes !== undefined && typeof value.notes !== 'string')) return false;
 if (!bounds(value.subjectBounds)) return false;
 return value.eras === undefined || (record(value.eras) && Object.entries(value.eras).every(([era, setting]) => CARD_ERAS.includes(era as CardEra) && fit(setting)));
}
export function validateFramingRegistry(value: unknown): asserts value is PhotoFramingRegistry {
 if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) throw new Error('Photo framing registry is incompatible');
 const seen = new Set<string>();
 for (const entry of value.entries) {
  if (!record(entry) || !isPhotoFraming({ ...entry, schemaVersion: 1 })) throw new Error('Invalid photo framing entry');
  const key = `${entry.sourceId}\0${entry.derivativeChecksum}`;
  if (seen.has(key)) throw new Error(`Duplicate photo framing entry: ${entry.sourceId}`);
  seen.add(key);
 }
}
/** Never transfer a reviewed composition to different source bytes. */
export function applyPhotoFraming(photo: PlayerPhoto, registry: PhotoFramingRegistry): void {
 const entry = registry.entries.find(item => item.sourceId === photo.sourceId && item.derivativeChecksum === derivativeChecksum(photo.url)
  && (item.sourceChecksum === undefined || item.sourceChecksum === (photo.sourceChecksum ?? photo.evidence?.sourceChecksum)));
 if (entry) photo.framing = { ...entry, schemaVersion: 1 };
 else delete photo.framing;
}
export function resolvePhotoFit(framing: PhotoFraming | undefined, era: CardEra): PhotoFit | undefined {
 return framing?.eras?.[era] ?? framing?.fit;
}
export function framingMatchesPhoto(photo: Record<string, unknown>): boolean {
 return photo.framing === undefined || (isPhotoFraming(photo.framing)
  && photo.framing.sourceId === photo.sourceId && photo.framing.derivativeChecksum === derivativeChecksum(String(photo.url))
  && (photo.framing.sourceChecksum === undefined || photo.framing.sourceChecksum === (photo.sourceChecksum ?? (record(photo.evidence) ? photo.evidence.sourceChecksum : undefined))));
}
function derivativeChecksum(url: string): string {
 return url.split('/').at(-1)?.replace(/\.webp$/, '') ?? '';
}
