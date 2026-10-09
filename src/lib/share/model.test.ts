import { describe, expect, it } from 'vitest';
import { SLOTS, type Draft, type Manifest } from '../game/types.ts';
import type { MediaManifest } from '../media/types.ts';
import type { WarRankings } from '../rankings/types.ts';
import { testSeason } from '../sim/test-fixtures.ts';
import type { GameResult, SeasonResult } from '../sim/types.ts';
import { canonicalShareRenderModelJson, createShareRenderModel, type CreateShareRenderModelInput } from './model.ts';
import type { ShareRenderModel } from './types.ts';

function fixture(): CreateShareRenderModelInput {
	const season = testSeason(162);
	const picks = season.roster.map(({ profile, slot }) => ({
		seasonId: profile.seasonId,
		slot,
		franchiseId: profile.franchiseId,
		decade: Math.floor(profile.year / 10) * 10
	}));
	const draft: Draft = {
		schemaVersion: 4,
		modelVersion: 'pa-v3',
		dataVersion: season.data.dataVersion,
		seed: season.seed,
		picks,
		battingOrder: [...season.battingOrder],
		starterOrder: [...season.starterOrder],
		actions: [],
		currentRoll: null
	};
	const manifest: Manifest = {
		schemaVersion: 1,
		dataVersion: season.data.dataVersion,
		sourceCommit: 'synthetic',
		franchises: [],
		candidates: season.roster.map(({ profile, slot }) => ({
			seasonId: profile.seasonId,
			playerId: profile.playerId,
			franchiseId: profile.franchiseId,
			decade: Math.floor(profile.year / 10) * 10,
			eligibleSlots: [slot]
		})),
		chunks: {},
		simulationUrl: '/synthetic/simulation.json',
		showcaseUrl: '/synthetic/showcase.json',
		attributionUrl: '/synthetic/attribution.json',
		archiveUrl: '/synthetic/archive.json',
		attribution: { title: 'Synthetic source', credit: 'Test fixture', sourceUrl: 'https://example.test/source', license: 'Test', licenseUrl: 'https://example.test/license', sourceCommit: 'synthetic', changes: 'Synthetic fixture', fullNotice: 'Synthetic fixture only.' },
		approximations: [],
		coverage: [],
		diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '/synthetic/report.json' }
	};
	const games = Array.from({ length: 162 }, (_, index) => ({ number: index + 1 } as GameResult));
	const result: SeasonResult = {
		modelVersion: 'pa-v3', dataVersion: season.data.dataVersion, seed: season.seed,
		defenseMethodVersion: 'defense-v1', valuationVersion: 'sim-war-v1',
		wins: 100, losses: 62, firstLoss: 3, longestWinningStreak: 12, runsFor: 811, runsAgainst: 644,
		games, batting: [], pitching: [], starterStarts: [54, 54, 54], highlight: null, lowlight: null
	};
	return { draft, result, profiles: season.roster.map(pick => pick.profile), manifest, media: null, rankings: null };
}

function publishedAssets(dataVersion: string): { media: MediaManifest; rankings: WarRankings } {
	return {
		media: {
			schemaVersion: 3, version: 'media-pin', dataVersion, modifications: 'Synthetic fixture',
			teams: {}, players: {}, atmosphere: {},
			diagnostics: { playersSearched: 0, playersWithPhotos: 0, photos: 0, logos: 0, historicalLogos: 0, atmospherePhotos: 0, excluded: 0 }
		},
		rankings: {
			schemaVersion: 1, dataVersion, rankingVersion: 'ranking-pin',
			source: { name: 'Synthetic source', url: 'https://example.test/source', licenceUrl: 'https://example.test/license', licenceText: 'Test', commit: 'synthetic', description: 'Synthetic fixture' },
			seasons: {}, coverage: { candidates: 0, batting: 0, pitching: 0, missing: 0 }
		}
	};
}

