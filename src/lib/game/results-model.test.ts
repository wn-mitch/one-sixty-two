import { stadiumSummary } from '../sim/park.ts';
import { describe, expect, it } from 'vitest';
import { SLOTS, type Draft, type Manifest, type Profile, type Slot } from './types.ts';
import { createResultsModel, type ResultsModel } from './results-model.ts';
import type { WarRankings } from '../rankings/types.ts';
import { testSeason } from '../sim/test-fixtures.ts';
import type { BatterLine, DefensiveRunComponents, PitcherLine, SeasonResult } from '../sim/types.ts';

const ZERO_DEFENSE: DefensiveRunComponents = {
	hitPrevention: 0,
	errorAvoidance: 0,
	doublePlay: 0,
	outfieldThrowing: 0,
	catcherThrowing: 0
};

type Fixture = {
	draft: Draft;
	profiles: Profile[];
	manifest: Manifest;
	result: SeasonResult;
	rankings: WarRankings;
};

function fixture(): Fixture {
	const input = testSeason();
	const profiles = input.roster.map(pick => pick.profile);
	const draft: Draft = {
		schemaVersion: input.schemaVersion,
		modelVersion: input.modelVersion,
		rulesVersion: input.rulesVersion,
		dataVersion: input.data.dataVersion,
		seed: input.seed,
		homeStadium: input.homeStadium,
		picks: input.roster.map(({ profile, slot }) => ({
			seasonId: profile.seasonId,
			slot,
			franchiseId: profile.franchiseId,
			decade: Math.floor(profile.year / 10) * 10
		})),
		battingOrder: [...input.battingOrder],
		starterOrder: [...input.starterOrder],
		actions: [],
		currentRoll: null
	};
	const batting = input.roster.slice(0, 9).map(({ profile }): BatterLine => ({
		seasonId: profile.seasonId,
		playerId: profile.playerId,
		displayName: profile.displayName,
		PA: 1,
		AB: 1,
		H: 0,
		doubles: 0,
		triples: 0,
		HR: 0,
		BB: 0,
		HBP: 0,
		SO: 0,
		R: 0,
		RBI: 0,
		SB: 0,
		CS: 0,
		SF: 0,
		battingRuns: -20 / 600,
		stealRuns: 0,
		defensiveRuns: 0,
		defensiveComponents: { ...ZERO_DEFENSE },
		fieldingOuts: 3,
		caughtAdvancing: 0
	}));
	const pitching = input.roster.slice(9).map(({ profile }, index): PitcherLine => ({
		seasonId: profile.seasonId,
		playerId: profile.playerId,
		displayName: profile.displayName,
		role: index === 4 ? 'support' : index === 3 ? 'closer' : 'starter',
		outs: 3,
		H: 0,
		BB: index,
		HBP: 0,
		SO: 0,
		R: 1,
		starts: index < 3 ? 1 : 0,
		appearances: 1,
		BF: 1,
		pitchingRunsAboveNeutral: -20 * 3 / 600
	}));
	const result: SeasonResult = {
		modelVersion: input.modelVersion,
		rulesVersion: input.rulesVersion,
		dataVersion: input.data.dataVersion,
		seed: input.seed,
		homeStadium: input.homeStadium,
		defenseMethodVersion: 'defense-v2',
		valuationVersion: 'sim-war-v2',
		wins: 100,
		losses: 62,
		firstLoss: 2,
		longestWinningStreak: 10,
		runsFor: 700,
		runsAgainst: 600,
		games: [],
		batting,
		pitching,
		starterStarts: [1, 1, 1],
		highlight: null,
		lowlight: null
	};
	const manifest: Manifest = {
		schemaVersion: 1,
		dataVersion: input.data.dataVersion,
		sourceCommit: 'test',
		franchises: [],
		candidates: [],
		chunks: {},
		stadiums: input.data.stadiums.map(stadium => stadiumSummary(stadium, null)),
		simulationUrl: '/simulation.json',
		showcaseUrl: '/showcase.json',
		attributionUrl: '/attribution.json',
		archiveUrl: '/archive.json',
		attribution: { title: 'Test', credit: 'Test', sourceUrl: 'https://example.com', license: 'Test', licenseUrl: 'https://example.com/license', sourceCommit: 'test', changes: 'None', fullNotice: 'Test' },
		approximations: [],
		coverage: [],
		diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '/report.json' }
	};
	const rankings: WarRankings = {
		schemaVersion: 1,
		dataVersion: input.data.dataVersion,
		rankingVersion: 'ranking-test',
		source: { name: 'Test', url: 'https://example.com', licenceUrl: 'https://example.com/license', licenceText: 'Test', commit: 'test', description: 'Test rankings' },
		seasons: Object.fromEntries(profiles.map(profile => [profile.seasonId, { battingWAR162: 1, pitchingWAR162: 1 }])),
		coverage: { candidates: 14, batting: 9, pitching: 5, missing: 0 }
	};
	return { draft, profiles, manifest, result, rankings };
}

