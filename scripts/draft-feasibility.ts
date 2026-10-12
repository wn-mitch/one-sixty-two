import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DRAFT_RULES, picksPerSeat } from '../src/lib/draft/rules.ts';
import { DRAFT_RULES_VERSION, POOL_CONTRACT_VERSION, SALARY_VERSION } from '../src/lib/draft/versions.ts';
import { HITTER_SLOTS, MODEL_VERSION, type Slot } from '../src/lib/game/types.ts';
import { CONTACT_METHOD_VERSION } from '../src/lib/sim/contact-profile.ts';
import { isCommon } from '../src/lib/draft/cleanup.ts';
import { executeRun, negativeProofs, POLICY_MODES, type PolicyMode, type RunRecord } from './draft-feasibility/run.ts';
import { loadDraftData } from './verification-data.ts';

interface Options { seeds: number; seedStart: number; modes: PolicyMode[]; report: string; runtimeBudgetMs: number }

function parseOptions(arguments_: string[]): Options {
	const options: Options = { seeds: 64, seedStart: 1, modes: [...POLICY_MODES], report: '.cache/draft-feasibility/report.json', runtimeBudgetMs: 200 };
	for (let index = 0; index < arguments_.length; index++) {
		const [flag, inlineValue] = arguments_[index].split('=', 2);
		const value = inlineValue ?? arguments_[++index];
		if (value === undefined) throw new Error(`${flag} requires a value`);
		if (flag === '--seeds') options.seeds = Number(value);
		else if (flag === '--seed-start') options.seedStart = Number(value);
		else if (flag === '--report') options.report = value;
		else if (flag === '--runtime-budget-ms') options.runtimeBudgetMs = Number(value);
		else if (flag === '--policy') {
			if (value === 'all') options.modes = [...POLICY_MODES];
			else if ((POLICY_MODES as readonly string[]).includes(value)) options.modes = [value as PolicyMode];
			else throw new Error(`Policy must be all or one of ${POLICY_MODES.join(', ')}`);
		} else throw new Error(`Unknown argument: ${flag}`);
	}
	if (!Number.isInteger(options.seeds) || options.seeds < 1) throw new Error('--seeds must be a positive integer');
	if (!Number.isInteger(options.seedStart) || options.seedStart < 0 || options.seedStart + options.seeds > 0xffffffff) throw new Error('--seed-start must keep seeds within unsigned 32 bits');
	if (!(options.runtimeBudgetMs > 0)) throw new Error('--runtime-budget-ms must be positive');
	return options;
}

const quantile = (values: number[], share: number): number => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
};
const round = (value: number, places = 1): number => Math.round(value * 10 ** places) / 10 ** places;

