import { describe, expect, it, vi } from 'vitest';

// Full 162-game seasons run here; parallel suites can slow each one well past the default.
vi.setConfig({ testTimeout: 60_000 });
import { stadiumSummary } from '../sim/park.ts';
import { availableCandidates, commitPick, createDraft, legalSlots, replayInput, rollDraft, selectHomeStadium } from '../game/draft.ts';
import { SLOTS, type Manifest } from '../game/types.ts';
import type { MediaManifest } from '../media/types.ts';
import type { WarRankings } from '../rankings/types.ts';
import { SHARE_DIMENSIONS, SHARE_FORMATS, type ShareFormat } from '../share/types.ts';
import { testSeason } from '../sim/test-fixtures.ts';
import type { ReplayAssets, ReplayBucket, ReplayPutOptions } from './replays.ts';
import {
	ShareAuthorizationError,
	ShareIncompatibleError,
	ShareNotFoundError,
	loadAuthenticatedShareModel,
	loadPublishedShareImage,
	parseShareFormat,
	prepareSharePublication,
	readSharePublication,
	type ShareBrowserBinding,
	type ShareScreenshotOptions,
	type ShareServerBindings
} from './share-images.ts';

const DATA_VERSION = '1'.repeat(64);
const MEDIA_VERSION = '2'.repeat(64);
const RANKING_VERSION = '3'.repeat(64);
const RENDERER_VERSION = '4'.repeat(64);
const REPLAY_ID = 'S'.repeat(22);
const ORIGIN = 'https://game.example';

class MemoryBucket implements ReplayBucket {
	objects = new Map<string, Uint8Array>();
	conditionalPublicationLoss = false;
	async get(key: string) {
		const body = this.objects.get(key);
		return body ? { body } : null;
	}
	async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions) {
		const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
		if (options?.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
		this.objects.set(key, Uint8Array.from(bytes));
		if (this.conditionalPublicationLoss && key.endsWith('/manifest.json') && key.startsWith('shares/v1/replays/')) {
			this.conditionalPublicationLoss = false;
			return null;
		}
		return {};
	}
}

function png(width: number, height: number, marker = 0): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(25);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
	bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width, false);
	view.setUint32(20, height, false);
	bytes[24] = marker;
	return bytes;
}

class BrowserStub implements ShareBrowserBinding {
	calls: ShareScreenshotOptions[] = [];
	failCall: number | null = null;
	async quickAction(action: 'screenshot', options: ShareScreenshotOptions): Promise<Response> {
		expect(action).toBe('screenshot');
		this.calls.push(options);
		if (this.failCall === this.calls.length) return new Response('capture failed', { status: 503 });
		const image = png(options.viewport.width, options.viewport.height, this.calls.length);
		return new Response(image.buffer, { headers: { 'content-type': 'image/png' } });
	}
}

