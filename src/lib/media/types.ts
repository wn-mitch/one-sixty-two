export interface MediaAsset {
 url: string;
 width: number;
 height: number;
 sourceUrl: string;
 license: string;
 licenseUrl: string;
 credit: string;
}
export interface PlayerPhoto extends MediaAsset { year: number }
export interface HistoricalLogo extends MediaAsset { firstYear: number; lastYear: number }
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
 schemaVersion: 1;
 version: string;
 dataVersion: string;
 modifications: string;
 teams: Record<string, TeamMedia>;
 players: Record<string, PlayerMedia>;
 diagnostics: { playersSearched: number; playersWithPhotos: number; photos: number; logos: number; historicalLogos: number; excluded: number };
}
export interface MediaPointer { schemaVersion: 1; version: string; manifestUrl: string }
