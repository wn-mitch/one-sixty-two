import { validateReplay } from '../game/draft.ts';
import { CURRENT_REPLAY_SCHEMA_VERSION, DEFENSE_METHOD_VERSION, MODEL_VERSION, RULES_VERSION, SLOTS, VALUATION_VERSION, type Draft, type Manifest, type Profile, type SimulationData } from '../game/types.ts';
import { validateMedia } from '../media/client.ts';
import type { MediaManifest, MediaPointer } from '../media/types.ts';
import { validateRankings, validateRankingsPointer } from '../rankings/client.ts';
import type { WarRankings, WarRankingsPointer } from '../rankings/types.ts';
import type { ShareRenderModel } from '../share/types.ts';
import { ENVIRONMENT_VERSION, GEOMETRY_VERSION } from '../sim/park-types.ts';
import { resolveStadium, validateDefensiveEnvironment, validateProfile, validateStadiumDeck } from '../sim/validation.ts';
import { loadAuthoritativeManifest, loadReplay, type ReplayAssets, type ReplayBucket } from './replays.ts';

const ASSET_ORIGIN = 'https://162-zero.internal';
const SHA256 = /^[a-f0-9]{64}$/;
const REPLAY_ID = /^[A-Za-z0-9_-]{22}$/;

export class ShareDataUnavailableError extends Error {
	constructor(message = 'Share assets are unavailable. Please retry.') { super(message); }
}

export class ShareDataIncompatibleError extends Error {
	constructor(message = 'Share assets are incompatible with this replay.') { super(message); }
}

export interface ShareBuildManifest {
	schemaVersion: 1;
	rendererVersion: string;
}

export interface CurrentShareAssets {
	manifest: Manifest;
	media: MediaManifest;
	rankings: WarRankings;
	rendererVersion: string;
}

export interface TrustedShareData extends CurrentShareAssets {
	draft: Draft;
	profiles: Profile[];
	simulation: SimulationData;
}

function incompatible(message: string): never {
	throw new ShareDataIncompatibleError(message);
}

function immutablePath(value: unknown, expected: string): string {
	if (value !== expected || typeof value !== 'string' || !value.startsWith('/') || value.includes('..') || /[?#]/.test(value)) {
		incompatible('A current share asset path is invalid.');
	}
	return value;
}

async function assetJson<T>(assets: ReplayAssets, path: string): Promise<T> {
	let response: Response;
	try { response = await assets.fetch(`${ASSET_ORIGIN}${path}`); }
	catch { throw new ShareDataUnavailableError(); }
	if (!response.ok) throw new ShareDataUnavailableError();
	try { return await response.json() as T; }
	catch { throw new ShareDataIncompatibleError('A current share asset is not valid JSON.'); }
}

function validateBuild(value: unknown): asserts value is ShareBuildManifest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) incompatible('The share renderer manifest is invalid.');
	const build = value as Record<string, unknown>;
	if (build.schemaVersion !== 1 || typeof build.rendererVersion !== 'string' || !SHA256.test(build.rendererVersion) ||
		Object.keys(build).some(key => key !== 'schemaVersion' && key !== 'rendererVersion')) {
		incompatible('The share renderer manifest is invalid.');
	}
}

function validateMediaPointer(value: unknown): asserts value is MediaPointer {
	if (!value || typeof value !== 'object' || Array.isArray(value)) incompatible('The image pointer is incompatible.');
	const pointer = value as Record<string, unknown>;
	if ((pointer.schemaVersion !== 2 && pointer.schemaVersion !== 3) || typeof pointer.version !== 'string' ||
		!SHA256.test(pointer.version) || pointer.manifestUrl !== `/media/${pointer.version}/manifest.json`) {
		incompatible('The image pointer is incompatible.');
	}
}

