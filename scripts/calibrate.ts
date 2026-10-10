import assert from 'node:assert/strict';
import { gameRandomStreams } from '../src/lib/game/random.ts';
import { CURRENT_REPLAY_SCHEMA_VERSION, HITTER_SLOTS, MODEL_VERSION, POSITIONS, RULES_VERSION, type DefensiveSkillName, type Position, type Profile, type Rates, type SimulationData, type Slot } from '../src/lib/game/types.ts';
import { createDefensiveReference, expectedDefensiveRuns, neutralDefensivePosition, type DefensiveReference } from '../src/lib/sim/defense.ts';
import { simulateGame } from '../src/lib/sim/game.ts';
import { simulateSeason } from '../src/lib/sim/season.ts';
import { syntheticProfile } from '../src/lib/sim/fixtures.ts';
import { neutralPark, stadiumRef } from '../src/lib/sim/park.ts';
import type { GameInput, GameResult, SeasonInput, TeamInput } from '../src/lib/sim/types.ts';
import { loadVerificationData } from './verification-data.ts';

interface Options {
	seed: number;
	games: number;
}

const DEFENSE: Record<Position, number> = { C: 0, '1B': 1, '2B': 2, '3B': 3, SS: 4, LF: 5, CF: 6, RF: 7 };
const DEFENSE_FAMILY_SIZE = 24;
const WRONG_WAY_STANDARD_ERRORS = 3;

// The defensive sweep is a fixed family of 24 comparisons. A one-sided
// three-standard-error bound has a 3.24% normal-approximation union bound
// across that family, which is more conservative than a 5% Bonferroni gate.
// It rejects only a statistically supported wrong-way raw scoring effect;
// exact kernel direction and coupled realized attribution remain hard gates.
// Seeds and sample size are never retried or adapted after seeing a result.

function parseOptions(arguments_: string[]): Options {
	let seed = 162;
	let games = 10_000;
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];
		const [flag, inlineValue] = argument.split('=', 2);
		if (flag !== '--seed' && flag !== '--games') throw new Error(`Unknown argument: ${argument}`);
		const value = inlineValue ?? arguments_[++index];
		if (value === undefined) throw new Error(`${flag} requires a value`);
		if (flag === '--seed') seed = Number(value);
		else games = Number(value);
	}
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer');
	if (!Number.isInteger(games) || games <= 0) throw new Error('Games must be a positive integer');
	return { seed, games };
}

function commonProfile(id: string, slot: Slot, rates: Rates, data: SimulationData): Profile {
	const profile = syntheticProfile(id, rates);
	profile.franchiseId = `fixture:${id}`;
	profile.teamId = `fixture:${id}`;
	profile.eligibleSlots = [slot];
	profile.primaryHitterSlot = POSITIONS.includes(slot as Position) ? slot as Position : 'DH';
	if (profile.primaryHitterSlot !== 'DH') profile.defense.positions[profile.primaryHitterSlot] = neutralDefensivePosition(profile.primaryHitterSlot);
	profile.appearances = profile.primaryHitterSlot !== 'DH' ? { [profile.primaryHitterSlot]: 162 } : {};
	profile.battingRates = [...rates];
	profile.pitchingRates = [...rates];
	profile.speed = 0.5;
	profile.stealAttempt = data.leagueStealAttempt;
	profile.stealSuccess = data.leagueStealSuccess;
	profile.doublePlay = data.leagueDoublePlay;
	return profile;
}

function makeTeam(id: string, data: SimulationData, hitterRates = data.leagueRates, starterRates = data.leagueRates): TeamInput {
	const hitters = HITTER_SLOTS.map((slot, index) => commonProfile(`${id}-h${index}`, slot, index === 0 ? hitterRates : data.leagueRates, data));
	const starter = commonProfile(`${id}-starter`, 'SP1', starterRates, data);
	const closer = commonProfile(`${id}-closer`, 'CL', data.leagueRates, data);
	const bullpen = commonProfile(`${id}-support`, 'BP', data.leagueRates, data);
	bullpen.displayName = `${id} bullpen remainder`;
	bullpen.pitching!.G = 60;
	bullpen.pitching!.GS = 0;
	bullpen.pitching!.IPouts = 486;
	return {
		id,
		name: id,
		hitters,
		defense: { ...DEFENSE },
		pitchers: [starter, closer, bullpen],
		starterIndex: 0,
		closerIndex: 1,
		bullpenIndex: 2,
		closerAvailable: true,
		closerOutsRemaining: 486
	};
}

