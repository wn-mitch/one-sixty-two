import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../src/lib/game/draft.ts';
import { compareId, DEFENSE_METHOD_VERSION, HITTER_SLOTS, SLOTS, VALUATION_VERSION, type Draft, type Manifest, type Profile, type ShowcaseCard, type SimulationData, type Slot } from '../src/lib/game/types.ts';
import { validateDefensiveEnvironment, validateProfile } from '../src/lib/sim/validation.ts';

export interface CurrentData {
	schemaVersion: 1;
	dataVersion: string;
	manifestUrl: string;
}

const dataRoot = fileURLToPath(new URL('../static/data/', import.meta.url));

function localAssetPath(url: string): string {
	if (!url.startsWith('/data/')) throw new Error(`Expected a versioned /data/ asset URL, received ${url}`);
	const path = resolve(dataRoot, url.slice('/data/'.length));
	if (!path.startsWith(`${resolve(dataRoot)}${sep}`)) throw new Error(`Data asset escapes the generated data directory: ${url}`);
	return path;
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf8')) as T;
}

function validateGeneratedProfile(profile: Profile | null | undefined): asserts profile is Profile {
	if (!profile || typeof profile !== 'object') throw new Error('Generated data contains an invalid profile');
	validateProfile(profile);
}

function validateGeneratedSimulation(simulation: SimulationData): void {
	if (simulation.defenseMethodVersion !== DEFENSE_METHOD_VERSION || simulation.valuationVersion !== VALUATION_VERSION ||
		!Number.isFinite(simulation.observedRuns) || simulation.observedRuns <= 0 ||
		!Array.isArray(simulation.opponents) || simulation.opponents.length !== 30 ||
		new Set(simulation.opponents.map(opponent => opponent?.id)).size !== 30) {
		throw new Error('Generated simulation methods or environment are incompatible');
	}
	validateDefensiveEnvironment(simulation);
	validateGeneratedProfile(simulation.bullpen);
	for (const opponent of simulation.opponents) {
		if (!opponent || !Array.isArray(opponent.hitters) || opponent.hitters.length !== 9 ||
			!Array.isArray(opponent.starters) || opponent.starters.length !== 5 ||
			!opponent.closer || !opponent.bullpen) {
			throw new Error('Generated simulation contains an invalid opponent');
		}
		for (const profile of [...opponent.hitters, ...opponent.starters, opponent.closer, opponent.bullpen]) {
			validateGeneratedProfile(profile);
		}
	}
}

function matchesCandidate(profile: Profile, candidate: Manifest['candidates'][number]): boolean {
	return profile.seasonId === candidate.seasonId &&
		profile.playerId === candidate.playerId &&
		profile.franchiseId === candidate.franchiseId &&
		Math.floor(profile.year / 10) * 10 === candidate.decade &&
		profile.eligibleSlots.length === candidate.eligibleSlots.length &&
		profile.eligibleSlots.every((slot, index) => slot === candidate.eligibleSlots[index]);
}

export interface VerificationData {
	current: CurrentData;
	manifest: Manifest;
	simulation: SimulationData;
	showcase: ShowcaseCard[];
	gallery: Record<string, ShowcaseCard>;
}
 
function validateGeneratedGallery(manifest: Manifest, key: string, card: ShowcaseCard): void {
	if (!card || typeof card !== 'object' || !SLOTS.includes(card.slot)) throw new Error(`Generated gallery card ${key} is invalid`);
	validateGeneratedProfile(card.profile);
	const candidates = manifest.candidates
		.filter(candidate => `${candidate.franchiseId}-${candidate.decade}` === key)
		.sort((a, b) => compareId(a.seasonId, b.seasonId));
	const expected = candidates.find(candidate => SLOTS.some(slot => candidate.eligibleSlots.includes(slot)));
	if (!expected || !matchesCandidate(card.profile, expected) || card.slot !== SLOTS.find(slot => expected.eligibleSlots.includes(slot))) {
		throw new Error(`Generated gallery card ${key} does not match the manifest`);
	}
}

export async function loadVerificationData(): Promise<VerificationData> {
	const current = await readJson<CurrentData>(resolve(dataRoot, 'current.json'));
	if (current.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(current.dataVersion)) throw new Error('Generated current.json is invalid');
	const manifest = await readJson<Manifest>(localAssetPath(current.manifestUrl));
	if (manifest.schemaVersion !== 1 || manifest.dataVersion !== current.dataVersion) throw new Error('Generated manifest does not match current.json');
	const simulation = await readJson<SimulationData>(localAssetPath(manifest.simulationUrl));
	if (simulation.schemaVersion !== 1 || simulation.dataVersion !== manifest.dataVersion) throw new Error('Generated simulation data does not match the manifest');
	validateGeneratedSimulation(simulation);
	const showcase = await readJson<ShowcaseCard[]>(localAssetPath(manifest.showcaseUrl));
	const showcaseByEra = new Map<number, number>();
	for (const card of showcase) {
		if (!card || typeof card !== 'object') throw new Error('Generated showcase contains an invalid card');
		validateGeneratedProfile(card.profile);
		const decade = Math.floor(card.profile.year / 10) * 10;
		showcaseByEra.set(decade, (showcaseByEra.get(decade) ?? 0) + 1);
	}
	if (showcase.length !== 32 || new Set(showcase.map(card => card.profile.seasonId)).size !== 32
		|| showcase.some(card => !card.profile.eligibleSlots.includes(card.slot))
		|| showcaseByEra.size !== 8 || [...showcaseByEra.values()].some(count => count !== 4)) {
		throw new Error('Generated showcase does not contain four distinct canonical profiles for all eight eras');
	}
	const gallery: Record<string, ShowcaseCard> = {};
	for (const key of Object.keys(manifest.chunks).sort(compareId)) {
		const expected = manifest.candidates
			.filter(candidate => `${candidate.franchiseId}-${candidate.decade}` === key)
			.sort((a, b) => compareId(a.seasonId, b.seasonId))
			.find(candidate => SLOTS.some(slot => candidate.eligibleSlots.includes(slot)));
		if (!expected) continue;
		const card = await readJson<ShowcaseCard>(localAssetPath(`/data/${manifest.dataVersion}/gallery-${key}.json`));
		validateGeneratedGallery(manifest, key, card);
		gallery[key] = card;
	}
	return { current, manifest, simulation, showcase, gallery };
}

