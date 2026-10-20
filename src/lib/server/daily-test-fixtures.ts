/** A synthetic manifest, D1 over Node's SQLite and an in-memory bucket for the daily standings tests. */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { availableCandidates, commitPick, legalSlots, replayInput, rollDraft } from '../game/draft.ts';
import { SLOTS, type Draft, type Manifest } from '../game/types.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';
import type { DailyBindings, DailyDatabase, DailyStatement } from './daily-standings.ts';
import { storeReplay } from './replays.ts';

export const dataVersion = 'a'.repeat(64);
const candidates = Array.from({ length: 3 }, (_, copy) => SLOTS.map((slot, index) => ({
	seasonId: `anon${copy}x${index}:198${index % 9}:AL:T${index}`,
	playerId: `anon${copy}x${index}`,
	franchiseId: `F${copy * 16 + index}`,
	decade: 1980,
	eligibleSlots: [slot]
}))).flat();
const franchiseIds = [...new Set(candidates.map(candidate => candidate.franchiseId))];
export const manifest = {
	jackpot: [], schemaVersion: 1, dataVersion, sourceCommit: 'synthetic',
	franchises: franchiseIds.map(id => ({ id, name: `Club ${id}`, decades: [1980] })),
	candidates, stadiums: syntheticStadiumSummaries(franchiseIds),
	chunks: {}, simulationUrl: '', showcaseUrl: '', attributionUrl: '', archiveUrl: '', approximations: [], coverage: [],
	diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
	attribution: { title: '', credit: '', sourceUrl: '', license: '', licenseUrl: '', sourceCommit: '', changes: '', fullNotice: '' }
} as Manifest;

/** D1 over Node's SQLite: the same engine, so the SQL under test is the SQL that ships. */
export function d1(sqlite: DatabaseSync): DailyDatabase {
	const statement = (sql: string, values: unknown[] = []): DailyStatement & { exec(): number } => ({
		bind: (...next) => statement(sql, next),
		first: async <T,>() => (sqlite.prepare(sql).get(...values as SQLInputValue[]) ?? null) as T | null,
		all: async <T,>() => ({ results: sqlite.prepare(sql).all(...values as SQLInputValue[]) as T[] }),
		run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values as SQLInputValue[]).changes) } }),
		exec: () => Number(sqlite.prepare(sql).run(...values as SQLInputValue[]).changes)
	});
	return {
		prepare: sql => statement(sql),
		batch: async statements => {
			sqlite.exec('BEGIN');
			try {
				const results = statements.map(item => (item as ReturnType<typeof statement>).exec());
				sqlite.exec('COMMIT');
				return results;
			} catch (error) {
				sqlite.exec('ROLLBACK');
				throw error;
			}
		}
	};
}

export class MemoryBucket {
	objects = new Map<string, Uint8Array>();
	async get(key: string) { const value = this.objects.get(key); return value ? { body: value } : null; }
	async put(key: string, value: ArrayBuffer | Uint8Array | string) {
		this.objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value));
	}
}

export function setup() {
	const sqlite = new DatabaseSync(':memory:');
	const bindings: DailyBindings = {
		DAILY: d1(sqlite),
		REPLAYS: new MemoryBucket(),
		ASSETS: { fetch: async () => Response.json({ schemaVersion: 1, dataVersion, manifestUrl: `/data/${dataVersion}/manifest.json` }) }
	};
	return { sqlite, bindings };
}

export function complete(start: Draft, offset: number): Draft {
	let draft = start;
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		const legal = availableCandidates(draft, manifest);
		const candidate = legal[offset % legal.length];
		draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
	}
	return draft;
}

export async function stored(bindings: DailyBindings, draft: Draft): Promise<string> {
	return (await storeReplay(bindings.REPLAYS, replayInput(draft), dataVersion)).id;
}

export const DATE = '2026-10-20';
// Noon in New York on the day.
export const NOON = new Date('2026-10-20T16:00:00Z');
export const token = (n: number) => `device${String(n).padStart(16, '0')}`;
export const record = (wins: number) => ({ wins, losses: 162 - wins, runsFor: 800, runsAgainst: 500 });
