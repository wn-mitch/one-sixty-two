import { createCardViewModel, type CardEra, type CardViewModel } from './view-model.ts';
import { loadDraftProfiles, loadManifest } from '#lib/game/data.ts';
import { isHitter } from '#lib/components/candidate-ranking.ts';
import { loadMedia } from '#lib/media/client.ts';
import { loadRankings } from '#lib/rankings/client.ts';

/** A headline season per era, so a workshop card shows a real photo, team and stat line. */
export const HEADLINE_SEASONS: readonly { era: CardEra; seasonId: string }[] = [
	{ era: '1950s', seasonId: 'mantlmi01:1956:AL:NYA' },
	{ era: '1960s', seasonId: 'mayswi01:1965:NL:SFN' },
	{ era: '1970s', seasonId: 'benchjo01:1972:NL:CIN' },
	{ era: '1980s', seasonId: 'schmimi01:1980:NL:PHI' },
	{ era: '1990s', seasonId: 'griffke02:1997:AL:SEA' },
	{ era: '2000s', seasonId: 'bondsba01:2001:NL:SFN' },
	{ era: '2010s', seasonId: 'troutmi01:2016:AL:LAA' },
	{ era: '2020s', seasonId: 'judgeaa01:2022:AL:NYA' }
];

/** Loads each era's headline season as a card, in era order. */
export async function loadHeadlineCards(): Promise<{ era: CardEra; model: CardViewModel }[]> {
	const manifest = await loadManifest();
	const [media, rankings] = await Promise.all([loadMedia().catch(() => null), loadRankings(manifest.dataVersion).catch(() => null)]);
	const candidates = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
	const picks = HEADLINE_SEASONS.map(({ seasonId }) => {
		const candidate = candidates.get(seasonId);
		if (!candidate) throw new Error(`${seasonId} is not in the dataset`);
		return { seasonId, franchiseId: candidate.franchiseId, decade: candidate.decade };
	});
	const profiles = await loadDraftProfiles(manifest, { picks } as Parameters<typeof loadDraftProfiles>[1]);
	return HEADLINE_SEASONS.map(({ era }, index) => {
		const profile = profiles[index]!;
		const slot = profile.eligibleSlots.find(isHitter) ?? profile.eligibleSlots[0]!;
		return { era, model: createCardViewModel({ profile, slot, manifest, media, rankings, mediaStatus: media ? 'ready' : 'unavailable' }) };
	});
}
