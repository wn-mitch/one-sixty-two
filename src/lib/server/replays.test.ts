import { describe, expect, it } from 'vitest';
import { availableCandidates, commitPick, createDraft, replayInput, rollDraft } from '../game/draft.ts';
import { SLOTS, type Manifest, type Replay } from '../game/types.ts';
import { loadReplay, loadAuthoritativeManifest, REPLAY_PREFIX, storeReplay } from './replays.ts';

const dataVersion = 'a'.repeat(64);
const candidates = SLOTS.map((slot, index) => ({
	seasonId: `anon${index}:198${index % 9}:AL:T${index}`,
	playerId: `anon${index}`,
	franchiseId: `F${index}`,
	decade: 1980,
	eligibleSlots: [slot]
}));
const manifest = {
	schemaVersion: 1,
	dataVersion,
	sourceCommit: 'synthetic',
	franchises: Array.from({ length: 30 }, (_, index) => ({ id: `F${index}`, name: `Club ${index}`, decades: [1980] })),
	candidates,
	chunks: {}, simulationUrl: '', attributionUrl: '', archiveUrl: '', approximations: [], coverage: [],
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
	let draft = createDraft(manifest, 162);
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		const candidate = availableCandidates(draft, manifest)[0];
		draft = commitPick(draft, manifest, candidate.seasonId, candidate.eligibleSlots[0]);
	}
	return replayInput(draft);
}

function assets() {
	return {
		fetch: async (input: RequestInfo | URL) => {
			const path = new URL(input.toString()).pathname;
			if (path === '/data/current.json') return Response.json({ schemaVersion: 1, dataVersion, manifestUrl: `/data/${dataVersion}/manifest.json` });
			return Response.json(manifest);
		}
	};
}

describe('replay R2 storage', () => {
	it('stores only validated replay input and makes retries idempotent', async () => {
		const bucket = new MemoryBucket();
		const input = finish();
		const first = await storeReplay(bucket, input, manifest);
		const second = await storeReplay(bucket, input, manifest);
		expect(first.id).toHaveLength(22);
		expect(first.id).toBe(second.id);
		expect(first.key).toBe(`${REPLAY_PREFIX}${first.id}`);
		expect(bucket.puts).toBe(1);
		expect(await loadReplay(bucket, first.id, manifest)).toEqual(input);
	});

	it('loads the authoritative manifest only from the deployed asset binding', async () => {
		expect(await loadAuthoritativeManifest(assets())).toEqual(manifest);
		await expect(loadAuthoritativeManifest(undefined)).rejects.toThrow('unavailable');
	});

	it('rejects invalid ids before touching R2', async () => {
		const bucket = new MemoryBucket();
		await expect(loadReplay(bucket, 'not-an-id', manifest)).rejects.toThrow('not found');
		expect(bucket.objects.size).toBe(0);
	});
});
