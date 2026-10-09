import { describe, expect, it } from 'vitest';
import { availableCandidates, commitPick, createDraft, legalSlots, replayInput, rollDraft } from '../game/draft.ts';
import { SLOTS, type Manifest, type Replay } from '../game/types.ts';
import type { MediaManifest } from '../media/types.ts';
import type { WarRankings } from '../rankings/types.ts';
import { testSeason } from '../sim/test-fixtures.ts';
import type { ReplayAssets, ReplayBucket, ReplayPutOptions } from './replays.ts';
import { ShareDataIncompatibleError, ShareDataUnavailableError, loadCurrentShareAssets, loadTrustedShareData } from './share-data.ts';

const DATA_VERSION = 'a'.repeat(64);
const MEDIA_VERSION = 'b'.repeat(64);
const RANKING_VERSION = 'c'.repeat(64);
const RENDERER_VERSION = 'd'.repeat(64);
const REPLAY_ID = 'R'.repeat(22);

class MemoryBucket implements ReplayBucket {
	objects = new Map<string, Uint8Array>();
	async get(key: string) {
		const body = this.objects.get(key);
		return body ? { body } : null;
	}
	async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions) {
		if (options?.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
		const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
		this.objects.set(key, Uint8Array.from(bytes));
		return {};
	}
}

interface Fixture {
	assets: ReplayAssets;
	bucket: MemoryBucket;
	manifest: Manifest;
	paths: Map<string, unknown>;
	replay: Replay;
}

function fixture(): Fixture {
	const season = testSeason(713);
	season.data.dataVersion = DATA_VERSION;
	season.roster.forEach((entry, index) => {
		entry.profile.franchiseId = `F${index}`;
		entry.profile.teamId = `T${index}`;
	});
	const candidates = season.roster.map(({ profile, slot }, index) => ({
		seasonId: profile.seasonId,
		playerId: profile.playerId,
		franchiseId: `F${index}`,
		decade: 2020,
		eligibleSlots: [slot]
	}));
	const chunks = Object.fromEntries(candidates.map(candidate => [
		`${candidate.franchiseId}-${candidate.decade}`,
		`/data/${DATA_VERSION}/${candidate.franchiseId}-${candidate.decade}.json`
	]));
	const manifest = {
		schemaVersion: 1,
		dataVersion: DATA_VERSION,
		sourceCommit: 'fixture',
		franchises: Array.from({ length: 30 }, (_, index) => ({ id: `F${index}`, name: `Club ${index}`, decades: [2020] })),
		candidates,
		chunks,
		simulationUrl: `/data/${DATA_VERSION}/simulation.json`,
		showcaseUrl: `/data/${DATA_VERSION}/showcase.json`,
		attributionUrl: `/data/${DATA_VERSION}/attribution.json`,
		archiveUrl: `/data/${DATA_VERSION}/archive.json`,
		approximations: [],
		coverage: [],
		diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
		attribution: {
			title: 'Synthetic stats', credit: 'Synthetic fixture', sourceUrl: 'https://example.invalid/stats',
			license: 'Fixture license', licenseUrl: 'https://example.invalid/license', sourceCommit: 'fixture',
			changes: 'Synthetic test data.', fullNotice: 'Synthetic test data.'
		}
	} as Manifest;
	let draft = createDraft(manifest, season.seed);
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		const candidate = availableCandidates(draft, manifest)[0];
		draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
	}
	const replay = replayInput(draft);
	const media: MediaManifest = {
		schemaVersion: 3,
		version: MEDIA_VERSION,
		dataVersion: DATA_VERSION,
		modifications: 'Synthetic fixture.',
		teams: {}, players: {}, atmosphere: {},
		diagnostics: { playersSearched: 0, playersWithPhotos: 0, photos: 0, logos: 0, historicalLogos: 0, atmospherePhotos: 0, excluded: 0 }
	};
	const rankings: WarRankings = {
		schemaVersion: 1,
		dataVersion: DATA_VERSION,
		rankingVersion: RANKING_VERSION,
		source: {
			name: 'Synthetic WAR', url: 'https://example.invalid/war', licenceUrl: 'https://example.invalid/license',
			licenceText: 'Fixture license', commit: 'e'.repeat(40), description: 'Synthetic fixture rankings.'
		},
		seasons: {},
		coverage: { candidates: 0, batting: 0, pitching: 0, missing: candidates.length }
	};
	const paths = new Map<string, unknown>([
		['/data/current.json', { schemaVersion: 1, dataVersion: DATA_VERSION, manifestUrl: `/data/${DATA_VERSION}/manifest.json` }],
		[`/data/${DATA_VERSION}/manifest.json`, manifest],
		[`/data/${DATA_VERSION}/simulation.json`, season.data],
		['/media/current.json', { schemaVersion: 3, version: MEDIA_VERSION, manifestUrl: `/media/${MEDIA_VERSION}/manifest.json` }],
		[`/media/${MEDIA_VERSION}/manifest.json`, media],
		['/rankings/current.json', { schemaVersion: 1, dataVersion: DATA_VERSION, rankingVersion: RANKING_VERSION, manifestUrl: `/rankings/${RANKING_VERSION}/manifest.json` }],
		[`/rankings/${RANKING_VERSION}/manifest.json`, rankings],
		['/share/current.json', { schemaVersion: 1, rendererVersion: RENDERER_VERSION }]
	]);
	for (const [index, profile] of season.roster.map(entry => entry.profile).entries()) {
		paths.set(`/data/${DATA_VERSION}/F${index}-2020.json`, [profile]);
	}
	const assets: ReplayAssets = {
		async fetch(input) {
			const value = paths.get(new URL(input.toString()).pathname);
			return value === undefined ? new Response('missing', { status: 404 }) : Response.json(value);
		}
	};
	const bucket = new MemoryBucket();
	bucket.objects.set(`replays/v1/${REPLAY_ID}`, new TextEncoder().encode(JSON.stringify(replay)));
	return { assets, bucket, manifest, paths, replay };
}

