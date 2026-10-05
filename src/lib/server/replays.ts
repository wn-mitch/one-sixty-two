import { replayInput, validateReplay } from '../game/draft.ts';
import type { Draft, Manifest, Replay } from '../game/types.ts';

export const REPLAY_MAX_BYTES = 16 * 1024;
export const REPLAY_PREFIX = 'replays/v1/';
export const REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ASSET_ORIGIN = 'https://162-zero.internal';

export interface ReplayObject {
	body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string;
}

export interface ReplayPutOptions {
	httpMetadata?: { contentType?: string };
}

/** The subset of R2Bucket used by production and isolated unit tests. */
export interface ReplayBucket {
	get(key: string): Promise<ReplayObject | null>;
	put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions): Promise<unknown>;
}

/** Cloudflare's ASSETS Fetcher, kept structural for local tests and workerd. */
export interface ReplayAssets {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export class ReplayInvalidError extends Error {
	constructor() { super('Replay payload is invalid.'); }
}

export class ReplayUnavailableError extends Error {
	constructor() { super('Replay storage is unavailable. Please retry.'); }
}

export class ReplayIncompatibleError extends Error {
	constructor() { super('Replay is incompatible with this dataset.'); }
}

export class ReplayNotFoundError extends Error {
	constructor() { super('Replay not found. Check the link and try again.'); }
}

export interface StoredReplay {
	id: string;
	key: string;
	input: Replay;
}

function isCurrentPointer(value: unknown): value is { schemaVersion: 1; dataVersion: string; manifestUrl: string } {
	if (!value || typeof value !== 'object') return false;
	const current = value as Record<string, unknown>;
	return current.schemaVersion === 1 && typeof current.dataVersion === 'string' && /^[a-f0-9]{64}$/.test(current.dataVersion)
		&& current.manifestUrl === `/data/${current.dataVersion}/manifest.json`;
}

function isManifest(value: unknown, dataVersion: string): value is Manifest {
	if (!value || typeof value !== 'object') return false;
	const manifest = value as Record<string, unknown>;
	return manifest.schemaVersion === 1 && manifest.dataVersion === dataVersion
		&& Array.isArray(manifest.franchises) && manifest.franchises.length === 30
		&& Array.isArray(manifest.candidates);
}

/** Load the dataset manifest from the deployed immutable asset binding. */
export async function loadAuthoritativeManifest(assets: ReplayAssets | undefined): Promise<Manifest> {
	if (!assets) throw new ReplayUnavailableError();
	try {
		const currentResponse = await assets.fetch(`${ASSET_ORIGIN}/data/current.json`);
		if (!currentResponse.ok) throw new ReplayUnavailableError();
		const current: unknown = await currentResponse.json();
		if (!isCurrentPointer(current)) throw new ReplayUnavailableError();
		const manifestResponse = await assets.fetch(`${ASSET_ORIGIN}${current.manifestUrl}`);
		if (!manifestResponse.ok) throw new ReplayUnavailableError();
		const manifest: unknown = await manifestResponse.json();
		if (!isManifest(manifest, current.dataVersion)) throw new ReplayUnavailableError();
		return manifest;
	} catch (error) {
		if (error instanceof ReplayUnavailableError) throw error;
		throw new ReplayUnavailableError();
	}
}

async function readObject(object: ReplayObject): Promise<Uint8Array> {
	const bytes = new Uint8Array(await new Response(object.body as BodyInit).arrayBuffer());
	if (bytes.byteLength > REPLAY_MAX_BYTES) throw new ReplayIncompatibleError();
	return bytes;
}

function encodeId(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function contentId(bytes: Uint8Array): Promise<string> {
	// crypto.subtle.digest rejects a typed array backed by a shared buffer.
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)));
	return encodeId(digest.slice(0, 16));
}

function parseInput(bytes: Uint8Array): unknown {
	try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
	catch { throw new ReplayIncompatibleError(); }
}

function validatedInput(value: unknown, manifest: Manifest): { draft: Draft; input: Replay; bytes: Uint8Array } {
	try {
		const draft = validateReplay(value, manifest);
		const input = replayInput(draft);
		const bytes = new TextEncoder().encode(JSON.stringify(input));
		if (bytes.byteLength > REPLAY_MAX_BYTES) throw new ReplayIncompatibleError();
		return { draft, input, bytes };
	} catch (error) {
		if (error instanceof ReplayIncompatibleError) throw error;
		if (error instanceof Error && error.message.includes('incompatible')) throw new ReplayIncompatibleError();
		throw new ReplayInvalidError();
	}
}

/** Validate and persist one complete replay input, without names or results. */
export async function storeReplay(bucket: ReplayBucket | undefined, value: unknown, manifest: Manifest): Promise<StoredReplay> {
	if (!bucket) throw new ReplayUnavailableError();
	const { input, bytes } = validatedInput(value, manifest);
	const id = await contentId(bytes);
	const key = `${REPLAY_PREFIX}${id}`;
	try {
		const existing = await bucket.get(key);
		if (existing) {
			const oldBytes = await readObject(existing);
			if (new TextDecoder().decode(oldBytes) !== new TextDecoder().decode(bytes)) throw new ReplayIncompatibleError();
			return { id, key, input };
		}
		await bucket.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
		return { id, key, input };
	} catch (error) {
		if (error instanceof ReplayIncompatibleError) throw error;
		throw new ReplayUnavailableError();
	}
}

/** Fetch and revalidate a replay before returning it to a client. */
export async function loadReplay(bucket: ReplayBucket | undefined, id: string, manifest: Manifest): Promise<Replay> {
	if (!REPLAY_ID_PATTERN.test(id)) throw new ReplayNotFoundError();
	if (!bucket) throw new ReplayUnavailableError();
	let object: ReplayObject | null;
	try { object = await bucket.get(`${REPLAY_PREFIX}${id}`); }
	catch { throw new ReplayUnavailableError(); }
	if (!object) throw new ReplayNotFoundError();
	const bytes = await readObject(object);
	try {
		const { input } = validatedInput(parseInput(bytes), manifest);
		return input;
	} catch (error) {
		if (error instanceof ReplayInvalidError) throw new ReplayIncompatibleError();
		throw error;
	}
}

export function safeReplayMessage(error: unknown): string {
	if (error instanceof ReplayNotFoundError) return error.message;
	if (error instanceof ReplayInvalidError) return error.message;
	if (error instanceof ReplayIncompatibleError) return error.message;
	if (error instanceof ReplayUnavailableError) return error.message;
	// Anything unexpected becomes the same client-facing message, so record the
	// real cause in the Worker log rather than losing it.
	console.error('Replay request failed unexpectedly', error);
	return 'Replay storage is unavailable. Please retry.';
}