function fixture(): { bindings: ShareServerBindings; bucket: MemoryBucket; browser: BrowserStub; paths: Map<string, unknown> } {
	const season = testSeason(921);
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
	const manifest = {
		schemaVersion: 1,
		dataVersion: DATA_VERSION,
		sourceCommit: 'fixture',
		franchises: Array.from({ length: 30 }, (_, index) => ({ id: `F${index}`, name: `Club ${index}`, decades: [2020] })),
		candidates,
		stadiums: season.data.stadiums.map(stadium => stadiumSummary(stadium, null)),
		chunks: Object.fromEntries(candidates.map(candidate => [
			`${candidate.franchiseId}-${candidate.decade}`,
			`/data/${DATA_VERSION}/${candidate.franchiseId}-${candidate.decade}.json`
		])),
		simulationUrl: `/data/${DATA_VERSION}/simulation.json`,
		showcaseUrl: `/data/${DATA_VERSION}/showcase.json`,
		attributionUrl: `/data/${DATA_VERSION}/attribution.json`,
		archiveUrl: `/data/${DATA_VERSION}/archive.json`,
		approximations: [], coverage: [],
		diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
		attribution: {
			title: 'Synthetic stats', credit: 'Synthetic fixture', sourceUrl: 'https://example.invalid/stats',
			license: 'Fixture license', licenseUrl: 'https://example.invalid/license', sourceCommit: 'fixture',
			changes: 'Synthetic test data.', fullNotice: 'Synthetic test data.'
		}
	} as Manifest;
	let draft = selectHomeStadium(createDraft(manifest, season.seed), manifest, season.homeStadium.id);
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		const candidate = availableCandidates(draft, manifest)[0];
		draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
	}
	const media: MediaManifest = {
		schemaVersion: 3, version: MEDIA_VERSION, dataVersion: DATA_VERSION, modifications: 'Synthetic fixture.',
		teams: {}, players: {}, atmosphere: {},
		diagnostics: { playersSearched: 0, playersWithPhotos: 0, photos: 0, logos: 0, historicalLogos: 0, atmospherePhotos: 0, excluded: 0 }
	};
	const rankings: WarRankings = {
		schemaVersion: 1, dataVersion: DATA_VERSION, rankingVersion: RANKING_VERSION,
		source: {
			name: 'Synthetic WAR', url: 'https://example.invalid/war', licenceUrl: 'https://example.invalid/license',
			licenceText: 'Fixture license', commit: '5'.repeat(40), description: 'Synthetic fixture rankings.'
		},
		seasons: {}, coverage: { candidates: 0, batting: 0, pitching: 0, missing: candidates.length }
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
	bucket.objects.set(`replays/v1/${REPLAY_ID}`, new TextEncoder().encode(JSON.stringify(replayInput(draft))));
	const browser = new BrowserStub();
	return {
		bindings: { ASSETS: assets, REPLAYS: bucket, BROWSER: browser, PUBLIC_ORIGIN: ORIGIN, SHARE_CAPTURE_TOKEN: 'capture-secret' },
		bucket,
		browser,
		paths
	};
}

async function digest(bytes: Uint8Array): Promise<string> {
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));
	return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

