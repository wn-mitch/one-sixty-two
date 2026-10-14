import { PUBLISHED_FORMATS, SHARE_DIMENSIONS, type PublishedFormat, type SharePublication, type SharePublicationImage, type ShareRecord } from '../share/types.ts';
import { REPLAY_PREFIX, type ReplayBucket, type ReplayObject } from './replays.ts';

/**
 * Share publication stores what the player's browser captured: the season PNGs and the record they
 * show, next to a stored replay. The server checks only the replay's existence and the image's
 * format, size, and dimensions. Sharing is friendly, not tamper-proof, so nothing is recomputed;
 * a viewer's own browser replays the season from the link.
 */
const SHA256 = /^[a-f0-9]{64}$/;
const REPLAY_ID = /^[A-Za-z0-9_-]{22}$/;
const PUBLICATION_MAX_BYTES = 64 * 1024;
export const PNG_MAX_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const IMAGE_PREFIX = 'shares/v3/images/';
const PUBLICATION_PREFIX = 'shares/v3/replays/';
type OwnedBytes = Uint8Array<ArrayBuffer>;

export interface ShareServerBindings {
	REPLAYS: ReplayBucket;
	PUBLIC_ORIGIN: string;
}

export interface PublishedShareImage {
	publication: SharePublication;
	image: SharePublicationImage;
	bytes: OwnedBytes;
	/** Strong HTTP ETag, including quotes. */
	etag: string;
}

export class ShareNotFoundError extends Error {
	constructor(message = 'Share publication not found.') { super(message); }
}

/** The upload itself is malformed: not a PNG, the wrong size, or an impossible record. */
export class ShareInvalidError extends Error {
	constructor(message = 'The share upload is invalid.') { super(message); }
}

export class ShareIncompatibleError extends Error {
	constructor(message = 'This share publication is incompatible with the current game.') { super(message); }
}

export class ShareUnavailableError extends Error {
	constructor(message = 'Share publication is unavailable. Please retry.') { super(message); }
}

export function parseShareFormat(value: string): PublishedFormat {
	if (!PUBLISHED_FORMATS.includes(value as PublishedFormat)) throw new ShareNotFoundError('Share image format not found.');
	return value as PublishedFormat;
}

export function validRecord(record: unknown): record is ShareRecord {
	if (!record || typeof record !== 'object') return false;
	const value = record as ShareRecord;
	return [value.wins, value.losses, value.longestWinningStreak, value.runsFor, value.runsAgainst].every(number => Number.isInteger(number) && number >= 0) &&
		value.wins + value.losses === 162 && value.longestWinningStreak <= value.wins &&
		(value.firstLoss === null ? value.losses === 0 : Number.isInteger(value.firstLoss) && value.firstLoss >= 1 && value.firstLoss <= 162 && value.losses > 0);
}

function publicationKey(id: string): string { return `${PUBLICATION_PREFIX}${id}/manifest.json`; }
function imageKey(digest: string): string { return `${IMAGE_PREFIX}${digest}.png`; }

function normalizedOrigin(value: string): string {
	let url: URL;
	try { url = new URL(value); }
	catch { throw new ShareUnavailableError('The public share origin is not configured correctly.'); }
	if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.search || url.hash ||
		(url.pathname !== '/' && url.pathname !== '')) {
		throw new ShareUnavailableError('The public share origin is not configured correctly.');
	}
	return url.origin;
}

async function sha256(bytes: OwnedBytes): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	let hex = '';
	for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
	return hex;
}