function lineForSlot(source: Fixture, slot: Slot): BatterLine | PitcherLine {
	const id = source.draft.picks.find(pick => pick.slot === slot)!.seasonId;
	return source.result.batting.find(line => line.seasonId === id)
		?? source.result.pitching.find(line => line.seasonId === id)!;
}

function setHitterWar(line: BatterLine, war: number): void {
	line.battingRuns = war * 10 - line.stealRuns - line.defensiveRuns - 20 * line.PA / 600;
}

function setPitcherWar(line: PitcherLine, war: number): void {
	line.pitchingRunsAboveNeutral = war * 10 - 20 * line.outs / 600;
}
function cardFor(model: ResultsModel, slot: Slot) {
	return model.cards.find(card => card.slot === slot)!;
}

function rowFor(model: ResultsModel, slot: Slot, season: 'simulated' | 'actual', key: string) {
	return cardFor(model, slot).inspection[season].rows.find(row => row.key === key)!;
}

describe('createResultsModel awards', () => {
	it('orders categories, selects stable tied winners, merges metrics and keeps every other card in the hand', () => {
		const source = fixture();
		for (const line of source.result.batting) setHitterWar(line, 1);
		for (const line of source.result.pitching) setPitcherWar(line, 1);
		const catcher = lineForSlot(source, 'C') as BatterLine;
		const first = lineForSlot(source, '1B') as BatterLine;
		catcher.H = 5;
		catcher.AB = 10;
		catcher.HR = 9;
		first.H = 10;
		first.AB = 20;
		first.HR = 10;
		setHitterWar(catcher, 5);
		setHitterWar(first, 5);
		const sp1 = lineForSlot(source, 'SP1') as PitcherLine;
		const sp2 = lineForSlot(source, 'SP2') as PitcherLine;
		const sp3 = lineForSlot(source, 'SP3') as PitcherLine;
		sp1.R = 0;
		sp1.SO = 12;
		sp2.SO = 8;
		setPitcherWar(sp3, -3);
		const bullpen = lineForSlot(source, 'BP') as PitcherLine;
		bullpen.R = 0;
		bullpen.SO = 999;
		bullpen.pitchingRunsAboveNeutral = 10_000;
		source.draft.picks.reverse();

		const model = createResultsModel(source);
		expect(model.cards.map(card => card.slot)).toEqual(SLOTS);
		expect(model.featured.map(entry => entry.card.slot)).toEqual(['C', 'SP1', 'SP3']);
		expect(model.featured.map(entry => entry.metrics.map(metric => metric.key))).toEqual([
			['mvp', 'batting-title'],
			['runs-allowed', 'strikeouts'],
			['lvp']
		]);
		expect(cardFor(model, '1B').awards.map(award => award.key)).toContain('mvp');
		expect(cardFor(model, '1B').awards.map(award => award.key)).not.toContain('home-runs');
		expect(cardFor(model, 'BP').awards).toEqual([]);
		expect(model.rest).toHaveLength(11);
		expect(cardFor(model, '1B').inspection.simulated.awardChips.map(award => award.key)).toContain('mvp');
		expect(model.rest.map(card => card.slot)).toEqual(SLOTS.filter(slot => !['C', 'SP1', 'SP3'].includes(slot)));

		catcher.HR = 11;
		const withFeaturedHomeRunLeader = createResultsModel(source);
		expect(cardFor(withFeaturedHomeRunLeader, 'C').awards.map(award => award.key)).toContain('home-runs');
	});

	it('uses app WAR across roles, preserves negative and zero values, and includes a zero-out pitcher who faced a batter', () => {
		const source = fixture();
		for (const line of source.result.batting) {
			Object.assign(line, { PA: 0, AB: 0, H: 0, fieldingOuts: 0, SB: 0, CS: 0, caughtAdvancing: 0, battingRuns: 0, stealRuns: 0, defensiveRuns: 0 });
		}
		for (const line of source.result.pitching) {
			Object.assign(line, { BF: 0, outs: 0, R: 0, SO: 0, pitchingRunsAboveNeutral: 0 });
		}
		const catcher = lineForSlot(source, 'C') as BatterLine;
		catcher.fieldingOuts = 1;
		setHitterWar(catcher, 0);
		const starter = lineForSlot(source, 'SP1') as PitcherLine;
		starter.BF = 1;
		starter.R = 1;
		setPitcherWar(starter, -0.0001);
		const bullpen = lineForSlot(source, 'BP') as PitcherLine;
		bullpen.BF = 1;
		bullpen.pitchingRunsAboveNeutral = 1_000;
		source.rankings.seasons[starter.seasonId].pitchingWAR162 = 99;

		const model = createResultsModel(source);
		expect(model.featured.find(entry => entry.metrics.some(metric => metric.key === 'mvp'))?.card.slot).toBe('C');
		expect(model.featured.find(entry => entry.metrics.some(metric => metric.key === 'lvp'))?.card.slot).toBe('SP1');
		expect(model.featured.find(entry => entry.metrics.some(metric => metric.key === 'lvp'))?.metrics.find(metric => metric.key === 'lvp')?.formattedValue).toBe('0.00 WAR');
		expect(model.featured.some(entry => entry.metrics.some(metric => metric.key === 'runs-allowed'))).toBe(false);
		expect(cardFor(model, 'SP1').awards.map(award => award.key)).toContain('strikeouts');
		expect(cardFor(model, 'BP').awards).toEqual([]);
	});
});

