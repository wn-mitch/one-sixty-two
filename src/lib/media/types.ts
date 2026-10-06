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
 year: number;
 captureEvidenceUrl?: string;
 identityEvidenceUrl?: string;
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
 schemaVersion: 2;
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
export interface MediaPointer { schemaVersion: 2; version: string; manifestUrl: string }
