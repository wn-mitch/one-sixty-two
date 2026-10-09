import type { CsvRow } from '../data/acquire.ts';
import { reusablePhotoLicense } from '../../src/lib/media/photo-policy.ts';
import type {
	CandidateIdentity,
	CommonsMetadata,
	DataManifest,
	ExclusionCounts,
	TeamSourceRegistry,
	WikidataCategory,
	WikidataIdentity,
	WikidataPhoto
} from './types.ts';

const YEAR_DATE = /^(\d{4})(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?(?:(?:T| )(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/;
const MULTI_SUBJECT_TITLE = /\b(?:and|versus|vs\.?)\b|(?:^|[\s_-])&(?:[\s_-]|$)/i;
const MULTI_SUBJECT_DESCRIPTION = /\((?:left|right|center|centre|middle)\)|\b(?:flanked by|pictured with|poses? with|alongside|shaking hands with|players (?:line|lining) up|group (?:photo|photograph)|team (?:photo|photograph))\b/i;
const MEMORABILIA_SUBJECT = /\b(?:baseball|trading|sports)\s+card\b|\b(?:autograph(?:ed)?|memorabilia|plaque|statue|bobblehead|figurine|magazine cover|program cover|bowman gum|topps|fleer|donruss|upper deck|panini)\b/i;

export function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

export function emptyExclusions(): ExclusionCounts {
	return {
		missingPeople: 0,
		missingBbref: 0,
		missingCareer: 0,
		missingWikidata: 0,
		ambiguousIdentity: 0,
		ambiguousSubject: 0,
		missingCaptureYear: 0,
		outsideCareer: 0,
		unsupportedLicense: 0,
		invalidMetadata: 0,
		duplicatePhoto: 0,
		missingLogo: 0
	};
}

export function parseCaptureYear(value: string | null): number | null {
	if (!value) return null;
	const match = value.trim().match(YEAR_DATE);
	if (!match) return null;
	const year = Number(match[1]);
	return Number.isInteger(year) && year >= 1800 && year <= 2100 ? year : null;
}

export function isReusableLicense(value: string | null): boolean {
	if (!value) return false;
	const normalized = stripMarkup(value);
	return reusablePhotoLicense(normalized);
}

export function normalizeLicenseUrl(license: string, value: string | null): string {
	const url = value ? stripMarkup(value) : '';
	if (/^https:\/\//.test(url)) return url;
	if (/^CC0/i.test(license)) return 'https://creativecommons.org/publicdomain/zero/1.0/';
	if (/^CC BY-SA (\d\.\d)$/i.test(license)) {
		const version = license.match(/(\d\.\d)$/)?.[1];
		return `https://creativecommons.org/licenses/by-sa/${version}/`;
	}
	if (/^CC BY (\d\.\d)$/i.test(license)) {
		const version = license.match(/(\d\.\d)$/)?.[1];
		return `https://creativecommons.org/licenses/by/${version}/`;
	}
	return 'https://commons.wikimedia.org/wiki/Commons:Copyright_tags/Public_domain';
}

export function stripMarkup(value: string): string {
	return value
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/&quot;/gi, '"')
		.replace(/&apos;|&#39;/gi, "'")
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

export function toWikidataBbrefId(bbrefId: string): string | null {
	const value = bbrefId.trim().toLowerCase();
	if (/^[a-z]\/(?:o')?[a-z]{4,7}\.?\d{2}$/.test(value)) return value;
	if (/^(?:o')?[a-z]{4,7}\.?\d{2}$/.test(value)) return `${value[0]}/${value}`;
	return null;
}

export function buildCandidateIdentities(
	manifest: DataManifest,
	people: CsvRow[],
	batting: CsvRow[],
	pitching: CsvRow[],
	excluded: ExclusionCounts
): CandidateIdentity[] {
	const candidateIds = new Set(manifest.candidates
		.filter((candidate) => !candidate.eligibleSlots?.includes('BP'))
		.map((candidate) => candidate.playerId));
	const peopleById = new Map(people.map((row) => [row.playerID, row]));
	const career = new Map<string, { firstYear: number; lastYear: number }>();
	const careerRows = [batting, pitching];
	for (const rows of careerRows) {
		for (const row of rows) {
			if (!candidateIds.has(row.playerID)) continue;
			const year = Number(row.yearID);
			if (!Number.isInteger(year)) continue;
			const current = career.get(row.playerID);
			if (current) {
				current.firstYear = Math.min(current.firstYear, year);
				current.lastYear = Math.max(current.lastYear, year);
			} else {
				career.set(row.playerID, { firstYear: year, lastYear: year });
			}
		}
	}

	const identities: CandidateIdentity[] = [];
	for (const playerId of [...candidateIds].sort(compareText)) {
		const person = peopleById.get(playerId);
		if (!person) {
			excluded.missingPeople++;
			continue;
		}
		const bbrefId = toWikidataBbrefId(person.bbrefID ?? '');
		if (!bbrefId) {
			excluded.missingBbref++;
		}
		const years = career.get(playerId);
		if (!years) {
			excluded.missingCareer++;
			continue;
		}
		const name = `${person.nameFirst ?? ''} ${person.nameLast ?? ''}`.replace(/\s+/g, ' ').trim();
		if (!name) {
			excluded.missingPeople++;
			continue;
		}
		identities.push({ playerId, bbrefId: bbrefId ?? '', name, ...years });
	}
	return identities;
}

export function groupVerifiedWikidataMedia(
	identities: CandidateIdentity[],
	photos: WikidataPhoto[],
	categories: WikidataCategory[],
	excluded: ExclusionCounts,
	resolvedIdentities: WikidataIdentity[]
): { photos: Map<string, WikidataPhoto[]>; categories: Map<string, WikidataCategory[]> } {
	const photosByBbref = new Map<string, WikidataPhoto[]>();
	for (const photo of photos) {
		const list = photosByBbref.get(photo.bbrefId) ?? [];
		list.push(photo);
		photosByBbref.set(photo.bbrefId, list);
	}
	const categoriesByBbref = new Map<string, WikidataCategory[]>();
	for (const category of categories) {
		const list = categoriesByBbref.get(category.bbrefId) ?? [];
		list.push(category);
		categoriesByBbref.set(category.bbrefId, list);
	}
	const identitiesByBbref = new Map<string, WikidataIdentity[]>();
	for (const resolved of resolvedIdentities) {
		const list = identitiesByBbref.get(resolved.bbrefId) ?? [];
		list.push(resolved);
		identitiesByBbref.set(resolved.bbrefId, list);
	}
	const photoResults = new Map<string, WikidataPhoto[]>();
	const categoryResults = new Map<string, WikidataCategory[]>();
	for (const identity of identities) {
		const matchingPhotos = photosByBbref.get(identity.bbrefId) ?? [];
		const matchingCategories = categoriesByBbref.get(identity.bbrefId) ?? [];
		const entityIds = new Set<string>();
		const resolved = identitiesByBbref.get(identity.bbrefId) ?? [];
		for (const item of resolved) entityIds.add(item.entityId);
		if (!entityIds.size) {
			excluded.missingWikidata++;
			continue;
		}
		if (entityIds.size !== 1) {
			excluded.ambiguousIdentity++;
			continue;
		}
		const photoTitles = new Map(matchingPhotos.map((photo) => [photo.title, photo]));
		const categoryTitles = new Map(matchingCategories.map((category) => [category.title, category]));
		photoResults.set(identity.playerId, [...photoTitles.values()].sort((a, b) => compareText(a.title, b.title)));
		categoryResults.set(identity.playerId, [...categoryTitles.values()].sort((a, b) => compareText(a.title, b.title)));
	}
	return { photos: photoResults, categories: categoryResults };
}

export function validateReusableAsset(
	metadata: CommonsMetadata,
	excluded: ExclusionCounts
): { license: string; licenseUrl: string; credit: string } | null {
	const license = metadata.license ? stripMarkup(metadata.license) : '';
	if (!isReusableLicense(license)) {
		excluded.unsupportedLicense++;
		return null;
	}
	const credit = metadata.credit ? stripMarkup(metadata.credit) : '';
	if (!credit || metadata.width <= 0 || metadata.height <= 0 || !metadata.downloadUrl) {
		excluded.invalidMetadata++;
		return null;
	}
	return { license, licenseUrl: normalizeLicenseUrl(license, metadata.licenseUrl), credit };
}

function validatePlayerSubject(metadata: CommonsMetadata, excluded: ExclusionCounts): boolean {
	if (!/^image\/(?:jpeg|png|tiff|webp|gif)$/i.test(metadata.mime)) {
		excluded.invalidMetadata++;
		return false;
	}
	const title = metadata.title.replace(/\.[^.]+$/, '');
	const description = metadata.description ? stripMarkup(metadata.description) : '';
	if (
		MULTI_SUBJECT_TITLE.test(title) ||
		MULTI_SUBJECT_DESCRIPTION.test(description) ||
		MEMORABILIA_SUBJECT.test(`${title}\n${description}\n${metadata.credit ?? ''}`)
	) {
		excluded.ambiguousSubject++;
		return false;
	}
	return true;
}

export function validatePlayerPhoto(
	metadata: CommonsMetadata,
	firstYear: number,
	lastYear: number,
	excluded: ExclusionCounts
): { year: number; license: string; licenseUrl: string; credit: string } | null {
	if (!validatePlayerSubject(metadata, excluded)) return null;
	const year = parseCaptureYear(metadata.dateOriginal);
	if (year === null) {
		excluded.missingCaptureYear++;
		return null;
	}
	if (year < firstYear || year > lastYear) {
		excluded.outsideCareer++;
		return null;
	}
	const asset = validateReusableAsset(metadata, excluded);
	return asset ? { year, ...asset } : null;
}

export function validateCuratedPlayerPhoto(
	metadata: CommonsMetadata,
	captureYear: number,
	firstYear: number,
	lastYear: number,
	excluded: ExclusionCounts
): { year: number; license: string; licenseUrl: string; credit: string } | null {
	if (!validatePlayerSubject(metadata, excluded)) return null;
	if (!Number.isInteger(captureYear) || captureYear < 1800 || captureYear > 2100) {
		excluded.invalidMetadata++;
		return null;
	}
	const metadataDate = metadata.dateOriginal?.trim() ?? '';
	const metadataYear = parseCaptureYear(metadata.dateOriginal);
	if (metadataDate && metadataYear === null) {
		excluded.missingCaptureYear++;
		return null;
	}
	if (metadataYear !== null && metadataYear !== captureYear) {
		excluded.invalidMetadata++;
		return null;
	}
	if (captureYear < firstYear || captureYear > lastYear) {
		excluded.outsideCareer++;
		return null;
	}
	const asset = validateReusableAsset(metadata, excluded);
	return asset ? { year: captureYear, ...asset } : null;
}

export function validateTeamSources(
	registry: TeamSourceRegistry,
	franchises: DataManifest['franchises']
): void {
	const required = new Set(franchises.map((franchise) => franchise.id));
	const supplied = Object.keys(registry);
	const missing = [...required].filter((id) => !(id in registry)).sort(compareText);
	const extra = supplied.filter((id) => !required.has(id)).sort(compareText);
	if (missing.length || extra.length) {
		throw new Error(
			`Team media registry keys do not match the thirty current franchises (missing ${missing.length}, extra ${extra.length})`
		);
	}
	if (required.size !== 30) throw new Error(`Expected thirty current franchises, received ${required.size}`);
	for (const [franchiseId, entry] of Object.entries(registry)) {
		if (!entry.name.trim() || !/^#[0-9a-f]{6}$/i.test(entry.color)) {
			throw new Error(`Invalid team metadata for franchise ${franchiseId}`);
		}
		const current = entry.current;
		if (current && 'source' in current) {
			if (current.source !== 'direct' || !/^https:\/\/\S+$/.test(current.url)
				|| !/^https:\/\/\S+$/.test(current.sourceUrl) || !current.license.trim()
				|| !/^https:\/\/\S+$/.test(current.licenseUrl) || !current.credit.trim()
				|| !/^[a-f0-9]{64}$/.test(current.checksum)) {
				throw new Error(`Invalid direct team logo source for franchise ${franchiseId}`);
			}
		} else if (current && (!current.title.trim() || current.title.startsWith('File:'))) {
			throw new Error(`Invalid Commons title for franchise ${franchiseId}`);
		}
		for (const source of entry.historical) {
			if (!source.title.trim() || source.title.startsWith('File:')) {
				throw new Error(`Invalid Commons title for franchise ${franchiseId}`);
			}
		}
		for (const source of entry.historical) {
			if (!Number.isInteger(source.firstYear) || !Number.isInteger(source.lastYear) || source.firstYear > source.lastYear) {
				throw new Error(`Invalid historical logo range for franchise ${franchiseId}`);
			}
		}
	}
}