describe('createResultsModel inspection', () => {
	it('ranks unrounded role cohorts, includes BP for supported pitching rows, and withholds unavailable source measurements', () => {
		const source = fixture();
		const catcherProfile = cardProfile(source, 'C');
		const firstProfile = cardProfile(source, '1B');
		catcherProfile.batting!.AB = 1_000;
		catcherProfile.batting!.H = 333;
		firstProfile.batting!.AB = 10_000;
		firstProfile.batting!.H = 3_329;
		cardProfile(source, '2B').estimatedFields.push('batting.H.estimated');
		cardProfile(source, 'SP1').pitching!.IPouts = 31;
		cardProfile(source, 'SP1').pitching!.ER = 1;
		cardProfile(source, 'SP2').pitching!.IPouts = 30;
		cardProfile(source, 'CL').pitching!.IPouts = 0;
		cardProfile(source, 'BP').pitching!.BB = 0;

		source.rankings.seasons[catcherProfile.seasonId] = { battingWAR162: 2, pitchingWAR162: 9 };
		source.rankings.seasons[cardProfile(source, 'SP1').seasonId] = { battingWAR162: 8, pitchingWAR162: 3 };
		cardProfile(source, 'SP3').pitching!.IPouts = 29;
		cardProfile(source, 'BP').pitching!.IPouts = 28;
		(lineForSlot(source, 'SP1') as PitcherLine).R = 0;
		const model = createResultsModel(source);
		expect(rowFor(model, 'C', 'actual', 'avg')).toMatchObject({ formattedValue: '.333', rank: { rank: 1, total: 8, best: true } });
		expect(rowFor(model, '1B', 'actual', 'avg')).toMatchObject({ formattedValue: '.333', rank: { rank: 2, total: 8 } });
		expect(rowFor(model, '2B', 'actual', 'avg')).toMatchObject({ formattedValue: '—', rank: null });
		expect(rowFor(model, '2B', 'actual', 'h')).toMatchObject({ formattedValue: '—', rank: null });
		expect(rowFor(model, 'C', 'actual', 'war').formattedValue).toBe('2.00');
		expect(rowFor(model, 'SP1', 'actual', 'war').formattedValue).toBe('3.00');
		expect(rowFor(model, 'SP1', 'actual', 'ip')).toMatchObject({ formattedValue: '10.1', rank: { rank: 1, total: 5 } });
		expect(rowFor(model, 'SP1', 'actual', 'g-gs').rank).toBeNull();
		expect(rowFor(model, 'CL', 'actual', 'era')).toMatchObject({ formattedValue: '—', rank: null });
		expect(rowFor(model, 'SP1', 'actual', 'era').rank).toMatchObject({ rank: 1, total: 4, best: true });
		expect(rowFor(model, 'SP1', 'simulated', 'ra9').rank).toMatchObject({ rank: 1, total: 5, best: true });
		expect(rowFor(model, 'BP', 'actual', 'war')).toMatchObject({ formattedValue: '—', rank: null });
		expect(rowFor(model, 'BP', 'actual', 'bb').rank).toMatchObject({ rank: 1, total: 5, best: true });
		expect(rowFor(model, 'BP', 'simulated', 'bb').rank?.total).toBe(5);
		expect(rowFor(model, 'C', 'simulated', 'war').rank?.total).toBe(9);
		expect(cardFor(model, 'C').inspection.actual.awardChips).toEqual([]);
	});

});

function cardProfile(source: Fixture, slot: Slot): Profile {
	const seasonId = source.draft.picks.find(pick => pick.slot === slot)!.seasonId;
	return source.profiles.find(profile => profile.seasonId === seasonId)!;
}
