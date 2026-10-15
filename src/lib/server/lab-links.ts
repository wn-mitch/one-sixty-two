import { PRINTS } from '../lab/controls.ts';
import type { ReplayBucket } from './replays.ts';

/**
 * Saved foil lab links: a lab state stored under a short random id, so a long `#…` setup can be shared as
 * `/lab/s/<id>`. Links never expire and are never overwritten. The Worker checks only the state's shape; the lab
 * drops any film, plate or dial it no longer has when the link opens.
 */

export const LAB_LINK_MAX_BYTES = 8 * 1024;
export const LAB_LINK_PREFIX = 'lab/v1/';
export const LAB_LINK_VERSION = 1;
export const LAB_LINK_ID_PATTERN = /^[A-Za-z0-9]{8}$/;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_ATTEMPTS = 4;

export class LabLinkInvalidError extends Error {
	constructor() { super('Lab link is invalid.'); }
}

export class LabLinkUnavailableError extends Error {
	constructor() { super('Lab link storage is unavailable. Please retry.'); }
}

/** The plain choice names a setup holds: film, plate, era and so on. */
const CHOICE_KEYS = ['print', 'relief', 'tier', 'era', 'film', 'finish', 'palette', 'under', 'plate', 'stock'] as const;
const NAME = /^[a-z0-9-]{0,40}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DIAL = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const MODULE = /^(film|finish|plate):[a-z0-9-]{1,40}$/;
const TARGET = /^[a-z]{1,12}(:[A-Za-z][A-Za-z0-9]{0,39})?$/;
const MAX_DIALS = 48;
const MAX_MODULES = 64;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function dials(value: unknown): Record<string, number> {
	if (value === undefined) return {};
	if (!isRecord(value) || Object.keys(value).length > MAX_DIALS) throw new LabLinkInvalidError();
	const result: Record<string, number> = {};
	for (const [dial, entry] of Object.entries(value)) {
		if (!DIAL.test(dial) || typeof entry !== 'number' || !Number.isFinite(entry)) throw new LabLinkInvalidError();
		result[dial] = entry;
	}
	return result;
}

/**
 * Checks a lab state's shape and returns only the keys a lab state has, in a fixed order. Names and dials are
 * checked as plain names and finite numbers, not against today's modules, so a link outlives module changes.
 */
export function canonicalLabState(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) throw new LabLinkInvalidError();
	if (value.v !== undefined && value.v !== LAB_LINK_VERSION) throw new LabLinkInvalidError();
	const state: Record<string, unknown> = { v: LAB_LINK_VERSION };
	for (const key of CHOICE_KEYS) {
		const entry = value[key];
		if (entry === undefined) continue;
		if (typeof entry !== 'string' || !NAME.test(entry)) throw new LabLinkInvalidError();
		if (key === 'print' && !PRINTS.some(option => option.value === entry)) throw new LabLinkInvalidError();
		state[key] = entry;
	}
	if (value.gradient !== undefined) {
		if (!Array.isArray(value.gradient) || value.gradient.length < 2 || value.gradient.length > 5
			|| value.gradient.some(entry => typeof entry !== 'string' || !HEX.test(entry))) throw new LabLinkInvalidError();
		state.gradient = [...value.gradient];
	}
	if (value.tuned !== undefined) {
		if (!isRecord(value.tuned) || Object.keys(value.tuned).length > MAX_MODULES) throw new LabLinkInvalidError();
		const tuned: Record<string, Record<string, number>> = {};
		for (const [module, table] of Object.entries(value.tuned)) {
			if (!MODULE.test(module)) throw new LabLinkInvalidError();
			tuned[module] = dials(table);
		}
		state.tuned = tuned;
	}
	if (value.light !== undefined) state.light = dials(value.light);
	if (value.drift !== undefined) {
		if (typeof value.drift !== 'boolean') throw new LabLinkInvalidError();
		state.drift = value.drift;
	}
	if (isRecord(value.stagger)) {
		const { target, count, page } = value.stagger;
		if (typeof target !== 'string' || !TARGET.test(target) || !Number.isInteger(count) || !Number.isInteger(page)
			|| Math.abs(count as number) > 64 || Math.abs(page as number) > 10_000) throw new LabLinkInvalidError();
		state.stagger = { target, count, page };
	} else if (value.stagger !== undefined && value.stagger !== null) throw new LabLinkInvalidError();
	if (value.width !== undefined) {
		if (typeof value.width !== 'number' || !Number.isFinite(value.width)) throw new LabLinkInvalidError();
		state.width = value.width;
	}
	return state;
}

/** A random id of 8 base62 characters, unbiased by rejecting bytes past the last whole run of the alphabet. */
export function labLinkId(): string {
	let id = '';
	while (id.length < 8) {
		for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
			if (byte >= 248 || id.length === 8) continue;
			id += ID_ALPHABET[byte % 62];
		}
	}
	return id;
}

/** Stores a lab state under a new id; an id already taken is never overwritten, and another is drawn. */
export async function storeLabLink(bucket: ReplayBucket | undefined, value: unknown, newId: () => string = labLinkId): Promise<string> {
	if (!bucket) throw new LabLinkUnavailableError();
	const bytes = new TextEncoder().encode(JSON.stringify(canonicalLabState(value)));
	if (bytes.byteLength > LAB_LINK_MAX_BYTES) throw new LabLinkInvalidError();
	for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
		const id = newId();
		let stored: unknown;
		try {
			stored = await bucket.put(`${LAB_LINK_PREFIX}${id}`, bytes, {
				httpMetadata: { contentType: 'application/json' },
				onlyIf: { etagDoesNotMatch: '*' }
			});
		} catch {
			throw new LabLinkUnavailableError();
		}
		// R2 returns null when the condition fails: the id is taken.
		if (stored !== null) return id;
	}
	throw new LabLinkUnavailableError();
}

/** A stored lab state, or null when there is none under this id. */
export async function loadLabLink(bucket: ReplayBucket | undefined, id: string): Promise<Record<string, unknown> | null> {
	if (!LAB_LINK_ID_PATTERN.test(id)) return null;
	if (!bucket) throw new LabLinkUnavailableError();
	let text: string;
	try {
		const object = await bucket.get(`${LAB_LINK_PREFIX}${id}`);
		if (!object) return null;
		text = await new Response(object.body as BodyInit).text();
	} catch {
		throw new LabLinkUnavailableError();
	}
	try {
		return canonicalLabState(JSON.parse(text));
	} catch {
		return null;
	}
}

/** The lab state as a `/lab` link fragment, base64url JSON as the lab writes it. */
export function labFragment(state: Record<string, unknown>): string {
	const bytes = new TextEncoder().encode(JSON.stringify(state));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
