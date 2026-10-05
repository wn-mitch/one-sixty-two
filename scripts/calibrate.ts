import assert from 'node:assert/strict';
import { randomStream } from '../src/lib/game/random.ts';
import type { Position, Profile, Rates, SimulationData, Slot } from '../src/lib/game/types.ts';
import { simulateGame } from '../src/lib/sim/game.ts';
import { simulateSeason } from '../src/lib/sim/season.ts';
import { syntheticProfile } from '../src/lib/sim/fixtures.ts';
import type { GameInput, GameResult, SeasonInput, TeamInput } from '../src/lib/sim/types.ts';
import { loadVerificationData } from './verification-data.ts';

interface Options {
	seed: number;
	games: number;
}

const DEFENSE: Record<Position, number> = { C: 0, '1B': 1, '2B': 2, '3B': 3, SS: 4, LF: 5, CF: 6, RF: 7 };
const HITTER_SLOTS: Slot[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

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
	profile.eligibleSlots = [slot];
	profile.appearances = slot === 'DH' ? {} : { [slot as Position]: 162 };
	profile.battingRates = [...rates];
	profile.pitchingRates = [...rates];
	profile.errorRates = { ...data.leagueErrorRates };
	profile.catcherCS = data.leagueCatcherCS;
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
	const bullpen = commonProfile(`${id}-support`, 'CL', data.leagueRates, data);
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
		leagueRates: data.leagueRates,
		leagueCatcherCS: data.leagueCatcherCS,
		park: 1
	};
}

function averageSeason(seed: number, data: SimulationData, hitterRates = data.leagueRates, starterRates = data.leagueRates): SeasonInput {
	const team = makeTeam('challenge', data, hitterRates);
	const starters = ['SP1', 'SP2', 'SP3'].map((slot, index) => commonProfile(`challenge-sp${index}`, slot as Slot, index === 0 ? starterRates : data.leagueRates, data));
	const roster = [...team.hitters.map((profile, index) => ({ profile, slot: HITTER_SLOTS[index] })), ...starters.map((profile, index) => ({ profile, slot: `SP${index + 1}` as Slot })), { profile: team.pitchers[1], slot: 'CL' as Slot }];
	const opponents = data.opponents.map(source => {
		const average = makeTeam(source.id, data);
		return { id: source.id, name: source.id, park: 1, hitters: average.hitters,
			starters: Array.from({ length: 5 }, (_, index) => commonProfile(`${source.id}-sp${index}`, 'SP1', data.leagueRates, data)),
			closer: average.pitchers[1], bullpen: average.pitchers[2] };
	});
	return { seed, roster, battingOrder: team.hitters.map(profile => profile.seasonId), starterOrder: starters.map(profile => profile.seasonId),
		data: { ...data, opponents, bullpen: commonProfile('league-support', 'CL', data.leagueRates, data) } };
}

function runGame(seed: number, index: number, data: SimulationData, hitterRates?: Rates, starterRates?: Rates): GameResult {
	const challengeIsHome = index % 2 === 0;
	return simulateGame(gameInput(index + 1, challengeIsHome, data, hitterRates, starterRates), randomStream((seed + index) >>> 0, 'simulation'));
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

	console.log(JSON.stringify({
		dataVersion: simulation.dataVersion,
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
		lowerStarterAllowed
	}));
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