function salarySummary(cards: Awaited<ReturnType<typeof loadDraftData>>['cards']) {
	const roles = new Map<string, number[]>();
	for (const card of cards) {
		const role = card.pricedSlot.startsWith('SP') ? 'SP' : card.pricedSlot;
		roles.set(role, [...(roles.get(role) ?? []), card.salary]);
	}
	const byRole = Object.fromEntries([...roles].map(([role, salaries]) => [role, {
		cards: salaries.length, min: Math.min(...salaries), p50: quantile(salaries, 0.5), p90: quantile(salaries, 0.9), max: Math.max(...salaries),
		atMinimum: salaries.filter(salary => salary === Math.min(...salaries)).length
	}]));
	const commonsBySlot = Object.fromEntries(([...HITTER_SLOTS, 'SP1', 'CL', 'BP'] as Slot[]).map(slot => [slot, cards.filter(card => isCommon(card) && card.eligibleSlots.includes(slot)).length]));
	return { byRole, commonsBySlot };
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const loadStarted = performance.now();
	const { dataVersion, table, cards } = await loadDraftData();
	const loadMs = performance.now() - loadStarted;

	const runs: RunRecord[] = [];
	let replayMismatches = 0;
	for (let seed = options.seedStart; seed < options.seedStart + options.seeds; seed++) {
		for (const mode of options.modes) {
			const { record } = executeRun(cards, seed, mode);
			if (executeRun(cards, seed, mode).record.fingerprint !== record.fingerprint) replayMismatches++;
			runs.push(record);
		}
	}
	const proofs = negativeProofs(cards, options.seedStart);

	const seats = runs.flatMap(run => run.seats);
	const cleanupRows = [...new Set(runs.flatMap(run => Object.keys(run.cleanupUsed)))].sort();
	const cleanupUse = Object.fromEntries(cleanupRows.map(row => {
		const used = runs.map(run => run.cleanupUsed[row] ?? 0);
		return [row, { max: Math.max(...used), p95: quantile(used, 0.95) }];
	}));
	const finishes = ['gem', 'emboss', 'foil', 'base'].map(finish => {
		const counts = runs.map(run => run.cube.finishes[finish] ?? 0);
		return [finish, { mean: round(counts.reduce((sum, value) => sum + value, 0) / counts.length), min: Math.min(...counts), max: Math.max(...counts) }] as const;
	});
	const roles = ['hitter', 'SP', 'CL', 'BP'].map(role => [role, round(runs.reduce((sum, run) => sum + (run.cube.roles[role] ?? 0), 0) / runs.length)] as const);
	const timings = runs.map(run => run.ms);
	const runFailures = runs.filter(run => run.failures.length);
	const legalSeats = seats.filter(seat => seat.legal);
	const recoveredOverCap = legalSeats.filter(seat => seat.overCap).length;
	const recoveredMissing = legalSeats.filter(seat => seat.missing > 0).length;
	const capRoom = legalSeats.map(seat => seat.capRoom ?? 0);
	const gates = {
		poolIntegrity: runs.every(run => run.cube.size === DRAFT_RULES.seats * picksPerSeat(DRAFT_RULES) && !run.failures.some(({ stage }) => stage === 'pool' || stage === 'draft')),
		coverage: runFailures.length === 0 && legalSeats.length === seats.length,
		negativeProofs: proofs.every(proof => proof.passed),
		salaryRecovery: recoveredOverCap > 0 && recoveredMissing > 0,
		replay: replayMismatches === 0,
		runtime: quantile(timings, 0.5) <= options.runtimeBudgetMs
	};
	const report = {
		contract: { dataVersion, rulesVersion: DRAFT_RULES_VERSION, salaryVersion: SALARY_VERSION, poolContractVersion: POOL_CONTRACT_VERSION, modelVersion: MODEL_VERSION, contactMethodVersion: CONTACT_METHOD_VERSION },
		rules: DRAFT_RULES,
		salary: { method: table.method, ...salarySummary(cards) },
		aggregate: {
			runs: runs.length, seats: seats.length, legalSeats: legalSeats.length,
			overCapAfterDraft: seats.filter(seat => seat.overCap).length, recoveredOverCap,
			missingRoleAfterDraft: seats.filter(seat => seat.missing > 0).length, recoveredMissing,
			surplusCuts: seats.reduce((sum, seat) => sum + seat.surplusCuts, 0), overCapCuts: seats.reduce((sum, seat) => sum + seat.overCapCuts, 0),
			capRoom: { min: Math.min(...capRoom), p5: quantile(capRoom, 0.05), p50: quantile(capRoom, 0.5) },
			cubeFinishes: Object.fromEntries(finishes), cubeRoles: Object.fromEntries(roles), cleanupUse, warnings: [...new Set(runs.flatMap(run => run.warnings))],
			failedRuns: runFailures.map(run => ({ seed: run.seed, mode: run.mode, failures: run.failures }))
		},
		negativeProofs: proofs,
		replay: { reruns: runs.length, mismatches: replayMismatches },
		runtime: { loadMs: round(loadMs), runMs: { p50: round(quantile(timings, 0.5)), p95: round(quantile(timings, 0.95)), max: round(Math.max(...timings)) }, budgetMs: options.runtimeBudgetMs, salaryTableBuilds: 0, note: 'Desktop Node timings; phone runtime is not measured here.' },
		gates,
		runs
	};
	await mkdir(dirname(options.report), { recursive: true });
	await writeFile(options.report, `${JSON.stringify(report, null, 1)}\n`);

	const passed = Object.values(gates).every(Boolean);
	const lines = [
		`Draft feasibility ${passed ? 'PASSED' : 'FAILED'} — ${runs.length} runs (${options.seeds} seeds × ${options.modes.join('/')}), data ${dataVersion.slice(0, 12)}, ${SALARY_VERSION} (provisional)`,
		`Legal seats: ${legalSeats.length}/${seats.length}; over cap after draft ${report.aggregate.overCapAfterDraft} (recovered ${recoveredOverCap}); missing roles ${report.aggregate.missingRoleAfterDraft} (recovered ${recoveredMissing})`,
		`Cuts: ${report.aggregate.surplusCuts} surplus, ${report.aggregate.overCapCuts} over-cap; cap room at submission min ${report.aggregate.capRoom.min}, p5 ${report.aggregate.capRoom.p5}, p50 ${report.aggregate.capRoom.p50}`,
		`Table of ${DRAFT_RULES.seats * picksPerSeat(DRAFT_RULES)} (mean, min–max): ${finishes.map(([finish, use]) => `${finish} ${use.mean} (${use.min}–${use.max})`).join(', ')}; roles ${roles.map(([role, mean]) => `${role} ${mean}`).join(', ')}`,
		`Cleanup cards per run (max/p95): ${Object.entries(cleanupUse).map(([row, use]) => `${row} ${use.max}/${use.p95}`).join(', ') || 'none'}`,
		`Salary p50 by role: ${Object.entries(report.salary.byRole).map(([role, summary]) => `${role} ${summary.p50}`).join(', ')}; cap ${DRAFT_RULES.nominalCap}`,
		...proofs.map(proof => `Proof ${proof.passed ? 'ok  ' : 'FAIL'} ${proof.name}: expected ${proof.expected}, observed ${proof.observed.join(', ') || 'nothing'}`),
		`Replay: ${replayMismatches} mismatches in ${runs.length} reruns; runtime p50 ${report.runtime.runMs.p50} ms, p95 ${report.runtime.runMs.p95} ms (budget ${options.runtimeBudgetMs} ms), load ${report.runtime.loadMs} ms`,
		...report.aggregate.warnings.slice(0, 5).map(warning => `Warning: ${warning}`),
		`Gates: ${Object.entries(gates).map(([name, ok]) => `${name} ${ok ? 'ok' : 'FAIL'}`).join(', ')}`,
		`Report: ${options.report}`
	];
	console.log(lines.join('\n'));
	if (!passed) process.exitCode = 1;
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
