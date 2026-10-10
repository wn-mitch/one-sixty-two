import type { CardViewModel } from '../cards/view-model.ts';
import type { DEFENSE_METHOD_VERSION, MODEL_VERSION, ReplaySchemaVersion, RULES_VERSION, Slot, VALUATION_VERSION } from '../game/types.ts';
import type { ENVIRONMENT_VERSION, GEOMETRY_VERSION, Vec2 } from '../sim/park-types.ts';

/** The season shares as one image: the draft field card with the final record. */
export const SHARE_FORMATS = ['field'] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];

export function isShareFormat(value: unknown): value is ShareFormat {
	return typeof value === 'string' && SHARE_FORMATS.includes(value as ShareFormat);
}

export const SHARE_DIMENSIONS = {
	field: { width: 1080, height: 1350 }
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
	card: CardViewModel;
}

/**
 * Canonical, serializable input for every local preview and trusted capture.
 * Cards occur exactly once in canonical slot order. A local preview has null
 * replay/publication pins; a trusted publication supplies every pin.
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