function gameInput(number: number, challengeIsHome: boolean, data: SimulationData, hitterRates?: Rates, starterRates?: Rates): GameInput {
	const challenge = makeTeam('challenge', data, hitterRates, starterRates);
	const opponent = makeTeam('opponent', data);
	return {
		number,
		opponentId: opponent.id,
		opponentName: opponent.name,
		challengeIsHome,
		home: challengeIsHome ? challenge : opponent,
		away: challengeIsHome ? opponent : challenge,
		defenseEnvironment: data,
		stadium: neutralPark()
	};
}

function averageSeason(seed: number, data: SimulationData, hitterRates = data.leagueRates, starterRates = data.leagueRates): SeasonInput {
	const team = makeTeam('challenge', data, hitterRates);
	const starters = ['SP1', 'SP2', 'SP3'].map((slot, index) => commonProfile(`challenge-sp${index}`, slot as Slot, index === 0 ? starterRates : data.leagueRates, data));
	const roster = [...team.hitters.map((profile, index) => ({ profile, slot: HITTER_SLOTS[index] })), ...starters.map((profile, index) => ({ profile, slot: `SP${index + 1}` as Slot })), { profile: team.pitchers[1], slot: 'CL' as Slot }, { profile: team.pitchers[2], slot: 'BP' as Slot }];
	const opponents = data.opponents.map(source => {
		const average = makeTeam(source.id, data);
		return { id: source.id, name: source.id, homeStadium: source.homeStadium, hitters: average.hitters,
			starters: Array.from({ length: 5 }, (_, index) => commonProfile(`${source.id}-sp${index}`, 'SP1', data.leagueRates, data)),
			closer: average.pitchers[1], bullpen: average.pitchers[2] };
	});
	const leagueBullpen = commonProfile('league-support', 'BP', data.leagueRates, data);
	leagueBullpen.displayName = 'League support bullpen';
	leagueBullpen.pitching!.G = 60;
	leagueBullpen.pitching!.GS = 0;
	leagueBullpen.pitching!.IPouts = 486;
	return { schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION, modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, seed, homeStadium: stadiumRef(data.stadiums[0]), roster, battingOrder: team.hitters.map(profile => profile.seasonId), starterOrder: starters.map(profile => profile.seasonId),
		data: { ...data, opponents, bullpen: leagueBullpen } };
}

function runGame(seed: number, index: number, data: SimulationData, hitterRates?: Rates, starterRates?: Rates): GameResult {
	const challengeIsHome = index % 2 === 0;
	return simulateGame(gameInput(index + 1, challengeIsHome, data, hitterRates, starterRates), gameRandomStreams((seed + index) >>> 0, 1), null);
}

interface DefenseIsolationResult {
	position: Position;
	skill: DefensiveSkillName;
	positiveRunsAllowed: number;
	negativeRunsAllowed: number;
	positiveComponentRuns: number;
	negativeComponentRuns: number;
	expectedPositiveRunsSaved162: number;
	expectedNegativeRunsSaved162: number;
	pairedMeanRunsSaved: number;
	pairedStandardError: number;
	pairedWrongWayUpperBound: number;
}

const DEFENSE_ISOLATIONS: { position: Position; skill: DefensiveSkillName }[] = [
	...POSITIONS.flatMap(position => [
		{ position, skill: 'hitPrevention' as const },
		{ position, skill: 'errorAvoidance' as const }
	]),
	...(['1B', '2B', '3B', 'SS'] as const).map(position => ({ position, skill: 'doublePlay' as const })),
	...(['LF', 'CF', 'RF'] as const).map(position => ({ position, skill: 'outfieldThrowing' as const })),
	{ position: 'C', skill: 'catcherThrowing' }
];

