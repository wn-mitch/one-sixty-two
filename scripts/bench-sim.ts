import { createHash } from 'node:crypto';
import { buildMatchupInputs } from '../src/lib/sim/contact-profile.ts';
import { createDraftTeam } from '../src/lib/sim/team.ts';
import { opponentTeam, prepareSeasonInput, simulateSeason } from '../src/lib/sim/season.ts';
import { draftRoster, loadVerificationData, ProfileChunks, stadiumId } from './verification-data.ts';

/** Median wall time in milliseconds over `runs` calls after one warm-up call; `work` receives the call index. */
async function time(runs: number, work: (index: number) => unknown): Promise<number> {
	await work(0);
	const samples: number[] = [];
	for (let index = 1; index <= runs; index++) {
		const start = performance.now();
		await work(index);
		samples.push(performance.now() - start);
	}
	samples.sort((left, right) => left - right);
	return samples[Math.floor(samples.length / 2)];
}

function parseRuns(arguments_: string[]): number {
	if (!arguments_.length) return 5;
	const [flag, inlineValue] = arguments_[0].split('=', 2);
	const runs = Number(inlineValue ?? arguments_[1]);
	if (flag !== '--runs' || arguments_.length > (inlineValue === undefined ? 2 : 1) || !Number.isInteger(runs) || runs < 1) throw new Error('Usage: bench-sim [--runs N]');
	return runs;
}

/**
 * Times policy drafts, season matchup fitting, and a full season for seed 162. The fingerprint
 * hashes the complete season result, so an optimization that changes any simulated value changes it.
 */
async function main(): Promise<void> {
	const runs = parseRuns(process.argv.slice(2));
	const { manifest, simulation } = await loadVerificationData();
	const stadium = stadiumId(manifest, null);
	const chunks = new ProfileChunks(manifest);
	const { draft, profiles } = await draftRoster(manifest, 162, 'best', stadium, chunks);
	const input = prepareSeasonInput(draft, profiles, simulation);
	const challenge = createDraftTeam(input, 'challenge', 'Your team');
	const opponents = simulation.opponents.map(opponentTeam);
	const result = simulateSeason(input);
	const timings = {
		// Distinct seeds keep cached draft analyses from one run out of the next.
		draftMs: await time(runs, index => draftRoster(manifest, 1000 + index, 'best', stadium, chunks)),
		matchupsMs: await time(runs, () => {
			for (const team of opponents) {
				buildMatchupInputs(challenge.hitters, team.pitchers, simulation.leagueRates, simulation.contactModel);
				buildMatchupInputs(team.hitters, challenge.pitchers, simulation.leagueRates, simulation.contactModel);
			}
		}),
		seasonMs: await time(runs, () => simulateSeason(input))
	};
	console.log(JSON.stringify({
		runs,
		...Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value)])),
		record: `${result.wins}-${result.losses}`,
		fingerprint: createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16)
	}));
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
