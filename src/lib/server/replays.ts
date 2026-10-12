import { CURRENT_REPLAY_SCHEMA_VERSION, HITTER_SLOTS, MODEL_VERSION, RULES_VERSION, SLOTS, type DraftAction, type Pick, type Replay, validateReliefRoles } from '../game/types.ts';

export const REPLAY_MAX_BYTES = 16 * 1024;
export const REPLAY_PREFIX = 'replays/v1/';
export const REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ASSET_ORIGIN = 'https://162-zero.internal';

export interface ReplayObject {
	body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string;
}

export interface ReplayPutOptions {
	httpMetadata?: { contentType?: string };
	onlyIf?: { etagDoesNotMatch?: string };
}

/** The subset of R2Bucket used by production and isolated unit tests. */
export interface ReplayBucket {
	get(key: string): Promise<ReplayObject | null>;
	put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions): Promise<unknown | null>;
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

/** The current dataset version from the deployed asset pointer; the full manifest is never parsed here. */
export async function loadCurrentDataVersion(assets: ReplayAssets | undefined): Promise<string> {
	if (!assets) throw new ReplayUnavailableError();
	try {
		const response = await assets.fetch(`${ASSET_ORIGIN}/data/current.json`);
		if (!response.ok) throw new ReplayUnavailableError();
		const current: unknown = await response.json();
		if (!isCurrentPointer(current)) throw new ReplayUnavailableError();
		return current.dataVersion;
	} catch {
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

const MAX_ACTIONS = 512;
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 80;
const isSlot = (value: unknown): value is Pick['slot'] => (SLOTS as readonly unknown[]).includes(value);

function action(value: unknown): DraftAction {
	const item = value as Record<string, unknown>;
	if (!item || typeof item !== 'object') throw new ReplayInvalidError();
	if (item.type === 'roll') return { type: 'roll' };
	if (item.type === 'reroll') return { type: 'reroll' };
	if (item.type === 'select-stadium' && isString(item.stadiumId) && isString(item.stadiumVersion)) return { type: 'select-stadium', stadiumId: item.stadiumId, stadiumVersion: item.stadiumVersion };
	if (item.type === 'pick' && isString(item.seasonId) && isSlot(item.slot)) return { type: 'pick', seasonId: item.seasonId, slot: item.slot };
	if (item.type === 'reassign' && isString(item.seasonId) && (HITTER_SLOTS as readonly unknown[]).includes(item.slot)) return { type: 'reassign', seasonId: item.seasonId, slot: item.slot as Extract<DraftAction, { type: 'reassign' }>['slot'] };
	throw new ReplayInvalidError();
}

function reliefRoles(value: unknown): Replay['reliefRoles'] {
	try {
		return validateReliefRoles(value, true);
	} catch {
		throw new ReplayInvalidError();
	}
}

/**
 * Checks that a value is a complete current-version replay and returns it in canonical key order.
 * The Worker checks shape and versions only; every browser that plays a replay validates its whole
 * draft history against the dataset, so a malformed history fails there, not here.
 */
function canonicalReplay(value: unknown, dataVersion: string): { input: Replay; bytes: Uint8Array } {
	if (!value || typeof value !== 'object') throw new ReplayInvalidError();
	const replay = value as Record<string, unknown>;
	if (replay.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION || replay.modelVersion !== MODEL_VERSION || replay.rulesVersion !== RULES_VERSION || replay.dataVersion !== dataVersion) {
		throw new ReplayIncompatibleError();
	}
	const stadium = replay.homeStadium as Record<string, unknown> | null;
	const picks = replay.picks;
	if (!Number.isSafeInteger(replay.seed) || (replay.seed as number) < 0 || (replay.seed as number) > 0xffffffff ||
		!stadium || typeof stadium !== 'object' || !isString(stadium.id) || !isString(stadium.version) ||
		!Array.isArray(picks) || picks.length !== SLOTS.length ||
		!Array.isArray(replay.battingOrder) || replay.battingOrder.length !== HITTER_SLOTS.length || !replay.battingOrder.every(isString) ||
		!Array.isArray(replay.starterOrder) || replay.starterOrder.length !== 3 || !replay.starterOrder.every(isString) ||
		!Array.isArray(replay.actions) || replay.actions.length > MAX_ACTIONS) {
		throw new ReplayInvalidError();
	}
	const input: Replay = {
		schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION, dataVersion, modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION,
		seed: replay.seed as number,
		homeStadium: { id: stadium.id as string, version: stadium.version as string },
		picks: picks.map(item => {
			const pick = item as Record<string, unknown>;
			if (!pick || !isString(pick.franchiseId) || !Number.isInteger(pick.decade) || !isString(pick.seasonId) || !isSlot(pick.slot)) throw new ReplayInvalidError();
			return { franchiseId: pick.franchiseId, decade: pick.decade as number, seasonId: pick.seasonId, slot: pick.slot };
		}),
		battingOrder: [...replay.battingOrder as string[]],
		starterOrder: [...replay.starterOrder as string[]],
		reliefRoles: reliefRoles(replay.reliefRoles),
		actions: replay.actions.map(action)
	};
	const bytes = new TextEncoder().encode(JSON.stringify(input));
	if (bytes.byteLength > REPLAY_MAX_BYTES) throw new ReplayInvalidError();
	return { input, bytes };
}

/** Persist one complete current-version replay input, without names or results. */
export async function storeReplay(bucket: ReplayBucket | undefined, value: unknown, dataVersion: string): Promise<StoredReplay> {
	if (!bucket) throw new ReplayUnavailableError();
	const { input, bytes } = canonicalReplay(value, dataVersion);
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

/** Fetch a stored replay; one from another game or data version is incompatible. */
export async function loadReplay(bucket: ReplayBucket | undefined, id: string, dataVersion: string): Promise<Replay> {
	if (!REPLAY_ID_PATTERN.test(id)) throw new ReplayNotFoundError();
	if (!bucket) throw new ReplayUnavailableError();
	let object: ReplayObject | null;
	try { object = await bucket.get(`${REPLAY_PREFIX}${id}`); }
	catch { throw new ReplayUnavailableError(); }
	if (!object) throw new ReplayNotFoundError();
	const bytes = await readObject(object);
	try {
		const { input } = canonicalReplay(parseInput(bytes), dataVersion);
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
