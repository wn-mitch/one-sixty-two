import { stadiumSummary } from '../sim/park.ts';
import { describe, expect, it } from 'vitest';
import { MODEL_VERSION, RULES_VERSION, SLOTS, type Draft, type Manifest } from '../game/types.ts';
import type { MediaManifest } from '../media/types.ts';
import type { WarRankings } from '../rankings/types.ts';
import { testSeason } from '../sim/test-fixtures.ts';
import type { GameResult, SeasonResult } from '../sim/types.ts';
import { createShareRenderModel, type CreateShareRenderModelInput } from './model.ts';
import { previewCards } from './og-cards.ts';
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
		schemaVersion: 8,
		modelVersion: MODEL_VERSION,
		rulesVersion: RULES_VERSION,
		dataVersion: season.data.dataVersion,
		seed: season.seed,
		homeStadium: season.homeStadium,
		picks,
		battingOrder: [...season.battingOrder],
		starterOrder: [...season.starterOrder],
		reliefRoles: season.reliefRoles,
		actions: [],
		currentRoll: null,
		packs: [],
		passed: []
	};
	const manifest: Manifest = {
		jackpot: [],
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
		stadiums: season.data.stadiums.map(stadium => stadiumSummary(stadium, null)),
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
		modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, dataVersion: season.data.dataVersion, seed: season.seed, homeStadium: season.homeStadium,
		defenseMethodVersion: 'defense-v2', valuationVersion: 'sim-war-v2',
		wins: 100, losses: 62, firstLoss: 3, longestWinningStreak: 12, runsFor: 811, runsAgainst: 644,
		games, batting: [], pitching: [], starterStarts: [54, 54, 54], highlight: null, lowlight: null, highlightTrace: null, lowlightTrace: null
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
		// Pick numbers follow draft order; everything else is independent of it.
		expect(first.cards.map(card => card.pickNumber)).toEqual(SLOTS.map((_, index) => SLOTS.length - index));
		expect(second.cards.map(card => card.pickNumber)).toEqual(SLOTS.map((_, index) => index + 1));
		const withoutPicks = (model: typeof first) => ({ ...model, cards: model.cards.map(({ pickNumber: _, ...card }) => card) });
		expect(withoutPicks(first)).toEqual(withoutPicks(second));
	});

	it('records the media and ranking versions it was drawn with', () => {
		const input = fixture();
		expect(createShareRenderModel(input)).toMatchObject({ mediaVersion: null, rankingVersion: null });
		expect(createShareRenderModel({ ...input, ...publishedAssets(input.manifest.dataVersion) })).toMatchObject({ mediaVersion: 'media-pin', rankingVersion: 'ranking-pin' });
	});

	it('carries the Results scouting label only when one was graded', () => {
		const input = fixture();
		expect(createShareRenderModel({ ...input, scouting: 'Sharp eye' }).scouting).toBe('Sharp eye');
		expect(createShareRenderModel({ ...input, scouting: null })).not.toHaveProperty('scouting');
	});

	it('collages the roster\'s best cards by WAR/162 in each card\'s role and leaves out weak ones', () => {
		const input = fixture();
		const assets = publishedAssets(input.manifest.dataVersion);
		const bySlot = new Map(input.draft.picks.map(pick => [pick.slot, pick.seasonId]));
		const seasons: WarRankings['seasons'] = {};
		// The catcher's pitching WAR is off-role and must be ignored; the closer has no ranking at all.
		seasons[bySlot.get('C')!] = { battingWAR162: 1, pitchingWAR162: 99 };
		seasons[bySlot.get('SS')!] = { battingWAR162: 9, pitchingWAR162: null };
		seasons[bySlot.get('SP1')!] = { battingWAR162: 50, pitchingWAR162: 8 };
		seasons[bySlot.get('CF')!] = { battingWAR162: 7, pitchingWAR162: null };
		seasons[bySlot.get('SP2')!] = { battingWAR162: null, pitchingWAR162: 6 };
		seasons[bySlot.get('1B')!] = { battingWAR162: 5, pitchingWAR162: null };
		seasons[bySlot.get('LF')!] = { battingWAR162: 2, pitchingWAR162: null };
		seasons[bySlot.get('RF')!] = { battingWAR162: 1.9, pitchingWAR162: null };
		seasons[bySlot.get('CL')!] = { battingWAR162: null, pitchingWAR162: null };
		const model = createShareRenderModel({ ...input, ...assets, rankings: { ...assets.rankings, seasons } });
		expect(model.cards.find(card => card.slot === 'C')!.war).toBe(1);
		expect(model.cards.find(card => card.slot === 'SP1')!.war).toBe(8);
		expect(model.cards.find(card => card.slot === 'CL')!.war).toBeNull();
		// LF sits exactly on the bar; RF and the off-role catcher fall below it.
		expect(previewCards(model.cards).map(card => card.slot)).toEqual(['SS', 'SP1', 'CF', 'SP2', '1B', 'LF']);
		// A weak roster still shows its best four, and never more than eight.
		const weak = Object.fromEntries(Object.entries(seasons).map(([id]) => [id, { battingWAR162: 0.5, pitchingWAR162: 0.5 }]));
		expect(previewCards(createShareRenderModel({ ...input, ...assets, rankings: { ...assets.rankings, seasons: weak } }).cards)).toHaveLength(4);
		const strong = Object.fromEntries(input.draft.picks.map(pick => [pick.seasonId, { battingWAR162: 6, pitchingWAR162: 6 }]));
		expect(previewCards(createShareRenderModel({ ...input, ...assets, rankings: { ...assets.rankings, seasons: strong } }).cards)).toHaveLength(8);
		// Without rankings the earliest picks stand in for the best cards.
		const unranked = createShareRenderModel(input);
		expect(previewCards(unranked.cards).map(card => card.pickNumber)).toEqual([1, 2, 3, 4]);
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
