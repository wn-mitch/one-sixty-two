import { canonicalShareRenderModelJson, createShareRenderModel } from '../share/model.ts';
import { SHARE_DIMENSIONS, SHARE_FORMATS, type ShareFormat, type SharePublication, type SharePublicationImage, type ShareRenderModel } from '../share/types.ts';
import { prepareSeasonInput, simulateSeason } from '../sim/season.ts';
import {
	ReplayIncompatibleError,
	ReplayInvalidError,
	ReplayNotFoundError,
	ReplayUnavailableError,
	type ReplayAssets,
	type ReplayBucket,
	type ReplayObject
} from './replays.ts';
import {
	ShareDataIncompatibleError,
	ShareDataUnavailableError,
	loadCurrentShareAssets,
	loadTrustedShareData,
	validateStoredShareModel
} from './share-data.ts';

const SHA256 = /^[a-f0-9]{64}$/;
const REPLAY_ID = /^[A-Za-z0-9_-]{22}$/;
const MODEL_MAX_BYTES = 2 * 1024 * 1024;
const PUBLICATION_MAX_BYTES = 64 * 1024;
const PNG_MAX_BYTES = 16 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const READY_SELECTOR = '[data-share-artwork][data-share-ready="true"]';
const MODEL_PREFIX = 'shares/v1/models/';
const IMAGE_PREFIX = 'shares/v1/images/';
const PUBLICATION_PREFIX = 'shares/v1/replays/';
type OwnedBytes = Uint8Array<ArrayBuffer>;

export interface ShareScreenshotOptions {
	url: string;
	setExtraHTTPHeaders: Record<string, string>;
	selector: string;
	viewport: { width: number; height: number; deviceScaleFactor: 1 };
	screenshotOptions: { type: 'png' };
	gotoOptions: { waitUntil: 'networkidle0'; timeout: number };
	waitForSelector: { selector: string; visible: true; timeout: number };
	actionTimeout: number;
}

export interface ShareBrowserBinding {
	quickAction(action: 'screenshot', options: ShareScreenshotOptions): Promise<Response>;
}