async function readBoundedBody(body: ReplayObject['body'] | BodyInit | null, limit: number): Promise<OwnedBytes> {
	if (body === null) throw new ShareUnavailableError();
	const stream = new Response(body as BodyInit).body;
	if (!stream) return new Uint8Array();
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > limit) {
				await reader.cancel();
				throw new ShareIncompatibleError('Stored share bytes exceed the allowed size.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function decodeJson(bytes: Uint8Array, label: string): unknown {
	try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
	catch { throw new ShareIncompatibleError(`${label} is invalid.`); }
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
	if (bytes.byteLength < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte) ||
		bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
		throw new ShareInvalidError('The share image is not a PNG.');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const width = view.getUint32(16, false);
	const height = view.getUint32(20, false);
	if (!width || !height) throw new ShareInvalidError('The share image is not a valid PNG.');
	return { width, height };
}

async function bucketGet(bucket: ReplayBucket | undefined, key: string): Promise<ReplayObject | null> {
	if (!bucket) throw new ShareUnavailableError();
	try { return await bucket.get(key); }
	catch { throw new ShareUnavailableError(); }
}

async function storeImmutable(
	bucket: ReplayBucket,
	key: string,
	bytes: OwnedBytes,
	contentType: string,
	limit: number
): Promise<void> {
	const existing = await bucketGet(bucket, key);
	if (existing) {
		const stored = await readBoundedBody(existing.body, limit);
		if (stored.byteLength !== bytes.byteLength || stored.some((byte, index) => byte !== bytes[index])) {
			throw new ShareIncompatibleError('Content-addressed share storage contains conflicting bytes.');
		}
		return;
	}
	let result: unknown | null;
	try {
		result = await bucket.put(key, bytes, {
			httpMetadata: { contentType },
			onlyIf: { etagDoesNotMatch: '*' }
		});
	} catch { throw new ShareUnavailableError(); }
	if (result !== null) return;
	const winner = await bucketGet(bucket, key);
	if (!winner) throw new ShareUnavailableError();
	const stored = await readBoundedBody(winner.body, limit);
	if (stored.byteLength !== bytes.byteLength || stored.some((byte, index) => byte !== bytes[index])) {
		throw new ShareIncompatibleError('Content-addressed share storage contains conflicting bytes.');
	}
}

function publicationImageUrl(origin: string, id: string, format: PublishedFormat): string {
	return `${origin}/api/replays/${id}/share/${format}.png`;
}

function validatePublication(value: unknown, id: string, origin: string): asserts value is SharePublication {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShareIncompatibleError('Stored share publication is invalid.');
	const publication = value as SharePublication;
	const recordValid = validRecord(publication.record);
	if (publication.schemaVersion !== 3 || publication.replayId !== id ||
		publication.replayUrl !== `${origin}/r/${id}` || !recordValid || !publication.images ||
		typeof publication.images !== 'object') {
		throw new ShareIncompatibleError('Stored share publication is invalid.');
	}
	for (const format of PUBLISHED_FORMATS) {
		const image = publication.images[format];
		const dimensions = SHARE_DIMENSIONS[format];
		if (!image || image.url !== publicationImageUrl(origin, id, format) || image.width !== dimensions.width ||
			image.height !== dimensions.height || !SHA256.test(image.sha256)) {
			throw new ShareIncompatibleError('Stored share image metadata is invalid.');
		}
	}
}

/** Read completed publication state only. */
export async function readSharePublication(bindings: ShareServerBindings, id: string): Promise<SharePublication | null> {
	if (!REPLAY_ID.test(id)) throw new ShareNotFoundError();
	const object = await bucketGet(bindings.REPLAYS, publicationKey(id));
	if (!object) return null;
	const publication = decodeJson(await readBoundedBody(object.body, PUBLICATION_MAX_BYTES), 'Stored share publication');
	validatePublication(publication, id, normalizedOrigin(bindings.PUBLIC_ORIGIN));
	return publication;
}

/**
 * Publishes the browser-captured images for a stored replay. Publication is write-once: a replay
 * that already has one keeps it, and a second upload returns the first.
 */
export async function publishShare(bindings: ShareServerBindings, id: string, record: unknown, images: Partial<Record<PublishedFormat, OwnedBytes>>): Promise<SharePublication> {
	if (!REPLAY_ID.test(id)) throw new ShareNotFoundError();
	const existing = await readSharePublication(bindings, id);
	if (existing) return existing;
	const replay = await bucketGet(bindings.REPLAYS, `${REPLAY_PREFIX}${id}`);
	if (!replay) throw new ShareNotFoundError('Replay not found.');
	if (replay.body instanceof ReadableStream) await replay.body.cancel();
	if (!validRecord(record)) throw new ShareInvalidError('The shared record is not a 162-game season.');
	const origin = normalizedOrigin(bindings.PUBLIC_ORIGIN);
	const published = {} as Record<PublishedFormat, SharePublicationImage>;
	for (const format of PUBLISHED_FORMATS) {
		const bytes = images[format];
		if (!bytes) throw new ShareInvalidError(`The ${format} share image is missing.`);
		if (bytes.byteLength > PNG_MAX_BYTES) throw new ShareInvalidError('The share image is too large.');
		const actual = pngDimensions(bytes);
		const dimensions = SHARE_DIMENSIONS[format];
		if (actual.width !== dimensions.width || actual.height !== dimensions.height) {
			throw new ShareInvalidError(`The share image is ${actual.width}×${actual.height}; expected ${dimensions.width}×${dimensions.height}.`);
		}
		const digest = await sha256(bytes);
		await storeImmutable(bindings.REPLAYS, imageKey(digest), bytes, 'image/png', PNG_MAX_BYTES);
		published[format] = { url: publicationImageUrl(origin, id, format), ...dimensions, sha256: digest };
	}
	const publication: SharePublication = { schemaVersion: 3, replayId: id, replayUrl: `${origin}/r/${id}`, record, images: published };
	let stored: unknown | null;
	try {
		stored = await bindings.REPLAYS.put(publicationKey(id), new TextEncoder().encode(JSON.stringify(publication)), {
			httpMetadata: { contentType: 'application/json' },
			onlyIf: { etagDoesNotMatch: '*' }
		});
	} catch { throw new ShareUnavailableError(); }
	if (stored !== null) return publication;
	const winner = await readSharePublication(bindings, id);
	if (!winner) throw new ShareUnavailableError();
	return winner;
}

/** Load and validate the exact published PNG bytes. */
export async function loadPublishedShareImage(bindings: ShareServerBindings, id: string, format: PublishedFormat): Promise<PublishedShareImage> {
	if (!PUBLISHED_FORMATS.includes(format)) throw new ShareNotFoundError('Share image format not found.');
	const publication = await readSharePublication(bindings, id);
	if (!publication) throw new ShareNotFoundError();
	const image = publication.images[format];
	const object = await bucketGet(bindings.REPLAYS, imageKey(image.sha256));
	if (!object) throw new ShareUnavailableError('The published share image is unavailable.');
	const bytes = await readBoundedBody(object.body, PNG_MAX_BYTES);
	let dimensions: { width: number; height: number };
	try { dimensions = pngDimensions(bytes); }
	catch { throw new ShareIncompatibleError('The published share image is not a valid PNG.'); }
	if (dimensions.width !== image.width || dimensions.height !== image.height || await sha256(bytes) !== image.sha256) {
		throw new ShareIncompatibleError('The published share image does not match its immutable metadata.');
	}
	return { publication, image, bytes, etag: `"${image.sha256}"` };
}

export function safeShareMessage(error: unknown): string {
	if (error instanceof ShareNotFoundError || error instanceof ShareInvalidError || error instanceof ShareIncompatibleError || error instanceof ShareUnavailableError) return error.message;
	console.error('Share request failed unexpectedly', error);
	return 'Share publication is unavailable. Please retry.';
}