describe('trusted share data', () => {
	it('pins compatible current core, media, ranking, and renderer assets', async () => {
		const test = fixture();
		const current = await loadCurrentShareAssets(test.assets);
		expect(current).toMatchObject({
			manifest: { dataVersion: DATA_VERSION },
			media: { version: MEDIA_VERSION, dataVersion: DATA_VERSION },
			rankings: { rankingVersion: RANKING_VERSION, dataVersion: DATA_VERSION },
			rendererVersion: RENDERER_VERSION
		});
	});

	it('revalidates the stored replay, every selected canonical profile, and simulation profiles', async () => {
		const test = fixture();
		const loaded = await loadTrustedShareData(test.assets, test.bucket, REPLAY_ID);
		expect(loaded.draft.actions).toEqual(test.replay.actions);
		expect(loaded.profiles).toHaveLength(14);
		expect(new Set(loaded.profiles.map(profile => profile.franchiseId)).size).toBe(14);
		expect(loaded.simulation).toMatchObject({ dataVersion: DATA_VERSION, defenseMethodVersion: 'defense-v1', valuationVersion: 'sim-war-v1' });
	});

	it('fails explicitly when a required current asset is unavailable', async () => {
		const test = fixture();
		test.paths.delete('/rankings/current.json');
		await expect(loadCurrentShareAssets(test.assets)).rejects.toBeInstanceOf(ShareDataUnavailableError);
	});

	it('rejects mismatched immutable paths and invalid canonical profiles', async () => {
		const pathTest = fixture();
		pathTest.manifest.simulationUrl = '/data/other/simulation.json';
		await expect(loadCurrentShareAssets(pathTest.assets)).rejects.toBeInstanceOf(ShareDataIncompatibleError);

		const profileTest = fixture();
		const key = `/data/${DATA_VERSION}/F0-2020.json`;
		const profile = structuredClone(profileTest.paths.get(key)) as Array<Record<string, unknown>>;
		delete profile[0].defense;
		profileTest.paths.set(key, profile);
		await expect(loadTrustedShareData(profileTest.assets, profileTest.bucket, REPLAY_ID)).rejects.toBeInstanceOf(ShareDataIncompatibleError);
	});

	it('rejects old replay contracts instead of reinterpreting them', async () => {
		const test = fixture();
		const incompatible = { ...test.replay, schemaVersion: 3, modelVersion: 'pa-v2' };
		test.bucket.objects.set(`replays/v1/${REPLAY_ID}`, new TextEncoder().encode(JSON.stringify(incompatible)));
		await expect(loadTrustedShareData(test.assets, test.bucket, REPLAY_ID)).rejects.toThrow('incompatible');
	});
});
