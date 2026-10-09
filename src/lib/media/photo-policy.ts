import type { CaptureDate, PhotoCrop, PlayerPhoto } from './types.ts';

const validYear = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1800 && Number(value) <= 2100;

export function reusablePhotoLicense(value: string): boolean {
	return /^(?:CC (?:BY(?:-SA)?|ZERO)(?:[- ]\d+(?:\.\d+)?)?|public domain|CC0(?: 1\.0)?|PDM|PD(?:[- ].*)?)$/i.test(value.trim());
}

export function isCaptureDate(value: unknown): value is CaptureDate {
	if (!value || typeof value !== 'object') return false;
	const date = value as Record<string, unknown>;
	if (date.kind === 'unknown') return date.year === undefined && date.firstYear === undefined && date.lastYear === undefined;
	if (date.kind === 'exact' || date.kind === 'approximate') return validYear(date.year) && date.firstYear === undefined && date.lastYear === undefined;
	return date.kind === 'range' && validYear(date.firstYear) && validYear(date.lastYear) && date.firstYear <= date.lastYear && date.year === undefined;
}

export function isPhotoCrop(value: unknown): value is PhotoCrop {
	if (!value || typeof value !== 'object') return false;
	const crop = value as PhotoCrop;
	return [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
		&& crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0
		&& crop.x + crop.width <= 1 && crop.y + crop.height <= 1;
}

export function captureDate(photo: PlayerPhoto): CaptureDate {
	return photo.captureDate ?? (validYear(photo.year) ? { kind: 'exact', year: photo.year } : { kind: 'unknown' });
}

export function dateBounds(date: CaptureDate): [number, number] | null {
	if (date.kind === 'unknown') return null;
	return date.kind === 'range' ? [date.firstYear, date.lastYear] : [date.year, date.year];
}

export function captureLabel(photo: PlayerPhoto): string {
	const date = captureDate(photo);
	if (date.kind === 'unknown') return 'date unknown';
	if (date.kind === 'range') return `${date.firstYear}–${date.lastYear}`;
	return `${date.kind === 'approximate' ? 'c. ' : ''}${date.year}`;
}

export function exactSeason(photo: PlayerPhoto, year: number): boolean {
	const date = captureDate(photo);
	return date.kind === 'exact' && date.year === year && photo.context !== 'later';
}

export function photoContextLabel(photo: PlayerPhoto, year?: number): string {
	if (photo.context === 'later') return 'Later uniform photo';
	if (photo.uniform === 'minor') return 'Minor-league photo';
	if (photo.uniform === 'other') return 'Other baseball uniform';
	if (photo.uniform === 'mlb') return year !== undefined && exactSeason(photo, year) ? 'Selected season · MLB' : 'MLB photo';
	return year !== undefined && exactSeason(photo, year) ? 'Selected season' : 'Career photo';
}

export function photoLabel(photo: PlayerPhoto, year?: number): string {
	return `Photo ${captureLabel(photo)} · ${photoContextLabel(photo, year)}`;
}

/** Legacy approvals remain usable while awaiting classification, without inventing a uniform tier. */
export function photoTier(photo: PlayerPhoto, year: number): number {
	if (photo.review !== 'approved') return 5;
	if (photo.context === 'later') return 4;
	if (photo.uniform === 'minor') return 2;
	if (photo.uniform === 'other') return 3;
	if (photo.uniform !== 'mlb') return 5;
	const bounds = dateBounds(captureDate(photo));
	const decade = Math.floor(year / 10) * 10;
	return bounds && bounds[0] >= decade && bounds[1] < decade + 10 ? 0 : 1;
}

function distance(photo: PlayerPhoto, year: number): number {
	const bounds = dateBounds(captureDate(photo));
	return bounds ? Math.max(bounds[0] - year, year - bounds[1], 0) : Infinity;
}

/** Date proximity precedes team and quality; source identity makes ties independent of provider order. */
export function comparePhotos(a: PlayerPhoto, b: PlayerPhoto, year: number, franchiseId?: string): number {
	const tier = photoTier(a, year) - photoTier(b, year);
	if (tier) return tier;
	const da = distance(a, year), db = distance(b, year);
	if (da !== db) return da < db ? -1 : 1;
	const team = Number(!!franchiseId && b.franchiseId === franchiseId) - Number(!!franchiseId && a.franchiseId === franchiseId);
	if (team) return team;
	const quality = Math.min(b.width, b.height) - Math.min(a.width, a.height) || b.width * b.height - a.width * a.height;
	if (quality) return quality;
	const aid = a.sourceId ?? a.sourceUrl, bid = b.sourceId ?? b.sourceUrl;
	return aid < bid ? -1 : aid > bid ? 1 : a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
}
