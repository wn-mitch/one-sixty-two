import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCardViewModel } from '../../src/lib/cards/view-model.ts';
import type { Manifest, Profile, SimulationData } from '../../src/lib/game/types.ts';
import type { MediaManifest } from '../../src/lib/media/types.ts';
import { selectPhoto, selectTeamPhoto } from '../../src/lib/media/client.ts';
import type { WarRankings } from '../../src/lib/rankings/types.ts';
import { atomicWrite } from './cache.ts';
import { canonicalJSON } from '../data/compile.ts';

/** Compute priorities from the actual card finish and photo selectors, including added seasons. */
export async function cardPhotoPriorities(root: string, media: MediaManifest) {
	const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(join(root, path), 'utf8'));
	const dataPointer = await json<{ manifestUrl: string }>('static/data/current.json');
	const rankingsPointer = await json<{ manifestUrl: string }>('static/rankings/current.json');
	const data = await json<Manifest>(`static${dataPointer.manifestUrl}`);
	const rankings = await json<WarRankings>(`static${rankingsPointer.manifestUrl}`);
	const simulation = await json<SimulationData>(`static${data.simulationUrl}`);
	if (data.dataVersion !== media.dataVersion || rankings.dataVersion !== data.dataVersion) throw new Error('Card photo audit requires matching current data, rankings and media');
	const candidates = new Set(data.candidates.map(candidate => candidate.seasonId));
	const profiles = (await Promise.all(Object.values(data.chunks).map(url => json<Profile[]>(`static${url}`)))).flat();
	const gems = [], remainders = [];
	for (const profile of profiles) {
		if (profile.bullpen) {
			const photo = selectTeamPhoto(media, profile.franchiseId, profile.year);
			remainders.push({ seasonId: profile.seasonId, franchiseId: profile.franchiseId, year: profile.year,
				sourceId: photo?.sourceId ?? null, captureDate: photo?.captureDate ?? null, hasPhoto: !!photo });
			continue;
		}
		if (!candidates.has(profile.seasonId)) continue;
		const gem = profile.eligibleSlots.some(slot => createCardViewModel({ profile, slot, rankings }).fin.gem);
		if (!gem) continue;
		const photo = selectPhoto(media, profile.playerId, profile.year, profile.franchiseId);
		gems.push({ playerId: profile.playerId, name: profile.displayName, seasonId: profile.seasonId,
			franchiseId: profile.franchiseId, year: profile.year, hasPhoto: !!photo,
			reviewedUniform: photo?.review === 'approved', sourceId: photo?.sourceId ?? null,
			blocker: !photo ? 'No approved photo' : photo.review !== 'approved' ? 'Uniform classification awaiting review' : null });
	}
	const players = [...new Set(gems.map(card => card.playerId))].map(playerId => {
		const cards = gems.filter(card => card.playerId === playerId);
		return { playerId, name: cards[0].name, cards: cards.length, hasPhoto: cards.every(card => card.hasPhoto), reviewedUniform: cards.every(card => card.reviewedUniform) };
	}).sort((a, b) => Number(a.hasPhoto) - Number(b.hasPhoto) || Number(a.reviewedUniform) - Number(b.reviewedUniform) || b.cards - a.cards || a.playerId.localeCompare(b.playerId, 'en'));
	const opponentRemainders = simulation.opponents.map(({ bullpen }) => {
		const photo = selectTeamPhoto(media, bullpen.franchiseId, bullpen.year);
		return { seasonId: bullpen.seasonId, franchiseId: bullpen.franchiseId, year: bullpen.year,
			sourceId: photo?.sourceId ?? null, captureDate: photo?.captureDate ?? null, hasPhoto: !!photo };
	});
	return { dataVersion: data.dataVersion, mediaVersion: media.version, summary: {
		gemCards: gems.length, gemPlayers: players.length, blankGemPlayers: players.filter(player => !player.hasPhoto).length,
		unclassifiedGemPlayers: players.filter(player => player.hasPhoto && !player.reviewedUniform).length,
		reviewedUniformGemCards: gems.filter(card => card.reviewedUniform).length,
		remainderCards: remainders.length, coveredRemainderCards: remainders.filter(card => card.hasPhoto).length,
		opponentRemainders: opponentRemainders.length, coveredOpponentRemainders: opponentRemainders.filter(card => card.hasPhoto).length,
		teamPhotos: Object.values(media.teams).reduce((sum, team) => sum + (team.photos?.length ?? 0), 0)
	}, players, gems, remainders, opponentRemainders, leagueRemainder: { seasonId: simulation.bullpen.seasonId,
		hasPhoto: false, reason: 'The league-wide relief pool does not represent one franchise.' } };
}

export async function auditCardPhotos(root: string, media: MediaManifest) {
	const priorities = await cardPhotoPriorities(root, media);
	await atomicWrite(join(root, '.cache/media/audit/card-priorities.json'), `${canonicalJSON(priorities)}\n`);
	return priorities.summary;
}
