import type { CardViewModel } from '../cards/view-model.ts';
import type { ReplaySchemaVersion, Slot } from '../game/types.ts';

export const SHARE_FORMATS = ['scorecard', 'diamond', 'wide'] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];

export function isShareFormat(value: unknown): value is ShareFormat {
	return typeof value === 'string' && SHARE_FORMATS.includes(value as ShareFormat);
}

export const SHARE_DIMENSIONS = {
	scorecard: { width: 1080, height: 1350 },
	diamond: { width: 1080, height: 1350 },
	wide: { width: 1200, height: 630 }
} as const satisfies Record<ShareFormat, { width: number; height: number }>;

export type ShareAction = 'challenge' | 'copy-link' | 'download' | 'copy-image';

export interface ShareRecord {
	wins: number;
	losses: number;
	firstLoss: number | null;
	longestWinningStreak: number;
	runsFor: number;
	runsAgainst: number;
}

export interface ShareRenderCard {
	seasonId: string;
	slot: Slot;
	card: CardViewModel;
}

/**
 * Canonical, serializable input for every local preview and trusted capture.
 * Cards occur exactly once in canonical slot order. A local preview has null
 * replay/publication pins; a trusted publication supplies every pin.
 */
export interface ShareRenderModel {
	schemaVersion: 1;
	replaySchemaVersion: ReplaySchemaVersion;
	modelVersion: 'pa-v3';
	dataVersion: string;
	defenseMethodVersion: 'defense-v1';
	valuationVersion: 'sim-war-v1';
	mediaVersion: string | null;
	rankingVersion: string | null;
	rendererVersion: string | null;
	replayId: string | null;
	replayUrl: string | null;
	record: ShareRecord;
	cards: readonly ShareRenderCard[];
}

export interface SharePublicationImage {
	url: string;
	width: number;
	height: number;
	sha256: string;
}

export interface SharePublication {
	schemaVersion: 1;
	replayId: string;
	replayUrl: string;
	modelDigest: string;
	record: ShareRecord;
	images: Record<ShareFormat, SharePublicationImage>;
}
