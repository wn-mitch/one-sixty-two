import { validateReplay } from '../game/draft.ts';
import { prepareSeasonInput } from '../game/season-input.ts';
import type { Manifest, Profile, Replay, SimulationData } from '../game/types.ts';
import type { SeasonInput, SeasonResult } from '../sim/types.ts';
import type { ReplayAssets } from './replays.ts';
import type { DailyRecord } from './daily-standings.ts';

const ASSET_ORIGIN = 'https://162-zero.internal';

/** The replay does not replay: its draft history or roster is invalid for the deployed data. */
export class InvalidReplayError extends Error {}

export interface Recomputed {
	record: DailyRecord;
	/** Identifies the roster and its orders, so identical rosters share one board row. */
	rosterKey: string;
}

/** The parsed manifest and simulation data for one data version, kept for the isolate's life. */
const datasets = new Map<string, Promise<{ manifest: Manifest; simulation: SimulationData }>>();

async function assetJson<T>(assets: ReplayAssets, path: string): Promise<T> {
	const response = await assets.fetch(new URL(path, ASSET_ORIGIN));
	if (!response.ok) throw new Error(`Asset ${path} answered ${response.status}`);
	return response.json() as Promise<T>;
}

function dataset(assets: ReplayAssets, dataVersion: string) {
	let loaded = datasets.get(dataVersion);
	if (!loaded) {
		loaded = (async () => {
			const manifest = await assetJson<Manifest>(assets, `/data/${dataVersion}/manifest.json`);
			if (manifest.dataVersion !== dataVersion) throw new Error('Manifest does not match its data version');
			const simulation = await assetJson<SimulationData>(assets, manifest.simulationUrl);
			if (simulation.dataVersion !== dataVersion) throw new Error('Simulation data does not match its data version');
			return { manifest, simulation };
		})();
		loaded.catch(() => datasets.delete(dataVersion));
		datasets.clear();
		datasets.set(dataVersion, loaded);
	}
	return loaded;
}

/** Plays a season with the engine build for this runtime: compiled at deploy time in the Worker, the Node entry in development. */
async function play(input: SeasonInput): Promise<SeasonResult> {
	const engine = import.meta.env.DEV ? await import('../engine/node.ts') : await import('./engine-worker.ts');
	return engine.simulateSeason(input);
}

/** A stable key for the roster and its batting order, rotation and relief roles. */
async function rosterKey(draft: Pick<Replay, 'picks' | 'battingOrder' | 'starterOrder' | 'reliefRoles'>): Promise<string> {
	const roster = JSON.stringify([
		draft.picks.map(pick => [pick.slot, pick.seasonId]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
		draft.battingOrder, draft.starterOrder, draft.reliefRoles
	]);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(roster));
	return [...new Uint8Array(digest).slice(0, 12)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Recomputes a stored daily replay from scratch: the full draft history against the deployed manifest,
 * then all 162 games with the same engine and data every browser uses. Throws `InvalidReplayError` when the
 * replay itself is at fault, and any other error when data could not be loaded.
 */
export async function recomputeReplay(assets: ReplayAssets, replay: Replay): Promise<Recomputed> {
	const { manifest, simulation } = await dataset(assets, replay.dataVersion);
	const invalid = <T,>(step: () => T): T => {
		try { return step(); }
		catch (error) { throw new InvalidReplayError(error instanceof Error ? error.message : 'Invalid replay'); }
	};
	const draft = invalid(() => validateReplay(replay, manifest));
	const chunks = [...new Set(draft.picks.map(pick => manifest.chunks[`${pick.franchiseId}-${pick.decade}`]))];
	if (chunks.some(url => !url)) throw new InvalidReplayError('A pick has no profile chunk');
	const wanted = new Set(draft.picks.map(pick => pick.seasonId));
	const profiles = (await Promise.all(chunks.map(url => assetJson<Profile[]>(assets, url)))).flat().filter(profile => wanted.has(profile.seasonId));
	const result = await play(invalid(() => prepareSeasonInput(draft, profiles, simulation)));
	return {
		record: { wins: result.wins, losses: result.losses, runsFor: result.runsFor, runsAgainst: result.runsAgainst },
		rosterKey: await rosterKey(draft)
	};
}