function assertGameValueConservation(game: GameResult, label: string): void {
	let ledger = 0;
	let magnitude = 0;
	for (const box of [game.home, game.away]) {
		for (const line of box.batting) {
			const componentRuns = Object.values(line.defensiveComponents).reduce((sum, value) => sum + value, 0);
			assert.ok(Math.abs(componentRuns - line.defensiveRuns) <= 1e-9, `${label} fielder components do not sum to defensive value`);
			for (const value of [line.battingRuns, line.stealRuns, line.defensiveRuns]) {
				ledger += value;
				magnitude += Math.abs(value);
			}
		}
		for (const line of box.pitching) {
			ledger += line.pitchingRunsAboveNeutral;
			magnitude += Math.abs(line.pitchingRunsAboveNeutral);
		}
	}
	assert.ok(Math.abs(ledger) <= 1e-9 * Math.max(1, magnitude), `${label} value ledger does not conserve runs (${ledger})`);
}

function runDefenseIsolation(
	seed: number,
	games: number,
	data: SimulationData,
	reference: DefensiveReference,
	position: Position,
	skill: DefensiveSkillName
): DefenseIsolationResult {
	const positiveSkills = neutralDefensivePosition(position);
	const negativeSkills = neutralDefensivePosition(position);
	positiveSkills[skill] = 1;
	negativeSkills[skill] = -1;
	const expectedPositiveRunsSaved162 = expectedDefensiveRuns(reference, position, positiveSkills);
	const expectedNegativeRunsSaved162 = expectedDefensiveRuns(reference, position, negativeSkills);
	assert.ok(expectedPositiveRunsSaved162 > expectedNegativeRunsSaved162,
		`${position} ${skill} has a wrong-way exact shared-kernel expectation (${expectedPositiveRunsSaved162} <= ${expectedNegativeRunsSaved162})`);

	let positiveRunsAllowed = 0;
	let negativeRunsAllowed = 0;
	let positiveComponentRuns = 0;
	let negativeComponentRuns = 0;
	let pairedMeanRunsSaved = 0;
	let pairedDifferenceSquares = 0;
	for (let index = 0; index < games; index++) {
		const challengeIsHome = index % 2 === 0;
		const positiveInput = gameInput(index + 1, challengeIsHome, data);
		const negativeInput = gameInput(index + 1, challengeIsHome, data);
		const positiveTeam = challengeIsHome ? positiveInput.home : positiveInput.away;
		const negativeTeam = challengeIsHome ? negativeInput.home : negativeInput.away;
		const fielderIndex = positiveTeam.defense[position];
		const positiveDefense = positiveTeam.hitters[fielderIndex].defense.positions[position];
		const negativeDefense = negativeTeam.hitters[fielderIndex].defense.positions[position];
		assert.ok(positiveDefense && negativeDefense, `Missing ${position} defense fixture`);
		positiveDefense[skill] = 1;
		negativeDefense[skill] = -1;
		positiveDefense.evidence[skill] = { status: 'exact', exposure: 1 };
		negativeDefense.evidence[skill] = { status: 'exact', exposure: 1 };
		if (skill === 'hitPrevention') {
			positiveDefense.expectedRunsSaved162 = 1;
			negativeDefense.expectedRunsSaved162 = -1;
		}

		const gameSeed = (seed + index) >>> 0;
		const positive = simulateGame(positiveInput, gameRandomStreams(gameSeed, 1), null);
		const negative = simulateGame(negativeInput, gameRandomStreams(gameSeed, 1), null);
		assertGameValueConservation(positive, `${position} ${skill} positive game ${index + 1}`);
		assertGameValueConservation(negative, `${position} ${skill} negative game ${index + 1}`);
		const positiveBox = challengeIsHome ? positive.home : positive.away;
		const negativeBox = challengeIsHome ? negative.home : negative.away;
		positiveRunsAllowed += positive.opponentRuns;
		negativeRunsAllowed += negative.opponentRuns;
		positiveComponentRuns += positiveBox.batting.reduce((sum, line) => sum + line.defensiveComponents[skill], 0);
		negativeComponentRuns += negativeBox.batting.reduce((sum, line) => sum + line.defensiveComponents[skill], 0);

		const pairedRunsSaved = negative.opponentRuns - positive.opponentRuns;
		const previousMean = pairedMeanRunsSaved;
		pairedMeanRunsSaved += (pairedRunsSaved - previousMean) / (index + 1);
		pairedDifferenceSquares += (pairedRunsSaved - previousMean) * (pairedRunsSaved - pairedMeanRunsSaved);
	}
	const pairedStandardError = Math.sqrt(pairedDifferenceSquares / (games - 1) / games);
	const pairedWrongWayUpperBound = pairedMeanRunsSaved + WRONG_WAY_STANDARD_ERRORS * pairedStandardError;
	assert.ok(Number.isFinite(pairedStandardError), `${position} ${skill} produced invalid paired uncertainty`);
	assert.ok(pairedWrongWayUpperBound >= 0,
		`${position} ${skill} has a statistically supported wrong-way paired run effect ` +
		`(mean ${pairedMeanRunsSaved.toFixed(4)} + ${WRONG_WAY_STANDARD_ERRORS} SE ${pairedStandardError.toFixed(4)} < 0)`);
	assert.ok(positiveComponentRuns > 0,
		`${position} ${skill} positive skill did not earn positive coupled defensive value (${positiveComponentRuns})`);
	assert.ok(negativeComponentRuns < 0,
		`${position} ${skill} negative skill did not earn negative coupled defensive value (${negativeComponentRuns})`);
	return {
		position,
		skill,
		positiveRunsAllowed,
		negativeRunsAllowed,
		positiveComponentRuns,
		negativeComponentRuns,
		expectedPositiveRunsSaved162,
		expectedNegativeRunsSaved162,
		pairedMeanRunsSaved,
		pairedStandardError,
		pairedWrongWayUpperBound
	};
}