describe('share render model', () => {
	it('builds one deterministic canonical card array in slot order', () => {
		const input = fixture();
		const first = createShareRenderModel({ ...input, profiles: [...input.profiles].reverse(), draft: { ...input.draft, picks: [...input.draft.picks].reverse() } });
		const second = createShareRenderModel(input);
		expect(first.cards.map(card => card.slot)).toEqual(SLOTS);
		expect(first.cards.map(card => card.seasonId)).toEqual(SLOTS.map(slot => input.draft.picks.find(pick => pick.slot === slot)!.seasonId));
		expect(first).toEqual(second);
		expect(canonicalShareRenderModelJson(first)).toBe(canonicalShareRenderModelJson(second));
		const reverseKeyOrder = Object.fromEntries(Object.entries(first).reverse()) as unknown as ShareRenderModel;
		expect(canonicalShareRenderModelJson(reverseKeyOrder)).toBe(canonicalShareRenderModelJson(first));
	});

	it('keeps local links null and derives a published URL only from complete trusted pins', () => {
		const input = fixture();
		const local = createShareRenderModel(input);
		expect(local).toMatchObject({ replayId: null, replayUrl: null, rendererVersion: null, mediaVersion: null, rankingVersion: null });
		const assets = publishedAssets(input.manifest.dataVersion);
		const published = createShareRenderModel({
			...input, ...assets, replayId: 'Abcdefghijklmnopqrstuv', publicOrigin: 'https://example.test', rendererVersion: 'a'.repeat(64)
		});
		expect(published.replayUrl).toBe('https://example.test/r/Abcdefghijklmnopqrstuv');
		expect(published).toMatchObject({ mediaVersion: 'media-pin', rankingVersion: 'ranking-pin', rendererVersion: 'a'.repeat(64) });
		expect(() => createShareRenderModel({ ...input, replayId: 'Abcdefghijklmnopqrstuv' })).toThrow(/require replay, origin, and renderer pins/);
	});

	it('rejects duplicate slots and mismatched profile identities', () => {
		const input = fixture();
		const duplicateSlot = input.draft.picks.map((pick, index) => index === 1 ? { ...pick, slot: input.draft.picks[0].slot } : pick);
		expect(() => createShareRenderModel({ ...input, draft: { ...input.draft, picks: duplicateSlot } })).toThrow(/duplicate slot/);
		expect(() => createShareRenderModel({
			...input,
			draft: { ...input.draft, battingOrder: Array(9).fill(input.draft.battingOrder[0]) }
		})).toThrow(/lineup order/);
		const profiles = [...input.profiles];
		profiles[1] = { ...profiles[1], seasonId: profiles[0].seasonId };
		expect(() => createShareRenderModel({ ...input, profiles })).toThrow(/duplicate profile identity/);
		const wrongPlayer = [...input.profiles];
		wrongPlayer[0] = { ...wrongPlayer[0], playerId: 'different-player' };
		expect(() => createShareRenderModel({ ...input, profiles: wrongPlayer })).toThrow(/does not match slot/);
	});

	it('rejects incomplete and internally inconsistent season counts', () => {
		const input = fixture();
		expect(() => createShareRenderModel({ ...input, result: { ...input.result, wins: 99 } })).toThrow(/complete 162-game season/);
		expect(() => createShareRenderModel({ ...input, result: { ...input.result, firstLoss: null } })).toThrow(/losses must identify/);
		expect(() => createShareRenderModel({ ...input, result: { ...input.result, runsFor: 4.5 } })).toThrow(/runs for/);
		expect(() => createShareRenderModel({ ...input, result: { ...input.result, longestWinningStreak: 101 } })).toThrow(/winning streak/);
		const undefeated = createShareRenderModel({ ...input, result: { ...input.result, wins: 162, losses: 0, firstLoss: null, longestWinningStreak: 162 } });
		expect(undefeated.record.firstLoss).toBeNull();
		const profiles = [...input.profiles];
		profiles[0] = { ...profiles[0], batting: { ...profiles[0].batting!, AB: 4.5 } };
		expect(() => createShareRenderModel({ ...input, profiles })).toThrow(/statistical count/);
	});
});
