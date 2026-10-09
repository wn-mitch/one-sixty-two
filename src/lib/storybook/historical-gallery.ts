import { loadGalleryCard, loadManifest } from '#lib/game/data.ts';
import { compareId } from '#lib/game/types.ts';
import type { Franchise, Manifest, Profile, Slot } from '#lib/game/types.ts';
import { loadMedia } from '#lib/media/client.ts';
import type { MediaManifest } from '#lib/media/types.ts';
import { loadRankings } from '#lib/rankings/client.ts';
import type { WarRankings } from '#lib/rankings/types.ts';
import type { CardMediaStatus } from '#lib/cards/view-model.ts';

export interface HistoricalGalleryPresentEntry {
	franchise: Franchise;
	state: 'present';
	profile: Profile;
	slot: Slot;
}

export interface HistoricalGalleryAbsentEntry {
	franchise: Franchise;
	state: 'absent';
}

export interface HistoricalGalleryErrorEntry {
	franchise: Franchise;
	state: 'error';
	message: string;
}

export type HistoricalGalleryEntry =
	| HistoricalGalleryPresentEntry
	| HistoricalGalleryAbsentEntry
	| HistoricalGalleryErrorEntry;

export interface HistoricalEraGalleryData {
	manifest: Manifest;
	entries: HistoricalGalleryEntry[];
	media: MediaManifest | null;
	mediaStatus: CardMediaStatus;
	rankings: WarRankings | null;
}

function missingGalleryMessage(franchise: Franchise, decade: number): string {
	return `Historical gallery card unavailable for ${franchise.name} in ${decade}s. Retry to load this season.`;
}


function franchisesForEra(manifest: Manifest, decade: number): Set<string> {
	const present = new Set<string>();
	for (const candidate of manifest.candidates) {
		if (candidate.decade === decade) present.add(candidate.franchiseId);
	}
	return present;
}


/**
 * Load one immutable historical era from the canonical dataset. Prepared
 * gallery-card failures are represented per franchise so successful teams
 * remain visible; optional media and WAR data never hide a loaded season.
 */
export async function loadHistoricalEra(decade: number): Promise<HistoricalEraGalleryData> {
	const manifest = await loadManifest();
	const franchises = [...manifest.franchises].sort((a, b) => compareId(a.id, b.id));
	const present = franchisesForEra(manifest, decade);
	const availability = Promise.allSettled([loadMedia(), loadRankings(manifest.dataVersion)]);
	const entries = await Promise.all(franchises.map(async franchise => {
		if (!present.has(franchise.id)) return { franchise, state: 'absent' } satisfies HistoricalGalleryAbsentEntry;
		try {
			const card = await loadGalleryCard(manifest, { franchiseId: franchise.id, decade });
			return { franchise, state: 'present', profile: card.profile, slot: card.slot } satisfies HistoricalGalleryPresentEntry;
		} catch (error) {
			const reason = error instanceof Error && error.message ? ` ${error.message}` : '';
			return { franchise, state: 'error', message: `${missingGalleryMessage(franchise, decade)}${reason}` } satisfies HistoricalGalleryErrorEntry;
		}
	}));

	const [mediaResult, rankingsResult] = await availability;
	const media = mediaResult.status === 'fulfilled' ? mediaResult.value : null;
	const rankings = rankingsResult.status === 'fulfilled' ? rankingsResult.value : null;
	return { manifest, entries, media, mediaStatus: media ? 'ready' : 'unavailable', rankings };
}