import assert from 'node:assert/strict';
import { decodeReplay, encodeReplay } from '../src/lib/game/share.ts';
import { SLOTS } from '../src/lib/game/types.ts';
import { buildSchedule, prepareSeasonInput, simulateSeason } from '../src/lib/sim/season.ts';
import type { SeasonResult } from '../src/lib/sim/types.ts';
import { draftRoster, loadVerificationData, ProfileChunks, stadiumId, type Policy } from './verification-data.ts';

interface Options {
	seed: number;
	policy: Policy;
	stadium: string | null;
}

function parseOptions(arguments_: string[]): Options {
	let seed = 162;
	let policy: Policy = 'best';
	let stadium: string | null = null;
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];
		const [flag, inlineValue] = argument.split('=', 2);
		if (flag !== '--seed' && flag !== '--policy' && flag !== '--stadium') throw new Error(`Unknown argument: ${argument}`);
		const value = inlineValue ?? arguments_[++index];
		if (value === undefined) throw new Error(`${flag} requires a value`);
		if (flag === '--seed') {
			seed = Number(value);
		} else if (flag === '--stadium') {
			stadium = value;
		} else if (value === 'best' || value === 'worst') {
			policy = value;
		} else {
			throw new Error('Policy must be best or worst');
		}
	}
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer');
	return { seed, policy, stadium };
}

function assertConcreteSeason(result: SeasonResult): void {
	assert.equal(result.games.length, 162, 'A smoke season must contain 162 games');
	assert.equal(result.wins + result.losses, 162, 'Every smoke game must be a win or loss');
	for (const game of result.games) {
		assert.ok(Number.isInteger(game.challengeRuns) && game.challengeRuns >= 0, `Game ${game.number} has invalid challenge runs`);
		assert.ok(Number.isInteger(game.opponentRuns) && game.opponentRuns >= 0, `Game ${game.number} has invalid opponent runs`);
		assert.notEqual(game.challengeRuns, game.opponentRuns, `Game ${game.number} ended tied`);
		assert.equal(game.win, game.challengeRuns > game.opponentRuns, `Game ${game.number} has an inconsistent result`);
	}
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	assert.equal(SLOTS.length, 14, 'Current smoke contract requires fourteen roster slots');
	const { manifest, simulation } = await loadVerificationData();
	const stadium = stadiumId(manifest, options.stadium);
	const { draft, profiles } = await draftRoster(manifest, options.seed, options.policy, stadium, new ProfileChunks(manifest));
	assert.equal(draft.picks.length, SLOTS.length, 'Smoke policy did not fill every roster slot');
	assert.equal(new Set(profiles.map(profile => profile.playerId)).size, SLOTS.length, 'Smoke policy drafted a player more than once');
	assert.deepStrictEqual(new Set(draft.picks.map(pick => pick.slot)), new Set(SLOTS), 'Smoke policy did not fill the declared slots exactly once');

	const schedule = buildSchedule(draft.seed, simulation.opponents.map(opponent => opponent.id));
	assert.equal(schedule.filter(game => game.isHome).length, 81, 'Smoke schedule must contain exactly 81 home games');
	const prepared = prepareSeasonInput(draft, profiles, simulation);
	const result = simulateSeason(prepared);
	const draftedBullpen = prepared.roster.find(pick => pick.slot === 'BP')!.profile;
	assert.equal(result.modelVersion, prepared.modelVersion, 'Season result did not preserve the validated model version');
	assert.equal(result.pitching[4].seasonId, draftedBullpen.seasonId, 'Season did not deploy the drafted bullpen remainder');
	assert.equal(result.pitching[4].displayName, draftedBullpen.displayName, 'Season did not preserve the drafted bullpen identity');
	assertConcreteSeason(result);
	assert.deepStrictEqual(result.games.map(game => ({ opponentId: game.opponentId, isHome: game.isHome })), schedule, 'Season games do not match the deterministic schedule');
	if (options.policy === 'best') {
		const repeated = simulateSeason(prepareSeasonInput(draft, profiles, simulation));
		assert.deepStrictEqual(repeated, result, 'Repeating the best-policy season changed its result');
		const decoded = decodeReplay(encodeReplay(draft), manifest);
		assert.deepStrictEqual(decoded, draft, 'Decoded share input differs from the completed draft');
		const replayed = simulateSeason(prepareSeasonInput(decoded, profiles, simulation));
		assert.deepStrictEqual(replayed, result, 'Decoded share input changed the season result');
	}

	console.log(JSON.stringify({
		dataVersion: simulation.dataVersion,
		modelVersion: result.modelVersion,
		seed: options.seed,
		policy: options.policy,
		homeStadium: draft.homeStadium,
		picks: draft.picks.map(pick => ({ seasonId: pick.seasonId, slot: pick.slot, franchiseId: pick.franchiseId, decade: pick.decade })),
		record: { wins: result.wins, losses: result.losses },
		runs: { for: result.runsFor, against: result.runsAgainst },
		firstLoss: result.firstLoss,
		longestWinningStreak: result.longestWinningStreak,
		homeRunsPerGame: result.batting.reduce((sum, line) => sum + line.HR, 0) / 162
	}));
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