/** Pin every current immutable asset used by a trusted render. */
export async function loadCurrentShareAssets(assets: ReplayAssets | undefined): Promise<CurrentShareAssets> {
	if (!assets) throw new ShareDataUnavailableError();
	let manifest: Manifest;
	try { manifest = await loadAuthoritativeManifest(assets); }
	catch { throw new ShareDataUnavailableError(); }
	if (!SHA256.test(manifest.dataVersion)) incompatible('The core dataset version is incompatible.');
	immutablePath(manifest.simulationUrl, `/data/${manifest.dataVersion}/simulation.json`);

	const [mediaPointerValue, rankingsPointerValue, buildValue] = await Promise.all([
		assetJson<unknown>(assets, '/media/current.json'),
		assetJson<unknown>(assets, '/rankings/current.json'),
		assetJson<unknown>(assets, '/share/current.json')
	]);
	validateMediaPointer(mediaPointerValue);
	try { validateRankingsPointer(rankingsPointerValue, manifest.dataVersion); }
	catch { incompatible('The rankings pointer is incompatible.'); }
	const rankingsPointer = rankingsPointerValue as WarRankingsPointer;
	validateBuild(buildValue);

	const [mediaValue, rankingsValue] = await Promise.all([
		assetJson<unknown>(assets, immutablePath(mediaPointerValue.manifestUrl, `/media/${mediaPointerValue.version}/manifest.json`)),
		assetJson<unknown>(assets, immutablePath(rankingsPointer.manifestUrl, `/rankings/${rankingsPointer.rankingVersion}/manifest.json`))
	]);
	try { validateMedia(mediaValue, mediaPointerValue.version); }
	catch { incompatible('The image index is incompatible.'); }
	const media = mediaValue as MediaManifest;
	if (media.dataVersion !== manifest.dataVersion) incompatible('The image index does not match the core dataset.');
	try { validateRankings(rankingsValue, manifest.dataVersion, rankingsPointer.rankingVersion); }
	catch { incompatible('The rankings index is incompatible.'); }
	const rankings = rankingsValue as WarRankings;

	return {
		manifest,
		media,
		rankings,
		rendererVersion: buildValue.rendererVersion
	};
}

function candidateMatches(profile: Profile, candidate: Manifest['candidates'][number]): boolean {
	return profile.seasonId === candidate.seasonId && profile.playerId === candidate.playerId &&
		profile.franchiseId === candidate.franchiseId && Math.floor(profile.year / 10) * 10 === candidate.decade &&
		profile.eligibleSlots.length === candidate.eligibleSlots.length &&
		profile.eligibleSlots.every((slot, index) => slot === candidate.eligibleSlots[index]);
}

async function loadRosterProfiles(assets: ReplayAssets, manifest: Manifest, draft: Draft): Promise<Profile[]> {
	const requested = new Map<string, { franchiseId: string; decade: number }>();
	for (const pick of draft.picks) requested.set(`${pick.franchiseId}-${pick.decade}`, pick);
	const chunks = await Promise.all([...requested.entries()].map(async ([key, roll]) => {
		if (!/^[A-Za-z0-9_-]+-(?:19|20)\d0$/.test(key)) incompatible('A drafted profile chunk key is invalid.');
		const path = immutablePath(manifest.chunks[key], `/data/${manifest.dataVersion}/${key}.json`);
		const value = await assetJson<unknown>(assets, path);
		if (!Array.isArray(value) || !value.length) incompatible('A drafted profile chunk is invalid.');
		const expected = new Map(manifest.candidates
			.filter(candidate => candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade)
			.map(candidate => [candidate.seasonId, candidate]));
		if (value.length !== expected.size) incompatible('A drafted profile chunk does not match the manifest.');
		const seen = new Set<string>();
		for (const item of value) {
			try { validateProfile(item as Profile); }
			catch { incompatible('A drafted canonical profile is invalid.'); }
			const profile = item as Profile;
			const candidate = expected.get(profile.seasonId);
			if (!candidate || seen.has(profile.seasonId) || !candidateMatches(profile, candidate)) {
				incompatible('A drafted profile chunk does not match the manifest.');
			}
			seen.add(profile.seasonId);
		}
		return value as Profile[];
	}));
	const available = new Map(chunks.flat().map(profile => [profile.seasonId, profile]));
	return draft.picks.map(pick => available.get(pick.seasonId) ?? incompatible('A drafted profile is missing.'));
}

function validateSimulation(value: unknown, manifest: Manifest): asserts value is SimulationData {
	if (!value || typeof value !== 'object' || Array.isArray(value)) incompatible('The simulation dataset is invalid.');
	const simulation = value as SimulationData;
	if (simulation.schemaVersion !== 1 || simulation.dataVersion !== manifest.dataVersion ||
		simulation.defenseMethodVersion !== DEFENSE_METHOD_VERSION || simulation.valuationVersion !== VALUATION_VERSION ||
		!Number.isFinite(simulation.observedRuns) || simulation.observedRuns <= 0 ||
		!Array.isArray(simulation.opponents) || simulation.opponents.length !== 30 ||
		new Set(simulation.opponents.map(team => team?.id)).size !== 30) {
		incompatible('The simulation dataset is incompatible.');
	}
	try {
		validateDefensiveEnvironment(simulation);
		validateStadiumDeck(simulation);
		if (manifest.stadiums.length !== simulation.stadiums.length || simulation.stadiums.some(stadium =>
			!manifest.stadiums.some(summary => summary.ref.id === stadium.id && summary.ref.version === stadium.version))) {
			incompatible('The stadium deck does not match the manifest.');
		}
		validateProfile(simulation.bullpen);
		for (const team of simulation.opponents) {
			if (!team || !Array.isArray(team.hitters) || !Array.isArray(team.starters) || !team.closer || !team.bullpen) {
				incompatible('The simulation dataset is incomplete.');
			}
			for (const profile of [...team.hitters, ...team.starters, team.closer, team.bullpen]) validateProfile(profile);
			if (resolveStadium(simulation, team.homeStadium).franchiseId !== team.id) incompatible('An opponent home stadium is invalid.');
		}
	} catch (error) {
		if (error instanceof ShareDataIncompatibleError) throw error;
		incompatible('A simulation profile is invalid.');
	}
}

