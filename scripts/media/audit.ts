import { join } from 'node:path';
import { canonicalJSON } from '../data/compile.ts';
import { selectPhoto } from '../../src/lib/media/client.ts';
import { photoTier } from '../../src/lib/media/photo-policy.ts';
import type { MediaManifest, MediaPointer } from '../../src/lib/media/types.ts';
import { atomicWrite } from './cache.ts';
import { isReusableLicense } from './logic.ts';
import { readAcquisitions, readJson, readResearch, searchComplete, sourceKey } from './research.ts';
import type { CandidateAcquisition, PhotoCandidate, ResearchContext, PlayerResearch } from './research.ts';
import type { PhotoReview } from './types.ts';

interface AuditPlayer {
	playerId: string;
	name: string;
	hasPhoto: boolean;
	classified: number;
	legacy: number;
	searches: PlayerResearch['searches'];
	blockers: string[];
	candidates: Array<{ sourceId: string; title: string; sourceUrl: string; blockers: string[] }>;
}

export function candidateBlockers(candidate: PhotoCandidate, review?: PhotoReview, acquisition?: CandidateAcquisition, published = false): string[] {
	if (review?.status === 'rejected') return [`rejected: ${review.reason}`];
	if (review?.status === 'approved' && published) return [];
	const reasons = [review?.status === 'approved' ? 'approved image awaiting compilation' : 'unreviewed identity, uniform, context and crop'];
	if (acquisition?.status === 'failed') reasons.push(`acquisition failure: ${acquisition.reason ?? 'image unavailable'}`);
	if (review?.status === 'approved') return reasons;
	if (!candidate.metadata) reasons.push('original-source rights and image acquisition unverified');
	else {
		if (!isReusableLicense(candidate.metadata.license)) reasons.push('incompatible or undocumented license');
		if (!/^image\/(jpeg|png|webp|tiff|gif)$/.test(candidate.metadata.mime)) reasons.push('unsuitable media type');
		if (!candidate.metadata.dateOriginal) reasons.push('capture date unknown (eligible fallback)');
	}
	return reasons;
}

