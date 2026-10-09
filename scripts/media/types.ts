import type { AtmospherePhoto, CaptureDate, MediaAsset, PhotoCrop, PhotoEvidence, PhotoUniform, PlayerMedia, TeamMedia } from '../../src/lib/media/types.ts';

export interface DataPointer {
	schemaVersion: 1;
	dataVersion: string;
	manifestUrl: string;
}

export interface DataManifest {
	dataVersion: string;
	candidates: Array<{ playerId: string; seasonId?: string; eligibleSlots?: string[]; franchiseId?: string; decade?: number }>;
	franchises: Array<{ id: string; name: string }>;
}

export interface DirectTeamLogoSource {
	source: 'direct';
	url: string;
	sourceUrl: string;
	license: string;
	licenseUrl: string;
	credit: string;
	checksum: string;
}

export interface TeamSourceEntry {
	name: string;
	color: string;
	current: { title: string } | DirectTeamLogoSource | null;
	historical: Array<{ title: string; firstYear: number; lastYear: number }>;
}

export type TeamSourceRegistry = Record<string, TeamSourceEntry>;

export interface AtmosphereSourceEntry {
	id: string;
	title: string;
	caption: string;
	franchiseId: string;
	year: number;
}

export type AtmosphereSourceRegistry = AtmosphereSourceEntry[];

export interface PlayerSourceEntry {
	title: string;
	captureYear: number;
	captureEvidenceUrl: string;
	identityEvidenceUrl: string;
}

export type PlayerSourceRegistry = Record<string, PlayerSourceEntry[]>;

export type ReviewedPlayerPhotos = Record<string, string[]>;

export interface CandidateIdentity {
	playerId: string;
	bbrefId: string;
	name: string;
	firstYear: number;
	lastYear: number;
	wikidataId?: string;
	commonsCategories?: string[];
}

export interface WikidataIdentity {
	bbrefId: string;
	entityId: string;
}

export interface WikidataPhoto {
	bbrefId: string;
	entityId: string;
	title: string;
}

export interface WikidataCategory {
	bbrefId: string;
	entityId: string;
	title: string;
}
export interface WikidataMedia {
	identities: WikidataIdentity[];
	photos: WikidataPhoto[];
	categories: WikidataCategory[];
}


export interface CommonsCategorySource {
	playerId: string;
	title: string;
	targetYears: number[];
}

export interface CommonsMetadata {
	title: string;
	pageId: number;
	width: number;
	height: number;
	mime: string;
	downloadUrl: string;
	sourceUrl: string;
	description?: string | null;
	dateOriginal: string | null;
	license: string | null;
	licenseUrl: string | null;
	credit: string | null;
	/** Provider-qualified identity; Commons page IDs remain available for legacy registries. */
	sourceId?: string;
	categories?: string[];
	rightsText?: string;
	/** Exact source bytes required for reviewed direct team marks. */
	pinSourceChecksum?: string;
}

export interface ApprovedPhotoReview {
	playerId: string;
	sourceId: string;
	status: 'approved';
	metadata: CommonsMetadata;
	captureDate: CaptureDate;
	uniform: Exclude<PhotoUniform, 'unclassified'>;
	context: 'playing' | 'later';
	franchiseId?: string;
	crop?: PhotoCrop;
	captureEvidenceUrl?: string;
	evidence: PhotoEvidence;
	/** Notes record what was inspected, including the underlying work's rights for reproductions. */
	notes: string;
	visualReview: true;
	rights: { kind: 'original' | 'reproduction'; underlyingRightsUrl?: string };
}
export interface RejectedPhotoReview {
	playerId: string;
	sourceId: string;
	status: 'rejected';
	reason: string;
	evidenceUrl: string;
}
export type PhotoReview = ApprovedPhotoReview | RejectedPhotoReview;

export interface PreparedAsset extends MediaAsset {
	filename: string;
}

export interface MediaPayload {
	teams: Record<string, TeamMedia>;
	players: Record<string, PlayerMedia>;
	atmosphere: Record<string, AtmospherePhoto>;
	diagnostics: {
		playersSearched: number;
		playersWithPhotos: number;
		photos: number;
		logos: number;
		historicalLogos: number;
		atmospherePhotos: number;
		excluded: number;
	};
}

export interface ExclusionCounts {
	missingPeople: number;
	missingBbref: number;
	missingCareer: number;
	missingWikidata: number;
	ambiguousIdentity: number;
	ambiguousSubject: number;
	missingCaptureYear: number;
	outsideCareer: number;
	unsupportedLicense: number;
	invalidMetadata: number;
	duplicatePhoto: number;
	missingLogo: number;
}