/** Load, revalidate, and pin all trusted inputs required to recompute a replay. */
export async function loadTrustedShareData(
	assets: ReplayAssets | undefined,
	bucket: ReplayBucket | undefined,
	id: string
): Promise<TrustedShareData> {
	if (!REPLAY_ID.test(id)) throw new ShareDataIncompatibleError('The replay identifier is invalid.');
	const current = await loadCurrentShareAssets(assets);
	const replay = await loadReplay(bucket, id, current.manifest);
	const draft = validateReplay(replay, current.manifest);
	if (draft.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION || draft.modelVersion !== MODEL_VERSION || draft.rulesVersion !== RULES_VERSION || !draft.homeStadium) {
		incompatible('The replay uses an unsupported simulation model.');
	}
	const [profiles, simulationValue] = await Promise.all([
		loadRosterProfiles(assets!, current.manifest, draft),
		assetJson<unknown>(assets!, immutablePath(current.manifest.simulationUrl, `/data/${current.manifest.dataVersion}/simulation.json`))
	]);
	validateSimulation(simulationValue, current.manifest);
	return { ...current, draft, profiles, simulation: simulationValue };
}

function safeMediaPath(value: unknown, mediaVersion: string): boolean {
	return value === '' || (typeof value === 'string' && new RegExp(`^/media/${mediaVersion}/[a-f0-9]{64}\\.webp$`).test(value));
}

/** Verify stored model structure and every deployment pin before authenticated rendering. */
export function validateStoredShareModel(model: unknown, current: CurrentShareAssets, digest: string, publicOrigin: string): asserts model is ShareRenderModel {
	if (!model || typeof model !== 'object' || Array.isArray(model)) incompatible('The stored share model is invalid.');
	const value = model as ShareRenderModel;
	const record = value.record;
	const wholeNonnegative = record && [
		record.wins,
		record.losses,
		record.longestWinningStreak,
		record.runsFor,
		record.runsAgainst
	].every(number => Number.isInteger(number) && number >= 0);
	if (!SHA256.test(digest) || value.schemaVersion !== 1 || value.replaySchemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION ||
		value.modelVersion !== MODEL_VERSION || value.rulesVersion !== RULES_VERSION || value.dataVersion !== current.manifest.dataVersion ||
		value.defenseMethodVersion !== DEFENSE_METHOD_VERSION || value.valuationVersion !== VALUATION_VERSION ||
		!value.homeStadium || value.homeStadium.geometryVersion !== GEOMETRY_VERSION || value.homeStadium.environmentVersion !== ENVIRONMENT_VERSION ||
		!current.manifest.stadiums.some(summary => summary.ref.id === value.homeStadium.id && summary.ref.version === value.homeStadium.version && summary.name === value.homeStadium.name) ||
		value.mediaVersion !== current.media.version || value.rankingVersion !== current.rankings.rankingVersion ||
		value.rendererVersion !== current.rendererVersion || !value.replayId || !REPLAY_ID.test(value.replayId) ||
		!wholeNonnegative || record.wins + record.losses !== 162 ||
		(record.firstLoss !== null && (!Number.isInteger(record.firstLoss) || record.firstLoss < 1 || record.firstLoss > 162)) ||
		!Array.isArray(value.cards) || value.cards.length !== SLOTS.length ||
		new Set(value.cards.map(card => card?.seasonId)).size !== SLOTS.length ||
		value.cards.some((card, index) => !card || card.slot !== SLOTS[index] || typeof card.seasonId !== 'string' || !card.seasonId)) {
		incompatible('The stored share model does not match the current renderer inputs.');
	}
	let origin: URL;
	try { origin = new URL(publicOrigin); }
	catch { incompatible('The configured public origin is invalid.'); }
	if (value.replayUrl !== new URL(`/r/${value.replayId}`, origin).toString()) incompatible('The stored replay URL is invalid.');
	for (const entry of value.cards) {
		if (!entry.card || !safeMediaPath(entry.card.photo, current.media.version) ||
			!safeMediaPath(entry.card.logo, current.media.version) ||
			(entry.card.selectedPhoto && entry.card.selectedPhoto.url !== entry.card.photo) ||
			(entry.card.selectedLogo && entry.card.selectedLogo.url !== entry.card.logo)) {
			incompatible('The stored share model contains an unsafe asset path.');
		}
	}
}
