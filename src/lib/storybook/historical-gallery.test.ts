import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { neutralDefensivePosition } from '#lib/sim/defense.ts';
import { syntheticProfile } from '#lib/sim/fixtures.ts';
import { compareId, SLOTS, type Manifest, type Profile, type ShowcaseCard } from '#lib/game/types.ts';

// Dynamic import is intentional: resetModules gives each test a fresh loader/cache while retries stay in one module instance.
async function loadEra(decade: number) {
	const module = await import('./historical-gallery.ts');
	return module.loadHistoricalEra(decade);
}
const hex = (letter: string): string => letter.repeat(64);

function profile(franchiseId: string, seasonId: string, year: number, slot: 'DH' | '2B' = 'DH'): Profile {
	const value = syntheticProfile(`${franchiseId}-player`);
	value.seasonId = seasonId;
	value.franchiseId = franchiseId;
	value.teamId = `${franchiseId}-team`;
	value.displayName = `${franchiseId} Player`;
	value.year = year;
	value.historicalTeam = `${franchiseId} Club`;
	value.eligibleSlots = [slot];
	value.primaryHitterSlot = slot;
	value.appearances = { [slot]: 100 };
	value.defense = { positions: slot === 'DH' ? {} : { [slot]: neutralDefensivePosition(slot) } };
	return value;
}

function galleryCard(profiles: Profile[]): ShowcaseCard | null {
	const profile = [...profiles].sort((a, b) => compareId(a.seasonId, b.seasonId)).find(value => SLOTS.some(slot => value.eligibleSlots.includes(slot)));
	if (!profile) return null;
	const slot = SLOTS.find(value => profile.eligibleSlots.includes(value));
	return slot ? { profile, slot } : null;
}

function manifest(dataVersion: string, profiles: Profile[]): Manifest {
	const candidates = profiles.map(value => ({
		seasonId: value.seasonId,
		playerId: value.playerId,
		franchiseId: value.franchiseId,
		decade: Math.floor(value.year / 10) * 10,
		eligibleSlots: [...value.eligibleSlots]
	}));
	return {
		schemaVersion: 1,
		dataVersion,
		sourceCommit: 'fixture',
		franchises: Array.from({ length: 30 }, (_, index) => ({ id: `F${String(index).padStart(2, '0')}`, name: `Club ${String(index).padStart(2, '0')}`, decades: [1950, 2020] })),
		candidates,
		chunks: Object.fromEntries(new Set(candidates.map(value => [
			`${value.franchiseId}-${value.decade}`,
			`/data/${dataVersion}/${value.franchiseId}-${value.decade}.json`
		]))),
		simulationUrl: `/data/${dataVersion}/simulation.json`,
		showcaseUrl: `/data/${dataVersion}/showcase.json`,
		attributionUrl: `/data/${dataVersion}/attribution.json`,
		archiveUrl: `/data/${dataVersion}/archive.tar.gz`,
		attribution: { title: 'Fixture', credit: 'Fixture', sourceUrl: 'https://example.invalid/source', license: 'Fixture', licenseUrl: 'https://example.invalid/license', sourceCommit: 'fixture', changes: 'Fixture', fullNotice: 'Fixture' },
		approximations: [],
		coverage: [],
		diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: `/data/${dataVersion}/diagnostics.json` }
	};
}

function mediaManifest(version: string, dataVersion: string): Record<string, unknown> {
	return {
		schemaVersion: 2,
		version,
		dataVersion,
		modifications: 'Fixture',
		teams: {},
		players: {},
		atmosphere: {},
		diagnostics: { playersSearched: 0, playersWithPhotos: 0, photos: 0, logos: 0, historicalLogos: 0, atmospherePhotos: 0, excluded: 0 }
	};
}

function rankingsManifest(rankingVersion: string, dataVersion: string): Record<string, unknown> {
	return {
		schemaVersion: 1,
		dataVersion,
		rankingVersion,
		source: { name: 'Fixture', url: 'https://example.invalid/source', licenceUrl: 'https://example.invalid/license', licenceText: 'Fixture', commit: 'a'.repeat(40), description: 'Fixture' },
		seasons: {},
		coverage: { candidates: 0, batting: 0, pitching: 0, missing: 0 }
	};
}

