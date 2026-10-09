import type { Draft, Manifest, Profile, Slot } from './types.ts';
import type { WarRankings } from '../rankings/types.ts';
import type { SeasonResult } from '../sim/types.ts';

export interface TeamRank {
	rank: number;
	total: number;
	ties: number;
	best: boolean;
	worst: boolean;
}

export type AwardKey = 'mvp' | 'batting-title' | 'runs-allowed' | 'strikeouts' | 'lvp' | 'home-runs';
export type AwardTone = 'gold' | 'red';

export interface AwardChip {
	key: AwardKey;
	label: string;
	tone: AwardTone;
}

export interface AwardMetric extends AwardChip {
	rawValue: number;
	formattedValue: string;
}

export interface InspectionStat {
	key: string;
	label: string;
	formattedValue: string;
	rank: TeamRank | null;
}

export interface InspectionSeasonView {
	label: '162-0 season' | 'Actual season';
	rows: readonly InspectionStat[];
	awardChips: readonly AwardChip[];
}

export interface InspectionDetailRow {
	key: string;
	label: string;
	value: number | null;
	formattedValue: string;
}

export interface InspectionDetailSection {
	key: 'estimated-war' | 'realized-defense';
	label: string;
	rows: readonly InspectionDetailRow[];
	note: string;
}

export interface ResultsInspection {
	seasonId: string;
	slot: Slot;
	simulated: InspectionSeasonView;
	actual: InspectionSeasonView;
	details: readonly InspectionDetailSection[];
}

export interface ResultsCard {
	seasonId: string;
	slot: Slot;
	profile: Profile;
	estimatedWar: number | null;
	awards: readonly AwardChip[];
	inspection: ResultsInspection;
}

export interface FeaturedResult {
	card: ResultsCard;
	metrics: readonly AwardMetric[];
}

export interface ResultsModel {
	cards: readonly ResultsCard[];
	featured: readonly FeaturedResult[];
	rest: readonly ResultsCard[];
}

export interface CreateResultsModelInput {
	result: SeasonResult;
	draft: Draft;
	profiles: readonly Profile[];
	manifest: Manifest;
	rankings: WarRankings | null;
}