describe('trusted immutable share publication', () => {
	it('recomputes the real season and captures all exact formats with authenticated documented options', async () => {
		const test = fixture();
		const publication = await prepareSharePublication(test.bindings, REPLAY_ID);
		expect(publication).toMatchObject({ schemaVersion: 1, replayId: REPLAY_ID, replayUrl: `${ORIGIN}/r/${REPLAY_ID}` });
		expect(publication.record.wins + publication.record.losses).toBe(162);
		expect(test.browser.calls).toHaveLength(3);
		for (const [index, format] of SHARE_FORMATS.entries()) {
			const options = test.browser.calls[index];
			expect(options.url).toBe(`${ORIGIN}/__share/${publication.modelDigest}/${format}`);
			expect(options.setExtraHTTPHeaders).toEqual({ 'x-share-capture-token': 'capture-secret' });
			expect(options.selector).toBe('[data-share-artwork][data-share-ready="true"]');
			expect(options.waitForSelector.selector).toBe(options.selector);
			expect(options.viewport).toEqual({ ...SHARE_DIMENSIONS[format], deviceScaleFactor: 1 });
			expect(publication.images[format]).toMatchObject({ ...SHARE_DIMENSIONS[format] });
		}
	});

	it('returns exact stored PNG bytes and cached publication reads never invoke capture', async () => {
		const test = fixture();
		const publication = await prepareSharePublication(test.bindings, REPLAY_ID);
		const calls = test.browser.calls.length;
		expect(await prepareSharePublication(test.bindings, REPLAY_ID)).toEqual(publication);
		expect(await readSharePublication(test.bindings, REPLAY_ID)).toEqual(publication);
		expect(test.browser.calls).toHaveLength(calls);

		for (const format of SHARE_FORMATS) {
			const loaded = await loadPublishedShareImage(test.bindings, REPLAY_ID, format);
			expect(loaded.bytes).toEqual(test.bucket.objects.get(`shares/v1/images/${loaded.image.sha256}.png`));
			expect(await digest(loaded.bytes)).toBe(loaded.image.sha256);
			expect(loaded.etag).toBe(`"${loaded.image.sha256}"`);
			expect(new DataView(loaded.bytes.buffer, loaded.bytes.byteOffset).getUint32(16, false)).toBe(SHARE_DIMENSIONS[format].width);
		}
		expect(test.browser.calls).toHaveLength(calls);
	});

	it('publishes no manifest when the third capture fails and a later explicit retry succeeds', async () => {
		const test = fixture();
		test.browser.failCall = 3;
		await expect(prepareSharePublication(test.bindings, REPLAY_ID)).rejects.toThrow('capture failed');
		expect(test.bucket.objects.has(`replays/v1/${REPLAY_ID}`)).toBe(true);
		expect(test.bucket.objects.has(`shares/v1/replays/${REPLAY_ID}/manifest.json`)).toBe(false);
		expect([...test.bucket.objects.keys()].filter(key => key.startsWith('shares/v1/images/'))).toHaveLength(2);

		test.browser.failCall = null;
		const publication = await prepareSharePublication(test.bindings, REPLAY_ID);
		expect(publication.images.wide).toMatchObject(SHARE_DIMENSIONS.wide);
		expect(test.bucket.objects.has(`shares/v1/replays/${REPLAY_ID}/manifest.json`)).toBe(true);
	});

	it('shares one in-isolate preparation and reads the conditional publication winner', async () => {
		const test = fixture();
		test.bucket.conditionalPublicationLoss = true;
		const [left, right] = await Promise.all([
			prepareSharePublication(test.bindings, REPLAY_ID),
			prepareSharePublication(test.bindings, REPLAY_ID)
		]);
		expect(left).toEqual(right);
		expect(test.browser.calls).toHaveLength(3);
		expect(await readSharePublication(test.bindings, REPLAY_ID)).toEqual(left);
	});

	it('authenticates stored canonical models and rejects wrong tokens, malformed digests, and pin drift', async () => {
		const test = fixture();
		const publication = await prepareSharePublication(test.bindings, REPLAY_ID);
		await expect(loadAuthenticatedShareModel(test.bindings, publication.modelDigest, 'wrong')).rejects.toBeInstanceOf(ShareAuthorizationError);
		await expect(loadAuthenticatedShareModel(test.bindings, 'not-a-digest', 'capture-secret')).rejects.toBeInstanceOf(ShareNotFoundError);
		const model = await loadAuthenticatedShareModel(test.bindings, publication.modelDigest, 'capture-secret');
		expect(model).toMatchObject({ replayId: REPLAY_ID, rendererVersion: RENDERER_VERSION, dataVersion: DATA_VERSION });

		const forged = structuredClone(model);
		forged.cards[0].card.photo = 'https://attacker.invalid/forged.webp';
		const forgedBytes = new TextEncoder().encode(JSON.stringify(forged));
		const forgedDigest = await digest(forgedBytes);
		test.bucket.objects.set(`shares/v1/models/${forgedDigest}.json`, forgedBytes);
		await expect(loadAuthenticatedShareModel(test.bindings, forgedDigest, 'capture-secret')).rejects.toBeInstanceOf(ShareIncompatibleError);

		test.paths.set('/share/current.json', { schemaVersion: 1, rendererVersion: '9'.repeat(64) });
		await expect(loadAuthenticatedShareModel(test.bindings, publication.modelDigest, 'capture-secret')).rejects.toBeInstanceOf(ShareIncompatibleError);
	});

	it('rejects malformed formats, ids, PNG dimensions, and hashes without capture', async () => {
		expect(() => parseShareFormat('poster')).toThrow(ShareNotFoundError);
		const test = fixture();
		await expect(readSharePublication(test.bindings, '../escape')).rejects.toBeInstanceOf(ShareNotFoundError);
		const publication = await prepareSharePublication(test.bindings, REPLAY_ID);
		const format: ShareFormat = 'wide';
		const image = publication.images[format];
		const calls = test.browser.calls.length;
		test.bucket.objects.set(`shares/v1/images/${image.sha256}.png`, png(1, 1));
		await expect(loadPublishedShareImage(test.bindings, REPLAY_ID, format)).rejects.toBeInstanceOf(ShareIncompatibleError);
		test.bucket.objects.set(
			`shares/v1/images/${image.sha256}.png`,
			png(SHARE_DIMENSIONS.wide.width, SHARE_DIMENSIONS.wide.height, 255)
		);
		await expect(loadPublishedShareImage(test.bindings, REPLAY_ID, format)).rejects.toBeInstanceOf(ShareIncompatibleError);
		expect(test.browser.calls).toHaveLength(calls);
	});
});