export interface ShareServerBindings {
	ASSETS: ReplayAssets;
	REPLAYS: ReplayBucket;
	BROWSER: ShareBrowserBinding;
	PUBLIC_ORIGIN: string;
	SHARE_CAPTURE_TOKEN: string;
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

export class ShareIncompatibleError extends Error {
	constructor(message = 'This replay is incompatible with the current share renderer.') { super(message); }
}

export class ShareUnavailableError extends Error {
	constructor(message = 'Share image preparation is unavailable. Please retry.') { super(message); }
}

export class ShareAuthorizationError extends Error {
	constructor() { super('Share capture authorization failed.'); }
}

export function parseShareFormat(value: string): ShareFormat {
	if (!SHARE_FORMATS.includes(value as ShareFormat)) throw new ShareNotFoundError('Share image format not found.');
	return value as ShareFormat;
}

function publicationKey(id: string): string { return `${PUBLICATION_PREFIX}${id}/manifest.json`; }
function modelKey(digest: string): string { return `${MODEL_PREFIX}${digest}.json`; }
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
		throw new ShareUnavailableError('The capture service did not return a PNG image.');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const width = view.getUint32(16, false);
	const height = view.getUint32(20, false);
	if (!width || !height) throw new ShareUnavailableError('The capture service returned an invalid PNG image.');
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

function publicationImageUrl(origin: string, id: string, format: ShareFormat): string {
	return `${origin}/api/replays/${id}/share/${format}.png`;
}

function validatePublication(value: unknown, id: string, origin: string): asserts value is SharePublication {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ShareIncompatibleError('Stored share publication is invalid.');
	const publication = value as SharePublication;
	const record = publication.record;
	const recordValid = record && [
		record.wins,
		record.losses,
		record.longestWinningStreak,
		record.runsFor,
		record.runsAgainst
	].every(number => Number.isInteger(number) && number >= 0) &&
		record.wins + record.losses === 162 &&
		(record.firstLoss === null || (Number.isInteger(record.firstLoss) && record.firstLoss >= 1 && record.firstLoss <= 162));
	if (publication.schemaVersion !== 1 || publication.replayId !== id || !SHA256.test(publication.modelDigest) ||
		publication.replayUrl !== `${origin}/r/${id}` || !recordValid || !publication.images ||
		typeof publication.images !== 'object') {
		throw new ShareIncompatibleError('Stored share publication is invalid.');
	}
	for (const format of SHARE_FORMATS) {
		const image = publication.images[format];
		const dimensions = SHARE_DIMENSIONS[format];
		if (!image || image.url !== publicationImageUrl(origin, id, format) || image.width !== dimensions.width ||
			image.height !== dimensions.height || !SHA256.test(image.sha256)) {
			throw new ShareIncompatibleError('Stored share image metadata is invalid.');
		}
	}
}

/** Read completed publication state only. This function never captures. */
export async function readSharePublication(bindings: Pick<ShareServerBindings, 'REPLAYS' | 'PUBLIC_ORIGIN'>, id: string): Promise<SharePublication | null> {
	if (!REPLAY_ID.test(id)) throw new ShareNotFoundError();
	const object = await bucketGet(bindings.REPLAYS, publicationKey(id));
	if (!object) return null;
	const publication = decodeJson(await readBoundedBody(object.body, PUBLICATION_MAX_BYTES), 'Stored share publication');
	const origin = normalizedOrigin(bindings.PUBLIC_ORIGIN);
	validatePublication(publication, id, origin);
	return publication;
}

async function captureFormat(bindings: ShareServerBindings, origin: string, modelDigest: string, format: ShareFormat): Promise<OwnedBytes> {
	if (!bindings.BROWSER || typeof bindings.BROWSER.quickAction !== 'function') throw new ShareUnavailableError('Browser capture is unavailable.');
	if (!bindings.SHARE_CAPTURE_TOKEN) throw new ShareUnavailableError('Share capture is not configured.');
	const dimensions = SHARE_DIMENSIONS[format];
	const url = `${origin}/__share/${modelDigest}/${format}`;
	let response: Response;
	try {
		response = await bindings.BROWSER.quickAction('screenshot', {
			url,
			setExtraHTTPHeaders: { 'x-share-capture-token': bindings.SHARE_CAPTURE_TOKEN },
			selector: READY_SELECTOR,
			viewport: { width: dimensions.width, height: dimensions.height, deviceScaleFactor: 1 },
			screenshotOptions: { type: 'png' },
			gotoOptions: { waitUntil: 'networkidle0', timeout: 45_000 },
			waitForSelector: { selector: READY_SELECTOR, visible: true, timeout: 45_000 },
			actionTimeout: 60_000
		});
	} catch { throw new ShareUnavailableError('Share image capture failed. Please retry.'); }
	if (!response.ok) throw new ShareUnavailableError('Share image capture failed. Please retry.');
	let bytes: OwnedBytes;
	try { bytes = await readBoundedBody(response.body, PNG_MAX_BYTES); }
	catch { throw new ShareUnavailableError('Share image capture exceeded the allowed size.'); }
	const actual = pngDimensions(bytes);
	if (actual.width !== dimensions.width || actual.height !== dimensions.height) {
		throw new ShareUnavailableError(`Share image capture returned ${actual.width}×${actual.height}; expected ${dimensions.width}×${dimensions.height}.`);
	}
	return bytes;
}

async function publish(bindings: ShareServerBindings, id: string): Promise<SharePublication> {
	const cached = await readSharePublication(bindings, id);
	if (cached) return cached;
	const origin = normalizedOrigin(bindings.PUBLIC_ORIGIN);
	const data = await loadTrustedShareData(bindings.ASSETS, bindings.REPLAYS, id);
	let model: ShareRenderModel;
	try {
		const input = prepareSeasonInput(data.draft, data.profiles, data.simulation);
		const result = simulateSeason(input);
		model = createShareRenderModel({
			draft: data.draft,
			result,
			profiles: data.profiles,
			manifest: data.manifest,
			media: data.media,
			rankings: data.rankings,
			replayId: id,
			publicOrigin: origin,
			rendererVersion: data.rendererVersion
		});
	} catch (error) {
		throw new ShareIncompatibleError(error instanceof Error ? error.message : undefined);
	}
	const modelBytes = new TextEncoder().encode(canonicalShareRenderModelJson(model));
	if (modelBytes.byteLength > MODEL_MAX_BYTES) throw new ShareIncompatibleError('The canonical share model is too large.');
	const modelDigest = await sha256(modelBytes);
	await storeImmutable(bindings.REPLAYS, modelKey(modelDigest), modelBytes, 'application/json', MODEL_MAX_BYTES);

	const images = {} as Record<ShareFormat, SharePublicationImage>;
	for (const format of SHARE_FORMATS) {
		const bytes = await captureFormat(bindings, origin, modelDigest, format);
		const digest = await sha256(bytes);
		await storeImmutable(bindings.REPLAYS, imageKey(digest), bytes, 'image/png', PNG_MAX_BYTES);
		images[format] = { url: publicationImageUrl(origin, id, format), ...SHARE_DIMENSIONS[format], sha256: digest };
	}
	const publication: SharePublication = {
		schemaVersion: 1,
		replayId: id,
		replayUrl: `${origin}/r/${id}`,
		modelDigest,
		record: model.record,
		images
	};
	const bytes = new TextEncoder().encode(JSON.stringify(publication));
	let stored: unknown | null;
	try {
		stored = await bindings.REPLAYS.put(publicationKey(id), bytes, {
			httpMetadata: { contentType: 'application/json' },
			onlyIf: { etagDoesNotMatch: '*' }
		});
	} catch { throw new ShareUnavailableError(); }
	if (stored !== null) return publication;
	const winner = await readSharePublication(bindings, id);
	if (!winner) throw new ShareUnavailableError();
	return winner;
}

const preparations = new Map<string, Promise<SharePublication>>();

/** Trusted idempotent publication entry point. The replay ID is the only caller input. */
export async function prepareSharePublication(bindings: ShareServerBindings, id: string): Promise<SharePublication> {
	if (!REPLAY_ID.test(id)) throw new ShareNotFoundError();
	const cached = await readSharePublication(bindings, id);
	if (cached) return cached;
	let pending = preparations.get(id);
	if (!pending) {
		pending = publish(bindings, id).catch(error => {
			if (error instanceof ShareNotFoundError || error instanceof ShareIncompatibleError || error instanceof ShareUnavailableError) throw error;
			if (error instanceof ReplayNotFoundError) throw new ShareNotFoundError(error.message);
			if (error instanceof ReplayInvalidError || error instanceof ReplayIncompatibleError || error instanceof ShareDataIncompatibleError) {
				throw new ShareIncompatibleError(error.message);
			}
			if (error instanceof ReplayUnavailableError || error instanceof ShareDataUnavailableError) throw new ShareUnavailableError(error.message);
			throw new ShareUnavailableError();
		}).finally(() => {
			if (preparations.get(id) === pending) preparations.delete(id);
		});
		preparations.set(id, pending);
	}
	return pending;
}

/** Load and fully validate exact published PNG bytes. This function never captures. */
export async function loadPublishedShareImage(
	bindings: Pick<ShareServerBindings, 'REPLAYS' | 'PUBLIC_ORIGIN'>,
	id: string,
	format: ShareFormat
): Promise<PublishedShareImage> {
	if (!SHARE_FORMATS.includes(format)) throw new ShareNotFoundError('Share image format not found.');
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

function authorized(actual: string | null | undefined, expected: string): boolean {
	if (!actual || !expected || actual.length !== expected.length) return false;
	let difference = 0;
	for (let index = 0; index < expected.length; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
	return difference === 0;
}

/** Load a stored model only for the secret internal capture route. */
export async function loadAuthenticatedShareModel(bindings: ShareServerBindings, digest: string, token: string | null | undefined): Promise<ShareRenderModel> {
	if (!bindings.SHARE_CAPTURE_TOKEN) throw new ShareUnavailableError('Share capture is not configured.');
	if (!authorized(token, bindings.SHARE_CAPTURE_TOKEN)) throw new ShareAuthorizationError();
	if (!SHA256.test(digest)) throw new ShareNotFoundError('Share render model not found.');
	const object = await bucketGet(bindings.REPLAYS, modelKey(digest));
	if (!object) throw new ShareNotFoundError('Share render model not found.');
	const bytes = await readBoundedBody(object.body, MODEL_MAX_BYTES);
	if (await sha256(bytes) !== digest) throw new ShareIncompatibleError('The stored share model digest is invalid.');
	const parsed = decodeJson(bytes, 'Stored share model');
	try {
		const current = await loadCurrentShareAssets(bindings.ASSETS);
		validateStoredShareModel(parsed, current, digest, normalizedOrigin(bindings.PUBLIC_ORIGIN));
	} catch (error) {
		if (error instanceof ShareDataIncompatibleError) throw new ShareIncompatibleError(error.message);
		if (error instanceof ShareDataUnavailableError) throw new ShareUnavailableError(error.message);
		throw error;
	}
	const canonical = new TextEncoder().encode(canonicalShareRenderModelJson(parsed));
	if (canonical.byteLength !== bytes.byteLength || canonical.some((byte, index) => byte !== bytes[index])) {
		throw new ShareIncompatibleError('The stored share model is not canonical.');
	}
	return parsed;
}

export function safeShareMessage(error: unknown): string {
	if (error instanceof ShareNotFoundError || error instanceof ShareIncompatibleError || error instanceof ShareUnavailableError) return error.message;
	if (error instanceof ShareAuthorizationError) return 'Share capture authorization failed.';
	console.error('Share request failed unexpectedly', error);
	return 'Share image preparation is unavailable. Please retry.';
}
