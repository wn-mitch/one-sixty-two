export interface MediaAsset {
 url: string;
 width: number;
 height: number;
 sourceUrl: string;
 license: string;
 licenseUrl: string;
 credit: string;
 sourceChecksum?: string;
}
export interface PlayerPhoto extends MediaAsset {
 framing?: PhotoFraming;
 /** Present only for an exact capture year; publication and upload dates are not capture dates. */
 year?: number;
 captureDate?: CaptureDate;
 sourceId?: string;
 uniform?: PhotoUniform;
 context?: 'playing' | 'later' | 'unclassified';
 franchiseId?: string;
 review?: 'approved' | 'legacy';
 evidence?: PhotoEvidence;
 crop?: PhotoCrop;
 captureEvidenceUrl?: string;
 identityEvidenceUrl?: string;
}
export type CaptureDate =
 | { kind: 'exact'; year: number }
 | { kind: 'approximate'; year: number }
 | { kind: 'range'; firstYear: number; lastYear: number }
 | { kind: 'unknown' };
export type PhotoUniform = 'mlb' | 'minor' | 'other' | 'unclassified';
/** Fractions of the auto-oriented source image, before resizing. */
export interface PhotoCrop { x: number; y: number; width: number; height: number }
export type PhotoSubtype = 'tight-headshot' | 'head-and-shoulders' | 'upper-body-portrait' | 'upper-body-action' | 'full-body-portrait' | 'full-body-action' | 'team-group';
export interface PhotoPoint { x: number; y: number }
export interface PhotoFit {
 mode: 'cover' | 'contain';
 position: PhotoPoint;
 /** Optional display-only crop in published derivative coordinates; source bytes stay unchanged. */
 displayCrop?: PhotoCrop;
}
/** Coordinates refer to the published derivative, after any approved source crop. */
export interface PhotoFraming {
 schemaVersion: 1;
 sourceId: string;
 sourceChecksum?: string;
 derivativeChecksum: string;
 subtype: PhotoSubtype;
 subjectBounds: PhotoCrop;
 focalPoint: PhotoPoint;
 fit: PhotoFit;
 eras?: Partial<Record<import('../cards/era.ts').CardEra, PhotoFit>>;
 notes?: string;
}
export interface PhotoFramingRegistry { schemaVersion: 1; entries: Omit<PhotoFraming, 'schemaVersion'>[] }
export interface PhotoEvidence {
 identityUrl: string;
 uniformUrl: string;
 contextUrl: string;
 rightsUrl: string;
 rightsBasis: string;
 sourceChecksum: string;
 snapshotChecksum: string;
}
export interface HistoricalLogo extends MediaAsset { firstYear: number; lastYear: number }
/** A reviewed group photograph; it does not identify the members of a simulated relief pool. */
export interface TeamPhoto extends PlayerPhoto {
 subject: 'team';
 caption: string;
 franchiseId: string;
 review: 'approved';
}
export interface AtmospherePhoto extends MediaAsset {
 id: string;
 caption: string;
 franchiseId: string;
 year: number;
}
export interface TeamMedia {
 name: string;
 color: string;
 logo: MediaAsset | null;
 historical: HistoricalLogo[];
 photos?: TeamPhoto[];
}
export interface PlayerMedia {
 name: string;
 firstYear: number;
 lastYear: number;
 photos: PlayerPhoto[];
}
export interface MediaManifest {
 schemaVersion: 2 | 3;
 version: string;
 dataVersion: string;
 modifications: string;
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
export interface MediaPointer { schemaVersion: 2 | 3; version: string; manifestUrl: string }
