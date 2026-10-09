import type { Page, Route } from '@playwright/test';
import { syntheticProfile } from '../../src/lib/sim/fixtures.ts';
import type { Manifest, Profile, ShowcaseCard } from '../../src/lib/game/types.ts';
import { SLOTS } from '../../src/lib/game/types.ts';

const DATA_VERSION = '9'.repeat(64);
const MEDIA_VERSION = '8'.repeat(64);
const RANKING_VERSION = '7'.repeat(64);

export interface HistoricalFixtureOptions {
	failedChunk?: string;
	corruptChunk?: string;
	mediaFailure?: boolean;
	rankingsFailure?: boolean;
}

export interface HistoricalFixtureController {
	recoverChunks(): void;
	recover(): void;
}

function fixtureProfile(franchiseId: string, decade: number): Profile {
	const value = syntheticProfile(`historical-${franchiseId}-${decade}`);
	value.seasonId = `${franchiseId}:historical:${decade}`;
	value.playerId = `historical-player-${franchiseId}-${decade}`;
	value.displayName = `Historical ${franchiseId} Player`;
	value.franchiseId = franchiseId;
	value.teamId = `${franchiseId}-team`;
	value.year = decade + 5;
	value.historicalTeam = `Historical ${franchiseId} Club`;
	value.eligibleSlots = ['DH'];
	value.primaryHitterSlot = 'DH';
	value.appearances = { DH: 100 };
	return value;
}

function buildManifest(decade: number, profiles: Profile[]): Manifest {
	const candidates = profiles.map(profile => ({
		seasonId: profile.seasonId,
		playerId: profile.playerId,
		franchiseId: profile.franchiseId,
		decade,
		eligibleSlots: [...profile.eligibleSlots]
	}));
	return {
		schemaVersion: 1,
		dataVersion: DATA_VERSION,
		sourceCommit: 'fixture',
		franchises: Array.from({ length: 30 }, (_, index) => ({ id: `F${String(index).padStart(2, '0')}`, name: `Fixture Club ${String(index).padStart(2, '0')}`, decades: [decade] })),
		candidates,
		chunks: Object.fromEntries(profiles.map(profile => [
			`${profile.franchiseId}-${decade}`,
			`/data/${DATA_VERSION}/${profile.franchiseId}-${decade}.json`
		])),
		simulationUrl: `/data/${DATA_VERSION}/simulation.json`,
		showcaseUrl: `/data/${DATA_VERSION}/showcase.json`,
		attributionUrl: `/data/${DATA_VERSION}/attribution.json`,
		archiveUrl: `/data/${DATA_VERSION}/archive.tar.gz`,
		attribution: { title: 'Fixture', credit: 'Fixture', sourceUrl: 'https://example.invalid/source', license: 'Fixture', licenseUrl: 'https://example.invalid/license', sourceCommit: 'fixture', changes: 'Fixture', fullNotice: 'Fixture' },
		approximations: [],
		coverage: [],
		diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: `/data/${DATA_VERSION}/diagnostics.json` }
	};
}

function mediaManifest(): Record<string, unknown> {
	return {
		schemaVersion: 2,
		version: MEDIA_VERSION,
		dataVersion: DATA_VERSION,
		modifications: 'Fixture',
		teams: {},
		players: {},
		atmosphere: {},
		diagnostics: { playersSearched: 0, playersWithPhotos: 0, photos: 0, logos: 0, historicalLogos: 0, atmospherePhotos: 0, excluded: 0 }
	};
}

function rankingsManifest(): Record<string, unknown> {
	return {
		schemaVersion: 1,
		dataVersion: DATA_VERSION,
		rankingVersion: RANKING_VERSION,
		source: { name: 'Fixture', url: 'https://example.invalid/source', licenceUrl: 'https://example.invalid/license', licenceText: 'Fixture', commit: 'a'.repeat(40), description: 'Fixture' },
		seasons: {},
		coverage: { candidates: 0, batting: 0, pitching: 0, missing: 0 }
	};
}
function galleryCard(profile: Profile): ShowcaseCard {
	const slot = SLOTS.find(value => profile.eligibleSlots.includes(value));
	if (!slot) throw new Error(`Fixture profile ${profile.seasonId} has no canonical slot`);
	return { profile, slot };
}

async function fulfillJson(route: Route, value: unknown): Promise<void> {
	await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
}

export async function routeHistoricalFixture(page: Page, decade: number, options: HistoricalFixtureOptions = {}): Promise<HistoricalFixtureController> {
	let failedChunk = options.failedChunk;
	let corruptChunk = options.corruptChunk;
	let mediaFailure = options.mediaFailure ?? false;
	let rankingsFailure = options.rankingsFailure ?? false;
	const profiles = Array.from({ length: 30 }, (_, index) => `F${String(index).padStart(2, '0')}`)
		.filter(franchiseId => franchiseId !== 'F00')
		.map(franchiseId => fixtureProfile(franchiseId, decade));
	const manifest = buildManifest(decade, profiles);

	await page.route('**/data/current.json', route => fulfillJson(route, { schemaVersion: 1, dataVersion: DATA_VERSION, manifestUrl: `/data/${DATA_VERSION}/manifest.json` }));
	await page.route(`**/data/${DATA_VERSION}/manifest.json`, route => fulfillJson(route, manifest));
	await page.route(`**/data/${DATA_VERSION}/*.json`, route => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith('/manifest.json')) return fulfillJson(route, manifest);
		const filename = path.split('/').pop()?.replace('.json', '') ?? '';
		if (!filename.startsWith('gallery-')) return route.fulfill({ status: 404, body: 'full profile chunks are not fixture assets' });
		const key = filename.slice('gallery-'.length);
		const profileSet = profiles.filter(profile => `${profile.franchiseId}-${decade}` === key);
		const franchiseId = profileSet[0]?.franchiseId ?? key.split('-')[0];
		if (!manifest.chunks[key]) return route.fulfill({ status: 404, body: 'gallery card unavailable' });
		if (franchiseId === failedChunk) return route.fulfill({ status: 503, body: 'failed gallery card' });
		if (franchiseId === corruptChunk) return fulfillJson(route, []);
		const card = profileSet[0] && galleryCard(profileSet[0]);
		return card ? fulfillJson(route, card) : route.fulfill({ status: 404, body: 'gallery card absent' });
	});
	await page.route('**/media/current.json', route => mediaFailure
		? route.fulfill({ status: 503, body: 'media unavailable' })
		: fulfillJson(route, { schemaVersion: 2, version: MEDIA_VERSION, manifestUrl: `/media/${MEDIA_VERSION}/manifest.json` }));
	await page.route(`**/media/${MEDIA_VERSION}/manifest.json`, route => fulfillJson(route, mediaManifest()));
	await page.route('**/rankings/current.json', route => rankingsFailure
		? route.fulfill({ status: 503, body: 'rankings unavailable' })
		: fulfillJson(route, { schemaVersion: 1, dataVersion: DATA_VERSION, rankingVersion: RANKING_VERSION, manifestUrl: `/rankings/${RANKING_VERSION}/manifest.json` }));
	await page.route(`**/rankings/${RANKING_VERSION}/manifest.json`, route => fulfillJson(route, rankingsManifest()));

	return {
		recoverChunks() {
			failedChunk = undefined;
			corruptChunk = undefined;
		},
		recover() {
			failedChunk = undefined;
			corruptChunk = undefined;
			mediaFailure = false;
			rankingsFailure = false;
		}
	};
}