export class ProfileChunks {
	readonly #manifest: Manifest;
	readonly #chunks = new Map<string, Profile[]>();

	constructor(manifest: Manifest) {
		this.#manifest = manifest;
	}

	async forRoll(franchiseId: string, decade: number): Promise<Profile[]> {
		const key = `${franchiseId}-${decade}`;
		const cached = this.#chunks.get(key);
		if (cached) return cached;
		const url = this.#manifest.chunks[key];
		if (!url) throw new Error(`Manifest has no profile chunk for ${key}`);
		const value = await readJson<Profile[]>(localAssetPath(url));
		if (!Array.isArray(value)) throw new Error(`Generated profile chunk ${key} is invalid`);
		const expected = new Map(this.#manifest.candidates
			.filter(candidate => candidate.franchiseId === franchiseId && candidate.decade === decade)
			.map(candidate => [candidate.seasonId, candidate]));
		for (const profile of value) validateGeneratedProfile(profile);
		if (value.length !== expected.size || new Set(value.map(profile => profile.seasonId)).size !== expected.size ||
			value.some(profile => {
				const candidate = expected.get(profile.seasonId);
				return !candidate || !matchesCandidate(profile, candidate);
			})) {
			throw new Error(`Generated profile chunk ${key} does not match the manifest`);
		}
		const profiles = value;
		this.#chunks.set(key, profiles);
		return profiles;
	}
}

/** Deterministic drafting policy for smoke and benchmark runs: the best or worst modeled profile for the first fillable slot. */
export type Policy = 'best' | 'worst';

function hitterValue(profile: Profile): number {
	const rates = profile.battingRates;
	if (!rates) throw new Error(`Hitter profile ${profile.seasonId} has no prepared batting rates`);
	const expectedObp = rates[0] + rates[1] + rates[3] + rates[4] + rates[5] + rates[6];
	const atBatRate = 1 - rates[0] - rates[1];
	if (atBatRate <= 0) throw new Error(`Hitter profile ${profile.seasonId} has no modeled at-bats`);
	const expectedSlg = (rates[3] + 2 * rates[4] + 3 * rates[5] + 4 * rates[6]) / atBatRate;
	return expectedObp + expectedSlg;
}

function pitcherValue(profile: Profile): number {
	const rates = profile.pitchingRates;
	if (!rates) throw new Error(`Pitcher profile ${profile.seasonId} has no prepared pitching rates`);
	return rates[0] + rates[1] + rates[3] + rates[4] + rates[5] + rates[6];
}

function chooseProfile(profiles: Profile[], slot: Slot, policy: Policy): Profile {
	const hitter = (HITTER_SLOTS as readonly Slot[]).includes(slot);
	return profiles.toSorted((left, right) => {
		const difference = (hitter ? hitterValue(left) : pitcherValue(left)) - (hitter ? hitterValue(right) : pitcherValue(right));
		if (difference !== 0) {
			const bestDirection = hitter ? -1 : 1;
			return difference * (policy === 'best' ? bestDirection : -bestDirection);
		}
		return compareId(left.seasonId, right.seasonId);
	})[0];
}

/** The named stadium, or the first manifest stadium in ID order. */
export function stadiumId(manifest: Manifest, requested: string | null): string {
	const ids = manifest.stadiums.map(stadium => stadium.ref.id).sort(compareId);
	if (requested !== null && !ids.includes(requested)) throw new Error(`Unknown stadium ${requested}; choose one of ${ids.join(', ')}`);
	return requested ?? ids[0];
}

export async function draftRoster(manifest: Manifest, seed: number, policy: Policy, stadium: string, chunks: ProfileChunks): Promise<{ draft: Draft; profiles: Profile[] }> {
	let draft = selectHomeStadium(createDraft(manifest, seed), manifest, stadium);
	const selectedProfiles: Profile[] = [];
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		const roll = draft.currentRoll;
		assert.ok(roll, 'A draft roll must be present before candidate selection');
		const chunk = await chunks.forRoll(roll.franchiseId, roll.decade);
		const profilesBySeason = new Map(chunk.map(profile => [profile.seasonId, profile]));
		const available = availableCandidates(draft, manifest);
		let slot: Slot | undefined;
		let eligibleProfiles: Profile[] = [];
		for (const openSlot of SLOTS) {
			if (draft.picks.some(pick => pick.slot === openSlot)) continue;
			const candidates = available.filter(candidate => legalSlots(draft, candidate, manifest).includes(openSlot));
			if (!candidates.length) continue;
			slot = openSlot;
			eligibleProfiles = candidates.map(candidate => {
				const profile = profilesBySeason.get(candidate.seasonId);
				if (!profile) throw new Error(`Profile chunk is missing candidate ${candidate.seasonId}`);
				return profile;
			});
			break;
		}
		if (!slot || !eligibleProfiles.length) throw new Error('Current legal roll has no selectable profile for an open slot');
		const profile = chooseProfile(eligibleProfiles, slot, policy);
		draft = commitPick(draft, manifest, profile.seasonId, slot);
		selectedProfiles.push(profile);
	}
	return { draft, profiles: selectedProfiles };
}
