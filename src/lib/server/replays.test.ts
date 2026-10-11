import { describe, expect, it } from 'vitest';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';
import { availableCandidates, commitPick, createDraft, legalSlots, reassignPick, replayInput, rollDraft, selectHomeStadium } from '../game/draft.ts';
import { SLOTS, type Manifest, type Replay } from '../game/types.ts';
import { loadCurrentDataVersion, loadReplay, REPLAY_PREFIX, storeReplay } from './replays.ts';

const dataVersion = 'a'.repeat(64);
const candidates = SLOTS.map((slot, index) => ({
	seasonId: `anon${index}:198${index % 9}:AL:T${index}`,
	playerId: `anon${index}`,
	franchiseId: `F${index}`,
	decade: 1980,
	eligibleSlots: [slot]
}));
candidates[0].eligibleSlots = ['C', '1B'];
candidates[1].eligibleSlots = ['C', '1B'];
const manifest = {
	schemaVersion: 1,
	dataVersion,
	sourceCommit: 'synthetic',
	franchises: Array.from({ length: 30 }, (_, index) => ({ id: `F${index}`, name: `Club ${index}`, decades: [1980] })),
	candidates,
	stadiums: syntheticStadiumSummaries(Array.from({ length: 30 }, (_, index) => `F${index}`)),
	chunks: {}, simulationUrl: '', showcaseUrl: '', attributionUrl: '', archiveUrl: '', approximations: [], coverage: [],
	diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
	attribution: { title: 'Synthetic', credit: 'Synthetic', sourceUrl: 'https://data.invalid', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', sourceCommit: 'synthetic', changes: 'Synthetic.', fullNotice: 'Synthetic.' }
} as Manifest;

class MemoryBucket {
	objects = new Map<string, Uint8Array>();
	puts = 0;
	async get(key: string) { const value = this.objects.get(key); return value ? { body: value } : null; }
	async put(key: string, value: ArrayBuffer | Uint8Array | string) {
		const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
		this.objects.set(key, bytes);
		this.puts += 1;
	}
}

function finish(): Replay {
	let draft = selectHomeStadium(createDraft(manifest, 162), manifest, manifest.stadiums[0].ref.id);
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		const candidate = availableCandidates(draft, manifest)[0];
		draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
	}
	const catcher = draft.picks.find(pick => pick.slot === 'C')!;
	return replayInput(reassignPick(draft, manifest, catcher.seasonId, '1B'));
}

function assets() {
	const paths: string[] = [];
	return {
		paths,
		fetch: async (input: RequestInfo | URL) => {
			const path = new URL(input.toString()).pathname;
			paths.push(path);
			if (path === '/data/current.json') return Response.json({ schemaVersion: 1, dataVersion, manifestUrl: `/data/${dataVersion}/manifest.json` });
			return new Response('not found', { status: 404 });
		}
	};
}

describe('replay R2 storage', () => {
	it('stores only validated replay input and makes retries idempotent', async () => {
		const bucket = new MemoryBucket();
		const input = finish();
		const first = await storeReplay(bucket, input, dataVersion);
		const second = await storeReplay(bucket, input, dataVersion);
		expect(first.id).toHaveLength(22);
		expect(first.id).toBe(second.id);
		expect(first.key).toBe(`${REPLAY_PREFIX}${first.id}`);
		expect(bucket.puts).toBe(1);
		expect(await loadReplay(bucket, first.id, dataVersion)).toEqual(input);
		expect(input.schemaVersion).toBe(5);
		expect(input.homeStadium).toEqual(manifest.stadiums[0].ref);
		expect(input.actions.at(-1)?.type).toBe('reassign');
	});

	it('rejects pre-cutover schemas and models before writing or returning stored replay bytes', async () => {
		const current = finish();
		for (const incompatible of [
			{ ...current, schemaVersion: 3, modelVersion: 'pa-v2' },
			{ ...current, schemaVersion: 4, modelVersion: 'pa-v3' },
			{ ...current, dataVersion: 'b'.repeat(64) }
		]) {
			const bucket = new MemoryBucket();
			await expect(storeReplay(bucket, incompatible, dataVersion)).rejects.toThrow('incompatible');
			expect(bucket.puts).toBe(0);
		}

		const bucket = new MemoryBucket();
		const stored = await storeReplay(bucket, current, dataVersion);
		const bytes = bucket.objects.get(stored.key)!;
		bucket.objects.set(stored.key, new TextEncoder().encode(JSON.stringify({
			...JSON.parse(new TextDecoder().decode(bytes)),
			schemaVersion: 3,
			modelVersion: 'pa-v2'
		})));
		await expect(loadReplay(bucket, stored.id, dataVersion)).rejects.toThrow('incompatible');
	});

	it('rejects malformed shapes and oversized histories, and drops unknown fields', async () => {
		const current = finish();
		for (const malformed of [
			null,
			{ ...current, seed: -1 },
			{ ...current, homeStadium: null },
			{ ...current, picks: current.picks.slice(1) },
			{ ...current, picks: current.picks.map((pick, index) => index ? pick : { ...pick, slot: 'XX' }) },
			{ ...current, starterOrder: [...current.starterOrder, 'extra'] },
			{ ...current, actions: [...current.actions, { type: 'trade' }] },
			{ ...current, actions: Array.from({ length: 513 }, () => ({ type: 'roll' })) }
		]) {
			const bucket = new MemoryBucket();
			await expect(storeReplay(bucket, malformed, dataVersion)).rejects.toThrow('invalid');
			expect(bucket.puts).toBe(0);
		}
		const bucket = new MemoryBucket();
		const stored = await storeReplay(bucket, { ...current, playerName: 'Someone', result: { wins: 162 } }, dataVersion);
		expect(stored.id).toBe((await storeReplay(new MemoryBucket(), current, dataVersion)).id);
		expect(Object.keys(JSON.parse(new TextDecoder().decode(bucket.objects.get(stored.key)!)))).not.toContain('playerName');
	});

	it('reads only the small current-data pointer from the deployed asset binding', async () => {
		const binding = assets();
		expect(await loadCurrentDataVersion(binding)).toBe(dataVersion);
		expect(binding.paths).toEqual(['/data/current.json']);
		await expect(loadCurrentDataVersion(undefined)).rejects.toThrow('unavailable');
	});

	it('rejects invalid ids before touching R2', async () => {
		const bucket = new MemoryBucket();
		await expect(loadReplay(bucket, 'not-an-id', dataVersion)).rejects.toThrow('not found');
		expect(bucket.objects.size).toBe(0);
	});
});
