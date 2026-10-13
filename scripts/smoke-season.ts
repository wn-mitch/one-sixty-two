import assert from 'node:assert/strict';
import { decodeReplay, encodeReplay } from '../src/lib/game/share.ts';
import { RELIEF_SLOTS, SLOTS } from '../src/lib/game/types.ts';
import { simulateSeason } from '../src/lib/engine/node.ts';
import { prepareSeasonInput } from '../src/lib/game/season-input.ts';
import type { SeasonResult } from '../src/lib/sim/types.ts';
import { draftRoster, loadVerificationData, POLICIES, policyValuation, ProfileChunks, stadiumId, type Policy } from './verification-data.ts';

interface Options {
	seed: number;
	policy: Policy;
	stadium: string | null;
	addBelow: number;
}

function parseOptions(arguments_: string[]): Options {
	let seed = 162;
	let policy: Policy = 'best';
	let stadium: string | null = null;
	let addBelow = .85;
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];
		const [flag, inlineValue] = argument.split('=', 2);
		if (flag !== '--seed' && flag !== '--policy' && flag !== '--stadium' && flag !== '--add-below') throw new Error(`Unknown argument: ${argument}`);
		const value = inlineValue ?? arguments_[++index];
		if (value === undefined) throw new Error(`${flag} requires a value`);
		if (flag === '--seed') {
			seed = Number(value);
		} else if (flag === '--stadium') {
			stadium = value;
		} else if (flag === '--add-below') {
			addBelow = Number(value);
			if (!(addBelow >= 0 && addBelow <= 1)) throw new Error('--add-below must be a quantile from 0 to 1');
		} else if ((POLICIES as readonly string[]).includes(value)) {
			policy = value as Policy;
		} else {
			throw new Error(`Policy must be one of ${POLICIES.join(', ')}`);
		}
	}
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer');
	return { seed, policy, stadium, addBelow };
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
	assert.equal(SLOTS.length, 16, 'Current smoke contract requires sixteen roster slots');
	const { manifest, simulation } = await loadVerificationData();
	const stadium = stadiumId(manifest, options.stadium);
	const valuation = await policyValuation(options.policy, options.addBelow);
	const { draft, profiles } = await draftRoster(manifest, options.seed, options.policy, stadium, new ProfileChunks(manifest), valuation);
	assert.equal(draft.picks.length, SLOTS.length, 'Smoke policy did not fill every roster slot');
	assert.equal(new Set(profiles.map(profile => profile.playerId)).size, SLOTS.length, 'Smoke policy drafted a player more than once');
	assert.deepStrictEqual(new Set(draft.picks.map(pick => pick.slot)), new Set(SLOTS), 'Smoke policy did not fill the declared slots exactly once');

	const prepared = prepareSeasonInput(draft, profiles, simulation);
	const result = simulateSeason(prepared);
	assert.equal(result.modelVersion, prepared.modelVersion, 'Season result did not preserve the validated model version');
	RELIEF_SLOTS.forEach((slot, index) => {
		const line = result.pitching[4 + index];
		assert.equal(line.seasonId, prepared.roster.find(pick => pick.slot === slot)!.profile.seasonId, `Season did not deploy ${slot} as a named reliever`);
		assert.equal(line.role, 'reliever', `${slot} did not pitch as a named reliever`);
		assert.ok(line.outs > 0, `${slot} never pitched`);
	});
	assert.equal(result.pitching[7].seasonId, simulation.bullpen.seasonId, 'Season did not use the league remainder arm');
	assertConcreteSeason(result);
	assert.equal(result.games.filter(game => game.isHome).length, 81, 'Smoke schedule must contain exactly 81 home games');
	for (const opponent of simulation.opponents) {
		const games = result.games.filter(game => game.opponentId === opponent.id);
		assert.ok(games.some(game => game.isHome) && games.some(game => !game.isHome), `Smoke schedule must host and visit ${opponent.id}`);
	}
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
		...(options.policy === 'packs' ? { addBelow: options.addBelow, extraPacks: draft.actions.filter(action => action.type === 'add-pack').length } : {}),
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
