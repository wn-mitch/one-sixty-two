import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareId, SLOTS, type Manifest, type Profile, type ShowcaseCard, type SimulationData } from '../src/lib/game/types.ts';
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
	if (simulation.defenseMethodVersion !== 'defense-v1' || simulation.valuationVersion !== 'sim-war-v1' ||
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
