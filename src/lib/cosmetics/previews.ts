import { finishFor, type Finish } from '../cards/finish.ts';
import { createCardViewModel, type CardMediaStatus, type CardViewModel } from '../cards/view-model.ts';
import { loadChunk } from '../game/data.ts';
import { HITTER_SLOTS, type Candidate, type Manifest, type RosterSlot } from '../game/types.ts';
import type { MediaManifest } from '../media/types.ts';
import type { WarRankings } from '../rankings/types.ts';

/** One authentic hitter per era, already in the selected tier. Previewing never promotes a card. */
export async function previewCards(tier: Finish, manifest: Manifest, rankings: WarRankings, media: MediaManifest | null, mediaStatus: CardMediaStatus): Promise<CardViewModel[]> {
	const samples = new Map<number, { candidate: Candidate; slot: RosterSlot; war: number }>();
	for (const candidate of manifest.candidates) {
		const slot = candidate.eligibleSlots.find(value => (HITTER_SLOTS as readonly string[]).includes(value));
		const ranking = rankings.seasons[candidate.seasonId];
		if (!slot || !ranking || finishFor('hitter', ranking.battingWAR162, ranking.pitchingWAR162) !== tier) continue;
		const war = Math.max(ranking.battingWAR162 ?? -Infinity, ranking.pitchingWAR162 ?? -Infinity);
		const previous = samples.get(candidate.decade);
		if (!previous || war > previous.war) samples.set(candidate.decade, { candidate, slot, war });
	}
	return Promise.all([...samples.values()].sort((a, b) => b.candidate.decade - a.candidate.decade).map(async ({ candidate, slot }) => {
		const profiles = await loadChunk(manifest, candidate);
		const profile = profiles.find(value => value.seasonId === candidate.seasonId);
		if (!profile) throw new Error('The preview card is missing from the current dataset.');
		return createCardViewModel({ profile, slot, manifest, rankings, media, mediaStatus });
	}));
}