function improvedHitterRates(baseline: Rates): Rates {
	const shift = Math.min(0.08, baseline[7] * 0.2);
	const rates: Rates = [...baseline];
	rates[0] += shift * 0.2;
	rates[3] += shift * 0.2;
	rates[4] += shift * 0.2;
	rates[6] += shift * 0.4;
	rates[7] -= shift;
	return rates;
}

function improvedStarterRates(baseline: Rates): Rates {
	const rates: Rates = [...baseline];
	let removed = 0;
	for (const index of [0, 3, 4, 5, 6] as const) {
		const reduction = rates[index] * 0.45;
		rates[index] -= reduction;
		removed += reduction;
	}
	rates[2] += removed * 0.4;
	rates[7] += removed * 0.6;
	return rates;
}

function assertRates(rates: Rates, label: string): void {
	assert.ok(rates.every(rate => Number.isFinite(rate) && rate >= 0), `${label} contains an invalid rate`);
	assert.ok(Math.abs(rates.reduce((sum, rate) => sum + rate, 0) - 1) < 1e-12, `${label} rates do not sum to one`);
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const { simulation } = await loadVerificationData();
	assertRates(simulation.leagueRates, 'League baseline');
	assert.ok(Number.isFinite(simulation.observedRuns) && simulation.observedRuns > 0, 'Observed scoring baseline must be positive');

	let totalRuns = 0;
	let wins = 0;
	for (let index = 0; index < options.games; index++) {
		const result = runGame(options.seed, index, simulation);
		assert.notEqual(result.challengeRuns, result.opponentRuns, `Calibration game ${index + 1} ended tied`);
		assertGameValueConservation(result, `Calibration game ${index + 1}`);
		totalRuns += result.challengeRuns + result.opponentRuns;
		if (result.win) wins++;
	}
	const runsPerTeamGame = totalRuns / (2 * options.games);
	const scoringError = Math.abs(runsPerTeamGame - simulation.observedRuns) / simulation.observedRuns;
	const winShare = wins / options.games;
	assert.ok(scoringError <= 0.15, `Scoring ${runsPerTeamGame.toFixed(4)} is outside 15% of observed ${simulation.observedRuns.toFixed(4)}`);
	assert.ok(Math.abs(winShare - 0.5) <= 0.02, `Balanced win share ${winShare.toFixed(4)} is outside 0.50 ± 0.02`);

	const higherHitter = improvedHitterRates(simulation.leagueRates);
	const lowerStarter = improvedStarterRates(simulation.leagueRates);
	assertRates(higherHitter, 'Improved hitter');
	assertRates(lowerStarter, 'Improved starter');
	const baselineObp = simulation.leagueRates[0] + simulation.leagueRates[1] + simulation.leagueRates.slice(3, 7).reduce((sum, rate) => sum + rate, 0);
	const higherObp = higherHitter[0] + higherHitter[1] + higherHitter.slice(3, 7).reduce((sum, rate) => sum + rate, 0);
	const baselinePower = simulation.leagueRates[3] + 2 * simulation.leagueRates[4] + 3 * simulation.leagueRates[5] + 4 * simulation.leagueRates[6];
	const higherPower = higherHitter[3] + 2 * higherHitter[4] + 3 * higherHitter[5] + 4 * higherHitter[6];
	assert.ok(higherObp > baselineObp && higherPower > baselinePower, 'Synthetic hitter must have higher OBP and power');
	const baselineAllowed = simulation.leagueRates[0] + simulation.leagueRates.slice(3, 7).reduce((sum, rate) => sum + rate, 0);
	const lowerAllowed = lowerStarter[0] + lowerStarter.slice(3, 7).reduce((sum, rate) => sum + rate, 0);
	assert.ok(lowerAllowed < baselineAllowed, 'Synthetic starter must allow fewer hits and walks');

	let baselineChoiceRuns = 0;
	let higherHitterRuns = 0;
	let baselineChoiceAllowed = 0;
	let lowerStarterAllowed = 0;
	for (let index = 0; index < 64; index++) {
		const seed = (options.seed + index) >>> 0;
		const baseline = simulateSeason(averageSeason(seed, simulation));
		const hitter = simulateSeason(averageSeason(seed, simulation, higherHitter));
		const starter = simulateSeason(averageSeason(seed, simulation, undefined, lowerStarter));
		baselineChoiceRuns += baseline.runsFor;
		higherHitterRuns += hitter.runsFor;
		baselineChoiceAllowed += baseline.runsAgainst;
		lowerStarterAllowed += starter.runsAgainst;
	}
	assert.ok(higherHitterRuns > baselineChoiceRuns, `Higher-OBP/power hitter did not increase aggregate runs (${higherHitterRuns} <= ${baselineChoiceRuns})`);
	assert.ok(lowerStarterAllowed < baselineChoiceAllowed, `Lower-hit/walk starter did not reduce aggregate runs allowed (${lowerStarterAllowed} >= ${baselineChoiceAllowed})`);

	assert.equal(DEFENSE_ISOLATIONS.length, DEFENSE_FAMILY_SIZE, 'Defensive isolation family changed without revisiting its fixed multiple-comparison criterion');
	const defenseReference = createDefensiveReference(simulation);
	const defenseGamesPerIsolation = Math.max(256, Math.min(1024, Math.ceil(options.games / 10)));
	const defenseIsolation = DEFENSE_ISOLATIONS.map(({ position, skill }, index) =>
		runDefenseIsolation((options.seed + index * defenseGamesPerIsolation) >>> 0, defenseGamesPerIsolation, simulation, defenseReference, position, skill));

	console.log(JSON.stringify({
		dataVersion: simulation.dataVersion,
		modelVersion: MODEL_VERSION,
		defenseMethodVersion: simulation.defenseMethodVersion,
		valuationVersion: simulation.valuationVersion,
		seed: options.seed,
		games: options.games,
		observedRunsPerTeamGame: simulation.observedRuns,
		simulatedRunsPerTeamGame: runsPerTeamGame,
		balancedWinShare: winShare,
		choiceCheckSeeds: 64,
		choiceCheckGamesPerSeed: 162,
		baselineChoiceRuns,
		higherHitterRuns,
		baselineChoiceAllowed,
		defenseGamesPerIsolation,
		defenseRawRunCriterion: {
			familySize: DEFENSE_FAMILY_SIZE,
			oneSidedStandardErrors: WRONG_WAY_STANDARD_ERRORS,
			normalApproximationFamilyWiseUpperBound: 0.0324,
			rejectsWhen: 'paired mean runs saved + 3 standard errors is below zero'
		},
		defenseIsolation,
		lowerStarterAllowed
	}));
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