function installFixture(data: Manifest, profiles: Profile[], options: { failedChunk?: string; corruptChunk?: string; mediaFailure?: boolean; rankingsFailure?: boolean } = {}): void {
	const mediaVersion = data.dataVersion;
	const rankingVersion = data.dataVersion.replace(/^./, 'c');
	const routes = new Map<string, () => Response>();
	routes.set('/data/current.json', () => Response.json({ schemaVersion: 1, dataVersion: data.dataVersion, manifestUrl: `/data/${data.dataVersion}/manifest.json` }));
	routes.set(`/data/${data.dataVersion}/manifest.json`, () => Response.json(data));
	const grouped = new Map<string, Profile[]>();
	for (const value of profiles) {
		const key = `${value.franchiseId}-${Math.floor(value.year / 10) * 10}`;
		const chunk = grouped.get(key) ?? [];
		chunk.push(value);
		grouped.set(key, chunk);
	}
	for (const [chunkKey, chunk] of grouped) {
		const [franchiseId] = chunkKey.split('-');
		if (!data.chunks[chunkKey]) continue;
		const url = `/data/${data.dataVersion}/gallery-${chunkKey}.json`;
		routes.set(url, () => {
			if (franchiseId === options.failedChunk) return new Response('failed', { status: 503 });
			if (franchiseId === options.corruptChunk) return Response.json([]);
			const card = galleryCard(chunk);
			return card ? Response.json(card) : new Response('missing gallery card', { status: 404 });
		});
	}
	routes.set('/media/current.json', () => options.mediaFailure
		? new Response('failed', { status: 503 })
		: Response.json({ schemaVersion: 2, version: mediaVersion, manifestUrl: `/media/${mediaVersion}/manifest.json` }));
	routes.set(`/media/${mediaVersion}/manifest.json`, () => Response.json(mediaManifest(mediaVersion, data.dataVersion)));
	routes.set('/rankings/current.json', () => options.rankingsFailure
		? new Response('failed', { status: 503 })
		: Response.json({ schemaVersion: 1, dataVersion: data.dataVersion, rankingVersion, manifestUrl: `/rankings/${rankingVersion}/manifest.json` }));
	routes.set(`/rankings/${rankingVersion}/manifest.json`, () => Response.json(rankingsManifest(rankingVersion, data.dataVersion)));
	vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => routes.get(String(input))?.() ?? new Response('missing', { status: 404 })));
}

beforeEach(() => vi.resetModules());

describe('historical era gallery loading', () => {
	it('keeps present cards when media or rankings fail, then retries through the production loaders', async () => {
		const version = hex('e');
		const present = profile('F05', 'present-season', 1955);
		const data = manifest(version, [present]);
		installFixture(data, [present], { mediaFailure: true, rankingsFailure: true });
		const unavailable = await loadEra(1950);
		expect(unavailable.entries[5]).toMatchObject({ state: 'present' });
		expect(unavailable.media).toBeNull();
		expect(unavailable.mediaStatus).toBe('unavailable');
		expect(unavailable.rankings).toBeNull();

		installFixture(data, [present]);
		const retried = await loadEra(1950);
		expect(retried.entries[5]).toMatchObject({ state: 'present', profile: { seasonId: 'present-season' } });
		expect(retried.mediaStatus).toBe('ready');
		expect(retried.media).not.toBeNull();
		expect(retried.rankings).not.toBeNull();
	});
	it('returns all thirty franchises sorted by id, preserving exact season and canonical slot selection', async () => {
		const version = hex('a');
		const first = profile('F02', 'z-season', 1955, '2B');
		const smallest = profile('F02', 'a-season', 1956, 'DH');
		smallest.eligibleSlots = ['SP1', '2B', 'DH'];
		smallest.appearances = { '2B': 100, DH: 100 };
		smallest.defense = { positions: { '2B': neutralDefensivePosition('2B') } };
		const other = profile('F19', 'other-season', 1951, 'DH');
		const data = manifest(version, [first, smallest, other]);
		installFixture(data, [first, smallest, other]);
		const loaded = await loadEra(1950);
		expect(loaded.entries).toHaveLength(30);
		expect(loaded.entries.map(entry => entry.franchise.id)).toEqual(Array.from({ length: 30 }, (_, index) => `F${String(index).padStart(2, '0')}`));
		expect(loaded.entries[2]).toMatchObject({ state: 'present', profile: { seasonId: 'a-season', year: 1956 }, slot: '2B' });
		expect(loaded.entries[19]).toMatchObject({ state: 'present', profile: { seasonId: 'other-season' }, slot: 'DH' });
		expect(loaded.entries[0]).toMatchObject({ state: 'absent' });
	});

	it('distinguishes a failed prepared gallery card from an absent franchise', async () => {
		const version = hex('d');
		const failed = profile('F03', 'failed-season', 1955);
		const present = profile('F04', 'present-season', 1955);
		const data = manifest(version, [failed, present]);
		installFixture(data, [failed, present], { failedChunk: 'F03' });
		const loaded = await loadEra(1950);
		expect(loaded.entries[3]).toMatchObject({ state: 'error', franchise: { id: 'F03' } });
		expect(loaded.entries[4]).toMatchObject({ state: 'present', profile: { seasonId: 'present-season' } });
	});
	it('keeps missing and corrupt prepared gallery cards distinct from absence, and recovers a failed card on retry', async () => {
		const version = hex('f');
		const missing = profile('F06', 'missing-season', 1955);
		const corrupt = profile('F07', 'corrupt-season', 1955);
		const failed = profile('F08', 'failed-season', 1955);
		const data = manifest(version, [missing, corrupt, failed]);
		delete data.chunks['F06-1950'];
		installFixture(data, [missing, corrupt, failed], { corruptChunk: 'F07', failedChunk: 'F08' });
		const broken = await loadEra(1950);
		expect(broken.entries[6]).toMatchObject({ state: 'error', franchise: { id: 'F06' } });
		expect(broken.entries[7]).toMatchObject({ state: 'error', franchise: { id: 'F07' } });
		expect(broken.entries[8]).toMatchObject({ state: 'error', franchise: { id: 'F08' } });
		expect(broken.entries[9]).toMatchObject({ state: 'absent' });

		installFixture(data, [missing, corrupt, failed]);
		const recovered = await loadEra(1950);
		expect(recovered.entries[8]).toMatchObject({ state: 'present', profile: { seasonId: 'failed-season' } });
	});

});
