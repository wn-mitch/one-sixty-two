import assert from 'node:assert/strict';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../src/lib/game/draft.ts';
import { decodeReplay, encodeReplay } from '../src/lib/game/share.ts';
import { compareId, HITTER_SLOTS, SLOTS, type Draft, type Manifest, type Profile, type Slot } from '../src/lib/game/types.ts';
import { buildSchedule, prepareSeasonInput, simulateSeason } from '../src/lib/sim/season.ts';
import type { SeasonResult } from '../src/lib/sim/types.ts';
import { loadVerificationData, ProfileChunks } from './verification-data.ts';

type Policy = 'best' | 'worst';

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

function hitterValue(profile: Profile): number {
	const rates = profile.battingRates;
	if (!rates) throw new Error(`Hitter profile ${profile.seasonId} has no prepared batting rates`);
	const expectedObp = rates[0] + rates[1] + rates[3] + rates[4] + rates[5] + rates[6];
	const atBatRate = 1 - rates[0] - rates[1];
	if (atBatRate <= 0) throw new Error(`Hitter profile ${profile.seasonId} has no modeled at-bats`);
	const expectedSlg = (rates[3] + 2 * rates[4] + 3 * rates[5] + 4 * rates[6]) / atBatRate;
	return expectedObp + expectedSlg;
}

function pitcherValue(profile: Profile): number {
	const rates = profile.pitchingRates;
	if (!rates) throw new Error(`Pitcher profile ${profile.seasonId} has no prepared pitching rates`);
	return rates[0] + rates[1] + rates[3] + rates[4] + rates[5] + rates[6];
}

function chooseProfile(profiles: Profile[], slot: Slot, policy: Policy): Profile {
	const hitter = (HITTER_SLOTS as readonly Slot[]).includes(slot);
	return profiles.toSorted((left, right) => {
		const difference = (hitter ? hitterValue(left) : pitcherValue(left)) - (hitter ? hitterValue(right) : pitcherValue(right));
		if (difference !== 0) {
			const bestDirection = hitter ? -1 : 1;
			return difference * (policy === 'best' ? bestDirection : -bestDirection);
		}
		return compareId(left.seasonId, right.seasonId);
	})[0];
}

/** The named stadium, or the first manifest stadium in ID order. */
function stadiumId(manifest: Manifest, requested: string | null): string {
	const ids = manifest.stadiums.map(stadium => stadium.ref.id).sort(compareId);
	if (requested !== null && !ids.includes(requested)) throw new Error(`Unknown stadium ${requested}; choose one of ${ids.join(', ')}`);
	return requested ?? ids[0];
}

async function draftRoster(manifest: Manifest, seed: number, policy: Policy, stadium: string, chunks: ProfileChunks): Promise<{ draft: Draft; profiles: Profile[] }> {
	let draft = selectHomeStadium(createDraft(manifest, seed), manifest, stadium);
	const selectedProfiles: Profile[] = [];
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		const roll = draft.currentRoll;
		assert.ok(roll, 'A draft roll must be present before candidate selection');
		const chunk = await chunks.forRoll(roll.franchiseId, roll.decade);
		const profilesBySeason = new Map(chunk.map(profile => [profile.seasonId, profile]));
		const available = availableCandidates(draft, manifest);
		let slot: Slot | undefined;
		let eligibleProfiles: Profile[] = [];
		for (const openSlot of SLOTS) {
			if (draft.picks.some(pick => pick.slot === openSlot)) continue;
			const candidates = available.filter(candidate => legalSlots(draft, candidate, manifest).includes(openSlot));
			if (!candidates.length) continue;
			slot = openSlot;
			eligibleProfiles = candidates.map(candidate => {
				const profile = profilesBySeason.get(candidate.seasonId);
				if (!profile) throw new Error(`Profile chunk is missing candidate ${candidate.seasonId}`);
				return profile;
			});
			break;
		}
		if (!slot || !eligibleProfiles.length) throw new Error('Current legal roll has no selectable profile for an open slot');
		const profile = chooseProfile(eligibleProfiles, slot, policy);
		draft = commitPick(draft, manifest, profile.seasonId, slot);
		selectedProfiles.push(profile);
	}
	return { draft, profiles: selectedProfiles };
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
