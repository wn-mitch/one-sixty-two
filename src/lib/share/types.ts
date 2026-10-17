import type { CardViewModel } from '../cards/view-model.ts';
import type { DEFENSE_METHOD_VERSION, MODEL_VERSION, ReplaySchemaVersion, RULES_VERSION, Slot, VALUATION_VERSION } from '../game/types.ts';
import type { ENVIRONMENT_VERSION, GEOMETRY_VERSION, Vec2 } from '../sim/park-types.ts';

/** The player picks between two share images: the roster on the home park's field, and a fan of large cards. */
export const SHARE_FORMATS = ['field', 'fan'] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];

/** Every published season stores both share images plus a landscape link preview used only for `og:image`. */
export const PUBLISHED_FORMATS = [...SHARE_FORMATS, 'og'] as const;
export type PublishedFormat = (typeof PUBLISHED_FORMATS)[number];

export function isShareFormat(value: unknown): value is ShareFormat {
	return typeof value === 'string' && SHARE_FORMATS.includes(value as ShareFormat);
}

export const SHARE_DIMENSIONS = {
	field: { width: 1080, height: 1920 },
	fan: { width: 1080, height: 1920 },
	og: { width: 1200, height: 630 }
} as const satisfies Record<PublishedFormat, { width: number; height: number }>;

export type ShareAction = 'challenge' | 'copy-link' | 'download' | 'copy-image';

export interface ShareRecord {
	wins: number;
	losses: number;
	firstLoss: number | null;
	longestWinningStreak: number;
	runsFor: number;
	runsAgainst: number;
}

export interface ShareStadium {
	id: string;
	version: string;
	name: string;
	geometryVersion: typeof GEOMETRY_VERSION;
	environmentVersion: typeof ENVIRONMENT_VERSION;
	franchiseId: string;
	/** Fair outline from pole to pole in meters, drawn as the field's fence. */
	outline: readonly Vec2[];
	/** Measured fence distances printed on the nameplate. */
	dimensions: readonly { bearingDeg: number; distanceFt: number }[];
	/** The franchise colour that grounds the field card, when media is pinned. */
	color: string | null;
	/** The park photo on the field's stadium card, when media is pinned. */
	photo: { url: string; width: number; height: number } | null;
}

export interface ShareRenderCard {
	seasonId: string;
	slot: Slot;
	/** 1-based position in the order the card was drafted. */
	pickNumber: number;
	/** WAR per 162 games in the card's role from the current rankings, or null without them. */
	war: number | null;
	card: CardViewModel;
}

/**
 * Canonical, serializable input for the local preview and the published capture.
 * Cards occur exactly once in canonical slot order.
 */
export interface ShareRenderModel {
	schemaVersion: 2;
	replaySchemaVersion: ReplaySchemaVersion;
	modelVersion: typeof MODEL_VERSION;
	rulesVersion: typeof RULES_VERSION;
	dataVersion: string;
	defenseMethodVersion: typeof DEFENSE_METHOD_VERSION;
	valuationVersion: typeof VALUATION_VERSION;
	homeStadium: ShareStadium;
	mediaVersion: string | null;
	rankingVersion: string | null;
	record: ShareRecord;
	cards: readonly ShareRenderCard[];
	/** Season ids of the nine hitters in batting order and the three starters in rotation order. */
	battingOrder: readonly string[];
	starterOrder: readonly string[];
	/** The daily run's day, `YYYY-MM-DD`; absent for any other season. */
	daily?: string;
}

export interface SharePublicationImage {
	url: string;
	width: number;
	height: number;
	sha256: string;
}

export interface SharePublication {
	schemaVersion: 3;
	replayId: string;
	replayUrl: string;
	record: ShareRecord;
	images: Record<PublishedFormat, SharePublicationImage>;
}
