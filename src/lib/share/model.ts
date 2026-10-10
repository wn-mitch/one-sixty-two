import { createCardViewModel } from '../cards/view-model.ts';
import { CURRENT_REPLAY_SCHEMA_VERSION, DEFENSE_METHOD_VERSION, HITTER_SLOTS, MODEL_VERSION, RULES_VERSION, SLOTS, STARTER_SLOTS, VALUATION_VERSION } from '../game/types.ts';
import { ENVIRONMENT_VERSION, GEOMETRY_VERSION } from '../sim/park-types.ts';
import type { Candidate, Draft, Manifest, Profile, Slot } from '../game/types.ts';
import type { MediaManifest } from '../media/types.ts';
import type { WarRankings } from '../rankings/types.ts';
import type { SeasonResult } from '../sim/types.ts';
import { validateProfile } from '../sim/validation.ts';
import type { ShareRecord, ShareRenderModel, ShareStadium } from './types.ts';

export interface CreateShareRenderModelInput {
	draft: Draft;
	result: SeasonResult;
	profiles: readonly Profile[];
	manifest: Manifest;
	media: MediaManifest | null;
	rankings: WarRankings | null;
	replayId?: string;
	publicOrigin?: string;
	rendererVersion?: string;
}

const REPLAY_ID = /^[A-Za-z0-9_-]{22}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function requireInteger(value: number, label: string, minimum = 0): number {
	if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid share ${label}`);
	return value;
}

function validateRecord(result: SeasonResult): ShareRecord {
	const wins = requireInteger(result.wins, 'wins');
	const losses = requireInteger(result.losses, 'losses');
	if (wins + losses !== 162 || result.games.length !== 162) throw new Error('Share result must contain a complete 162-game season');
	const firstLoss = result.firstLoss;
	if (firstLoss !== null) {
		requireInteger(firstLoss, 'first loss', 1);
		if (losses === 0 || firstLoss > 162) throw new Error('Invalid share first loss');
	} else if (losses !== 0) {
		throw new Error('A season with losses must identify its first loss');
	}
	const longestWinningStreak = requireInteger(result.longestWinningStreak, 'winning streak');
	if (longestWinningStreak > wins) throw new Error('Invalid share winning streak');
	const runsFor = requireInteger(result.runsFor, 'runs for');
	const runsAgainst = requireInteger(result.runsAgainst, 'runs against');
	return { wins, losses, firstLoss, longestWinningStreak, runsFor, runsAgainst };
}

function validateProfileCounts(profile: Profile): void {
	if (!Number.isSafeInteger(profile.year) || !Number.isSafeInteger(profile.teamGames) || profile.teamGames <= 0) {
		throw new Error('Share profile contains an invalid season count');
	}
	for (const counts of [
		profile.batting,
		profile.pitching,
		...Object.values(profile.fielding),
		profile.appearances
	]) {
		if (!counts) continue;
		for (const value of Object.values(counts)) {
			if (!Number.isSafeInteger(value) || value < 0) throw new Error('Share profile contains an invalid statistical count');
		}
	}
}

interface ValidatedShareDraft {
	bySlot: Map<Slot, Draft['picks'][number]>;
	candidates: Map<string, Candidate>;
}

function validateDraftShape(draft: Draft, manifest: Manifest): ValidatedShareDraft {
	if (manifest.schemaVersion !== 1 || !manifest.dataVersion ||
		draft.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION || draft.modelVersion !== MODEL_VERSION ||
		draft.rulesVersion !== RULES_VERSION || draft.dataVersion !== manifest.dataVersion) {
		throw new Error('Share draft is incompatible with the current dataset');
	}
	if (draft.picks.length !== SLOTS.length) throw new Error('Share roster must contain all 14 slots');
	const bySlot = new Map<Slot, Draft['picks'][number]>();
	const bySeason = new Map<string, Draft['picks'][number]>();
	for (const pick of draft.picks) {
		if (!SLOTS.includes(pick.slot) || bySlot.has(pick.slot)) throw new Error('Share roster contains an invalid or duplicate slot');
		if (!pick.seasonId || bySeason.has(pick.seasonId)) throw new Error('Share roster contains a duplicate season identity');
		bySlot.set(pick.slot, pick);
		bySeason.set(pick.seasonId, pick);
	}
	const candidates = new Map<string, Candidate>();
	for (const candidate of manifest.candidates) {
		if (!bySeason.has(candidate.seasonId)) continue;
		if (candidates.has(candidate.seasonId)) throw new Error('Canonical manifest contains a duplicate share identity');
		candidates.set(candidate.seasonId, candidate);
	}
	const playerIds = new Set<string>();
	const franchiseIds = new Set<string>();
	for (const pick of draft.picks) {
		const candidate = candidates.get(pick.seasonId);
		if (!candidate || candidate.franchiseId !== pick.franchiseId || candidate.decade !== pick.decade ||
			!candidate.eligibleSlots.includes(pick.slot)) {
			throw new Error('Share roster pick does not match the canonical manifest');
		}
		if (playerIds.has(candidate.playerId) || franchiseIds.has(candidate.franchiseId)) {
			throw new Error('Share roster violates unique player or franchise rules');
		}
		playerIds.add(candidate.playerId);
		franchiseIds.add(candidate.franchiseId);
	}
	const expectedHitters = new Set(HITTER_SLOTS.map(slot => bySlot.get(slot)!.seasonId));
	const expectedStarters = new Set(STARTER_SLOTS.map(slot => bySlot.get(slot)!.seasonId));
	if (draft.currentRoll !== null || draft.battingOrder.length !== HITTER_SLOTS.length ||
		new Set(draft.battingOrder).size !== expectedHitters.size ||
		draft.battingOrder.some(seasonId => !expectedHitters.has(seasonId)) ||
		draft.starterOrder.length !== STARTER_SLOTS.length ||
		new Set(draft.starterOrder).size !== expectedStarters.size ||
		draft.starterOrder.some(seasonId => !expectedStarters.has(seasonId))) {
		throw new Error('Share draft contains an invalid lineup order');
	}
	return { bySlot, candidates };
}

function validateProfiles(
	profiles: readonly Profile[],
	draft: ValidatedShareDraft
): Map<string, Profile> {
	if (profiles.length !== SLOTS.length) throw new Error('Share roster must provide exactly 14 profiles');
	const bySeason = new Map<string, Profile>();
	for (const profile of profiles) {
		validateProfile(profile);
		validateProfileCounts(profile);
		if (bySeason.has(profile.seasonId)) throw new Error('Share roster contains a duplicate profile identity');
		bySeason.set(profile.seasonId, profile);
	}
	for (const slot of SLOTS) {
		const pick = draft.bySlot.get(slot);
		const profile = pick && bySeason.get(pick.seasonId);
		const candidate = pick && draft.candidates.get(pick.seasonId);
		if (!pick || !profile || !candidate || profile.playerId !== candidate.playerId ||
			profile.franchiseId !== candidate.franchiseId ||
			Math.floor(profile.year / 10) * 10 !== candidate.decade ||
			profile.eligibleSlots.length !== candidate.eligibleSlots.length ||
			profile.eligibleSlots.some((eligible, index) => eligible !== candidate.eligibleSlots[index])) {
			throw new Error(`Share roster profile does not match slot ${slot}`);
		}
	}
	return bySeason;
}

function publicationPins(input: CreateShareRenderModelInput): {
	replayId: string | null;
	replayUrl: string | null;
	rendererVersion: string | null;
} {
	const supplied = [input.replayId, input.publicOrigin, input.rendererVersion].filter(value => value !== undefined).length;
	if (supplied === 0) return { replayId: null, replayUrl: null, rendererVersion: null };
	if (supplied !== 3 || !input.replayId || !input.publicOrigin || !input.rendererVersion) {
		throw new Error('Published share models require replay, origin, and renderer pins');
	}
	if (!REPLAY_ID.test(input.replayId)) throw new Error('Invalid share replay ID');
	let origin: URL;
	try {
		origin = new URL(input.publicOrigin);
	} catch {
		throw new Error('Invalid public share origin');
	}
	if ((origin.protocol !== 'https:' && origin.protocol !== 'http:') || origin.username || origin.password ||
		origin.search || origin.hash || (origin.pathname !== '/' && origin.pathname !== '')) {
		throw new Error('Invalid public share origin');
	}
	if (!SHA256.test(input.rendererVersion)) throw new Error('Invalid share renderer version');
	return {
		replayId: input.replayId,
		replayUrl: new URL(`/r/${input.replayId}`, origin).toString(),
		rendererVersion: input.rendererVersion
	};
}

function shareStadium(draft: Draft, manifest: Manifest): ShareStadium {
	const summary = manifest.stadiums.find(item => item.ref.id === draft.homeStadium?.id && item.ref.version === draft.homeStadium?.version);
	if (!summary) throw new Error('Share stadium does not match the current dataset');
	return { id: summary.ref.id, version: summary.ref.version, name: summary.name, geometryVersion: GEOMETRY_VERSION, environmentVersion: ENVIRONMENT_VERSION };
}

/** Build the sole render model used by local previews and trusted captures. */
export function createShareRenderModel(input: CreateShareRenderModelInput): ShareRenderModel {
	const { draft, result, manifest, media, rankings } = input;
	if (result.modelVersion !== draft.modelVersion || result.rulesVersion !== draft.rulesVersion || result.dataVersion !== draft.dataVersion || result.seed !== draft.seed ||
		result.defenseMethodVersion !== DEFENSE_METHOD_VERSION || result.valuationVersion !== VALUATION_VERSION ||
		!draft.homeStadium || result.homeStadium.id !== draft.homeStadium.id || result.homeStadium.version !== draft.homeStadium.version) {
		throw new Error('Share result does not match the drafted season');
	}
	const homeStadium = shareStadium(draft, manifest);
	const record = validateRecord(result);
	const picks = validateDraftShape(draft, manifest);
	const profiles = validateProfiles(input.profiles, picks);
	if (media && ((media.schemaVersion !== 2 && media.schemaVersion !== 3) || !media.version.trim() || media.dataVersion !== draft.dataVersion)) {
		throw new Error('Share media does not match the drafted dataset');
	}
	if (rankings && (rankings.schemaVersion !== 1 || !rankings.rankingVersion.trim() || rankings.dataVersion !== draft.dataVersion)) {
		throw new Error('Share rankings do not match the drafted dataset');
	}
	const pins = publicationPins(input);
	if (pins.rendererVersion && (!media || !rankings)) throw new Error('Published share models require pinned media and rankings');

	const cards = SLOTS.map(slot => {
		const pick = picks.bySlot.get(slot)!;
		const profile = profiles.get(pick.seasonId)!;
		return {
			seasonId: profile.seasonId,
			slot,
			card: createCardViewModel({ profile, slot, manifest, media, rankings, mediaStatus: media ? 'ready' : 'unavailable' })
		};
	});

	return {
		schemaVersion: 1,
		replaySchemaVersion: draft.schemaVersion,
		modelVersion: result.modelVersion,
		rulesVersion: result.rulesVersion,
		dataVersion: result.dataVersion,
		defenseMethodVersion: result.defenseMethodVersion,
		valuationVersion: result.valuationVersion,
		homeStadium,
		mediaVersion: media?.version ?? null,
		rankingVersion: rankings?.rankingVersion ?? null,
		rendererVersion: pins.rendererVersion,
		replayId: pins.replayId,
		replayUrl: pins.replayUrl,
		record,
		cards
	};
}

function canonicalize(value: unknown, stack: Set<object>): unknown {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error('Share render model contains a non-finite number');
		return Object.is(value, -0) ? 0 : value;
	}
	if (typeof value === 'undefined') return undefined;
	if (typeof value !== 'object') throw new Error('Share render model contains a non-serializable value');
	if (stack.has(value)) throw new Error('Share render model contains a cycle');
	stack.add(value);
	let result: unknown;
	if (Array.isArray(value)) {
		result = value.map(item => canonicalize(item, stack) ?? null);
	} else {
		const record = value as Record<string, unknown>;
		const output: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			const item = canonicalize(record[key], stack);
			if (item !== undefined) output[key] = item;
		}
		result = output;
	}
	stack.delete(value);
	return result;
}

/** Stable JSON bytes for content-addressed model storage and digesting. */
export function canonicalShareRenderModelJson(model: ShareRenderModel): string {
	return JSON.stringify(canonicalize(model, new Set()));
}
