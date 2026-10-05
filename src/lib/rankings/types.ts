export interface WarRankingSource {
	name: string;
	url: string;
	licenceUrl: string;
	licenceText: string;
	commit: string;
	description: string;
}

export interface WarSeasonRanking {
	battingWAR162: number | null;
	pitchingWAR162: number | null;
}

export interface WarRankings {
	schemaVersion: 1;
	dataVersion: string;
	rankingVersion: string;
	source: WarRankingSource;
	seasons: Record<string, WarSeasonRanking>;
	coverage: {
		candidates: number;
		batting: number;
		pitching: number;
		missing: number;
	};
}

export interface WarRankingsPointer {
	schemaVersion: 1;
	dataVersion: string;
	rankingVersion: string;
	manifestUrl: string;
}