export async function auditMedia(context: ResearchContext): Promise<Record<string, unknown>> {
	const baselinePointer = await readJson<MediaPointer>(join(context.cacheDir, 'audit/baseline-pointer.json')).catch(error => {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		return null;
	});
	const baseline = baselinePointer ? await readJson<MediaManifest>(join(context.root, 'static', baselinePointer.manifestUrl)) : context.media;
	const candidates = context.data.candidates.filter(candidate => !candidate.eligibleSlots?.includes('BP'));
	const identities = new Map(context.identities.map(identity => [identity.playerId, identity]));
	const reviews = new Map(context.reviews.map(review => [`${review.playerId}\0${review.sourceId}`, review]));
	const researchSourceUrls = new Map<string, string[]>();
	const reviewsByPlayer = new Map<string, PhotoReview[]>();
	for (const review of context.reviews) {
		const entries = reviewsByPlayer.get(review.playerId) ?? []; entries.push(review); reviewsByPlayer.set(review.playerId, entries);
	}
	const playerRecords: AuditPlayer[] = [];
	for (const id of [...new Set(candidates.map(candidate => candidate.playerId))].sort()) {
		const identity = identities.get(id);
		const research = identity ? await readResearch(context, identity) : null;
		const acquisitions = await readAcquisitions(context.cacheDir, id);
		for (const candidate of research?.candidates ?? []) researchSourceUrls.set(candidate.sourceId,
			[candidate.sourceUrl, ...(candidate.metadata ? [candidate.metadata.sourceUrl] : [])].map(sourceKey));
		const photos = context.media.players[id]?.photos ?? [];
		const playerReviews = reviewsByPlayer.get(id) ?? [];
		const blockers = !identity ? ['missing statistical identity'] : !research?.candidates.length && !playerReviews.length ? ['no candidate discovered'] : [];
		const searches = research?.searches ?? {};
		for (const provider of ['cached', 'commons', 'openverse', 'loc'] as const) {
			const state = searches[provider];
			if (!searchComplete(provider, state)) blockers.push(state?.status === 'blocked' ? `${provider} blocked: ${state.reason}` : `${provider} search pending`);
		}
		if (!photos.length && searches.manual?.status !== 'complete') blockers.push(searches.manual?.status === 'blocked'
			? `targeted archive/web review blocked: ${searches.manual.reason}` : 'targeted archive/web review pending');
		const discovered = new Map((research?.candidates ?? []).map(candidate => [candidate.sourceId, candidate]));
		for (const review of playerReviews) if (!discovered.has(review.sourceId)) {
			discovered.set(review.sourceId, review.status === 'approved'
				? { sourceId: review.sourceId, provider: 'manual', sourceUrl: review.metadata.sourceUrl, title: review.metadata.title, metadata: review.metadata, via: ['reviewed source'] }
				: { sourceId: review.sourceId, provider: 'manual', sourceUrl: review.evidenceUrl, title: review.sourceId, via: ['rejected source'] });
		}
		const leads = [...discovered.values()].map(candidate => ({ sourceId: candidate.sourceId, title: candidate.title, sourceUrl: candidate.sourceUrl,
			blockers: candidateBlockers(candidate, reviews.get(`${id}\0${candidate.sourceId}`), acquisitions.get(candidate.sourceId), photos.some(photo => photo.sourceId === candidate.sourceId)) }));
		if (!photos.length) {
			blockers.push(...new Set(leads.flatMap(candidate => candidate.blockers)));
			if (searches.manual?.reason) blockers.push(`targeted research: ${searches.manual.reason}`);
		}
		playerRecords.push({ playerId: id, name: identity?.name ?? context.media.players[id]?.name ?? '', hasPhoto: photos.length > 0,
			classified: photos.filter(photo => photo.review === 'approved').length,
			legacy: photos.filter(photo => photo.review !== 'approved').length,
			searches, blockers, candidates: leads });
	}
	const losses: Array<{ seasonId: string; playerId: string; explained: boolean; reasons: string[] }> = [];
	const selections: Array<{ seasonId: string; playerId: string; franchiseId: string; year: number; before: boolean; after: boolean; tier: number; sourceId: string | null; photoUrl: string | null }> = [];
	const groups: Record<string, Record<string, { total: number; before: number; after: number; tiers: number[] }>> = { decade: {}, franchise: {} };
	let before = 0, after = 0;
	const tiers = [0, 0, 0, 0, 0, 0, 0];
	for (const candidate of candidates) {
		const year = Number(candidate.seasonId?.split(':')[1]);
		const prior = selectPhoto(baseline, candidate.playerId, year, candidate.franchiseId);
		const photo = selectPhoto(context.media, candidate.playerId, year, candidate.franchiseId);
		before += Number(!!prior); after += Number(!!photo);
		const tier = photo ? photoTier(photo, year) : 6;
		tiers[tier]++;
		selections.push({ seasonId: candidate.seasonId!, playerId: candidate.playerId, franchiseId: candidate.franchiseId ?? '', year,
			before: !!prior, after: !!photo, tier, sourceId: photo?.sourceId ?? photo?.sourceUrl ?? null, photoUrl: photo?.url ?? null });
		if (prior && !photo) {
			const priorPhotos = baseline.players[candidate.playerId].photos;
			const removals = priorPhotos.map(priorPhoto => {
				const sourceId = priorPhoto.sourceId ?? (new URL(priorPhoto.sourceUrl).searchParams.get('curid') ? `commons:${new URL(priorPhoto.sourceUrl).searchParams.get('curid')}` : undefined);
				return context.reviews.find(review => review.playerId === candidate.playerId && review.status === 'rejected'
					&& (review.sourceId === sourceId || researchSourceUrls.get(review.sourceId)?.includes(sourceKey(priorPhoto.sourceUrl))));
			});
			const reasons = removals.flatMap(review => review?.status === 'rejected' ? [review.reason] : []);
			losses.push({ seasonId: candidate.seasonId!, playerId: candidate.playerId, explained: removals.every(Boolean), reasons });
		}
		for (const [group, key] of [['decade', String(candidate.decade ?? Math.floor(year / 10) * 10)], ['franchise', candidate.franchiseId ?? 'unknown']]) {
			const bucket = groups[group][key] ?? { total: 0, before: 0, after: 0, tiers: [0, 0, 0, 0, 0, 0, 0] };
			bucket.total++; bucket.before += Number(!!prior); bucket.after += Number(!!photo); bucket.tiers[tier]++; groups[group][key] = bucket;
		}
	}
	const summary = {
		dataVersion: context.data.dataVersion, mediaVersion: context.media.version, baselineVersion: baseline.version,
		players: playerRecords.length, beforePlayers: Object.values(baseline.players).filter(player => player.photos.length).length,
		afterPlayers: playerRecords.filter(player => player.hasPhoto).length, totalSelections: candidates.length,
		beforeSelections: before, afterSelections: after, newlyCoveredSelections: after - before,
		tierLabels: ['same-decade MLB', 'other MLB', 'minor league', 'other playing uniform', 'later uniform', 'legacy unclassified', 'blank'], tiers,
		classifiedPlayers: playerRecords.filter(player => player.classified).length,
		unreviewedCandidates: playerRecords.reduce((sum, player) => sum + player.candidates.filter(candidate => candidate.blockers[0]?.startsWith('unreviewed')).length, 0),
		blankPlayers: playerRecords.filter(player => !player.hasPhoto).length,
		searchStatus: Object.fromEntries((['cached', 'commons', 'openverse', 'loc', 'manual'] as const).map(provider => [provider, {
			complete: playerRecords.filter(player => searchComplete(provider, player.searches[provider])).length,
			blocked: playerRecords.filter(player => player.searches[provider]?.status === 'blocked').length,
			pending: playerRecords.filter(player => !searchComplete(provider, player.searches[provider]) && player.searches[provider]?.status !== 'blocked').length
		}])), groups, losses
	};
	await atomicWrite(join(context.cacheDir, 'audit/coverage.json'), `${canonicalJSON(summary)}\n`);
	await atomicWrite(join(context.cacheDir, 'audit/players.json'), `${canonicalJSON(playerRecords)}\n`);
	const row = (values: unknown[]) => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
	const csv = ['playerId,hasPhoto,classified,legacy,candidates,blockers', ...playerRecords.map(player => row([player.playerId, player.hasPhoto, player.classified, player.legacy, player.candidates.length, player.blockers.join('; ')]))].join('\n');
	await atomicWrite(join(context.cacheDir, 'audit/players.csv'), `${csv}\n`);
	await atomicWrite(join(context.cacheDir, 'audit/selections.json'), `${canonicalJSON(selections)}\n`);
	const columns = ['seasonId', 'playerId', 'franchiseId', 'year', 'before', 'after', 'tier', 'sourceId', 'photoUrl'] as const;
	await atomicWrite(join(context.cacheDir, 'audit/selections.csv'), `${row([...columns])}\n${selections.map(selection => row(columns.map(column => selection[column]))).join('\n')}\n`);
	return summary;
}
