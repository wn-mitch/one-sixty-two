import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest, Profile, SimulationData } from '../src/lib/game/types.ts';

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

export interface VerificationData {
	current: CurrentData;
	manifest: Manifest;
	simulation: SimulationData;
}

export async function loadVerificationData(): Promise<VerificationData> {
	const current = await readJson<CurrentData>(resolve(dataRoot, 'current.json'));
	if (current.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(current.dataVersion)) throw new Error('Generated current.json is invalid');
	const manifest = await readJson<Manifest>(localAssetPath(current.manifestUrl));
	if (manifest.schemaVersion !== 1 || manifest.dataVersion !== current.dataVersion) throw new Error('Generated manifest does not match current.json');
	const simulation = await readJson<SimulationData>(localAssetPath(manifest.simulationUrl));
	if (simulation.schemaVersion !== 1 || simulation.dataVersion !== manifest.dataVersion) throw new Error('Generated simulation data does not match the manifest');
	return { current, manifest, simulation };
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
		const profiles = await readJson<Profile[]>(localAssetPath(url));
		this.#chunks.set(key, profiles);
		return profiles;
	}
}
