import { describe, expect, it } from 'vitest';
import type { ShareRecord } from '../share/types.ts';
import { REPLAY_PREFIX, type ReplayBucket, type ReplayPutOptions } from './replays.ts';
import {
	ShareInvalidError,
	ShareNotFoundError,
	loadPublishedShareImage,
	parseShareFormat,
	publishShare,
	readSharePublication,
	type ShareServerBindings
} from './share-images.ts';

const REPLAY_ID = 'S'.repeat(22);
const ORIGIN = 'https://game.example';
const RECORD: ShareRecord = { wins: 118, losses: 44, firstLoss: 3, longestWinningStreak: 12, runsFor: 811, runsAgainst: 622 };

class MemoryBucket implements ReplayBucket {
	objects = new Map<string, Uint8Array>();
	async get(key: string) {
		const body = this.objects.get(key);
		return body ? { body } : null;
	}
	async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions) {
		const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
		if (options?.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
		this.objects.set(key, Uint8Array.from(bytes));
		return {};
	}
}

function png(width: number, height: number, marker = 0): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(25);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
	bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width, false);
	view.setUint32(20, height, false);
	bytes[24] = marker;
	return bytes;
}

function fixture(withReplay = true): { bindings: ShareServerBindings; bucket: MemoryBucket } {
	const bucket = new MemoryBucket();
	if (withReplay) bucket.objects.set(`${REPLAY_PREFIX}${REPLAY_ID}`, new TextEncoder().encode('{}'));
	return { bindings: { REPLAYS: bucket, PUBLIC_ORIGIN: ORIGIN }, bucket };
}

describe('browser-captured share publication', () => {
	it('stores the uploaded PNG and record once, and serves the exact bytes', async () => {
		const { bindings } = fixture();
		const publication = await publishShare(bindings, REPLAY_ID, RECORD, { field: png(1080, 1350, 1) });
		expect(publication).toMatchObject({ schemaVersion: 2, replayId: REPLAY_ID, replayUrl: `${ORIGIN}/r/${REPLAY_ID}`, record: RECORD });
		expect(publication.images.field).toMatchObject({ url: `${ORIGIN}/api/replays/${REPLAY_ID}/share/field.png`, width: 1080, height: 1350 });
		// The first publication wins; a later upload of a different image returns it unchanged.
		expect(await publishShare(bindings, REPLAY_ID, { ...RECORD, wins: 162, losses: 0, firstLoss: null }, { field: png(1080, 1350, 2) })).toEqual(publication);
		expect(await readSharePublication(bindings, REPLAY_ID)).toEqual(publication);
		const served = await loadPublishedShareImage(bindings, REPLAY_ID, 'field');
		expect([...served.bytes]).toEqual([...png(1080, 1350, 1)]);
		expect(served.etag).toBe(`"${publication.images.field.sha256}"`);
	});

	it('rejects uploads that are not a 1080×1350 PNG of a 162-game record', async () => {
		const reject = (record: unknown, image?: Uint8Array<ArrayBuffer>) => publishShare(fixture().bindings, REPLAY_ID, record, image ? { field: image } : {});
		await expect(reject(RECORD, png(1080, 1349))).rejects.toThrow(ShareInvalidError);
		await expect(reject(RECORD, new Uint8Array(new TextEncoder().encode('<svg/>')))).rejects.toThrow(ShareInvalidError);
		await expect(reject(RECORD)).rejects.toThrow('missing');
		await expect(reject({ ...RECORD, losses: 45 }, png(1080, 1350))).rejects.toThrow('162-game');
		await expect(reject({ ...RECORD, firstLoss: null }, png(1080, 1350))).rejects.toThrow('162-game');
		await expect(reject({ ...RECORD, longestWinningStreak: 119 }, png(1080, 1350))).rejects.toThrow('162-game');
	});

	it('publishes only for a stored replay and a known format', async () => {
		await expect(publishShare(fixture(false).bindings, REPLAY_ID, RECORD, { field: png(1080, 1350) })).rejects.toThrow(ShareNotFoundError);
		await expect(publishShare(fixture().bindings, 'short', RECORD, { field: png(1080, 1350) })).rejects.toThrow(ShareNotFoundError);
		expect(() => parseShareFormat('wide')).toThrow(ShareNotFoundError);
		expect(await readSharePublication(fixture().bindings, REPLAY_ID)).toBeNull();
	});

	it('refuses to serve stored bytes that no longer match the publication', async () => {
		const { bindings, bucket } = fixture();
		const publication = await publishShare(bindings, REPLAY_ID, RECORD, { field: png(1080, 1350, 1) });
		bucket.objects.set(`shares/v2/images/${publication.images.field.sha256}.png`, png(1080, 1350, 9));
		await expect(loadPublishedShareImage(bindings, REPLAY_ID, 'field')).rejects.toThrow('does not match');
	});
});
