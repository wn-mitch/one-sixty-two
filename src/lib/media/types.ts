export interface MediaAsset {
 url: string;
 width: number;
 height: number;
 sourceUrl: string;
 license: string;
 licenseUrl: string;
 credit: string;
}
export interface PlayerPhoto extends MediaAsset {
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
