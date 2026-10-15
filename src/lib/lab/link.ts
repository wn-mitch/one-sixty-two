import { CHOICES, dialOf, parseSetup, PRINTS, type Relief, type Setup, type Target } from './controls.ts';

export const LAB_LINK_VERSION = 1;

export class LabLinkSaveError extends Error {
	readonly fallback: string;
	readonly status: number | null;

	constructor(message: string, fallback: string, status: number | null = null) {
		super(message);
		this.name = 'LabLinkSaveError';
		this.fallback = fallback;
		this.status = status;
	}
}

/**
 * The foil lab's shareable state: what a `#…` link and a saved short link carry. Everything is named (films, plates
 * and dials by name, never by index), so a link keeps working as modules are added, and anything a later lab no
 * longer has is dropped on load.
 */

export interface Stagger {
	target: Target;
	count: number;
	page: number;
}

export interface LinkState {
	setup: Setup;
	stagger: Stagger | null;
	width: number;
}

export const DEFAULT_WIDTH = 420;
export const MIN_WIDTH = 160;
export const MAX_WIDTH = 720;
export const MAX_STAGGER = 8;

/** The plain object a link stores: the state's schema version, setup fields, stagger and preview width. */
export function linkObject(state: LinkState): Record<string, unknown> {
	return { v: LAB_LINK_VERSION, ...state.setup, stagger: state.stagger, width: state.width };
}

/** Builds the full hash link, which remains a useful fallback when R2 is unavailable. */
export function labUrl(state: LinkState, origin: string, pathname = '/lab'): string {
	const url = new URL(pathname, origin);
	url.hash = encodeLink(state);
	return url.href;
}

export interface SaveLabLinkOptions {
	origin: string;
	fetcher?: typeof fetch;
	endpoint?: string;
	pathname?: string;
}

export interface SavedLabLink {
	url: string;
	fallback: string;
	short: boolean;
}

/** Saves a semantic state, exposing the full link on every failure so copy-link can degrade truthfully. */
export async function saveLabLink(state: LinkState, options: SaveLabLinkOptions): Promise<SavedLabLink> {
	const fallback = labUrl(state, options.origin, options.pathname);
	const request = options.fetcher ?? globalThis.fetch;
	if (!request) throw new LabLinkSaveError('Short lab links are unavailable. Copy the full link instead.', fallback);
	let response: Response;
	try {
		response = await request(options.endpoint ?? '/api/lab', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(linkObject(state))
		});
	} catch {
		throw new LabLinkSaveError('Short lab links are unavailable. Copy the full link instead.', fallback);
	}
	let payload: unknown = null;
	try { payload = await response.json(); } catch { /* the status still tells us this failed */ }
	if (!response.ok) {
		const message = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).message === 'string'
			? (payload as Record<string, unknown>).message as string
			: 'Short lab links are unavailable. Copy the full link instead.';
		throw new LabLinkSaveError(message, fallback, response.status);
	}
	const saved = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
	if (!saved || typeof saved.url !== 'string' || saved.url.length === 0) {
		throw new LabLinkSaveError('Short lab links are unavailable. Copy the full link instead.', fallback, response.status);
	}
	return { url: new URL(saved.url, options.origin).href, fallback, short: true };
}

/** A link fragment: the state as base64url JSON. */
export function encodeLink(state: LinkState): string {
	const bytes = new TextEncoder().encode(JSON.stringify(linkObject(state)));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** The state a link fragment carries, from this lab or the older standalone Foil Lab toy; null when it is not one. */
export function decodeLink(hash: string): LinkState | null {
	try {
		const binary = atob(hash.replaceAll('-', '+').replaceAll('_', '/'));
		const saved: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0))));
		return readLink(saved);
	} catch {
		return null;
	}
}

/** Reads a saved state, keeping only what this lab still has; null when it is not a lab state at all. */
export function readLink(saved: unknown): LinkState | null {
	if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
	const record = saved as Record<string, unknown>;
	if (record.v !== undefined && record.v !== LAB_LINK_VERSION) return null;
	if (record.print !== undefined && !(PRINTS as readonly { value: string }[]).some(option => option.value === record.print)) return null;
	const setup = parseSetup((isToyState(record) ? fromToy(record) : record) as Partial<Setup>);
	const stagger = record.stagger as Partial<Stagger> | null | undefined;
	const target = typeof stagger?.target === 'string' ? stagger.target : '';
	const known = target !== '' && ((CHOICES as readonly string[]).includes(target) || dialOf(target, setup) !== undefined);
	const count = Number.isInteger(stagger?.count) ? stagger!.count! : 5;
	const page = Number.isInteger(stagger?.page) ? stagger!.page! : 0;
	return {
		setup,
		stagger: known ? { target, count: Math.min(Math.max(count, 2), MAX_STAGGER), page } : null,
		width: typeof record.width === 'number' && Number.isFinite(record.width)
			? Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, record.width))) : DEFAULT_WIDTH
	};
}

/**
 * The standalone toy saved `{ sheet, film, finish, palette, plate, relief, drift, light, tuned }`: one foil sheet,
 * holo or plain silver or gold, with a spotlight dial that defaulted to 0.35.
 */
function isToyState(record: Record<string, unknown>): boolean {
	return typeof record.sheet === 'string' && !('print' in record);
}

const TOY_TIERS: Record<string, Setup['tier']> = { holo: 'gem', silver: 'foil', gold: 'emboss' };
const TOY_SPOTLIGHT = 0.35;

function fromToy(toy: Record<string, unknown>): Partial<Setup> {
	const light = toy.light && typeof toy.light === 'object' ? toy.light as Record<string, number> : {};
	return {
		print: 'sheet',
		tier: TOY_TIERS[toy.sheet as string] ?? 'gem',
		// The toy raised a rim unless told otherwise.
		relief: (['flat', 'rim', 'star'] as const).includes(toy.relief as Relief) ? toy.relief as Relief : 'rim',
		film: toy.film as string,
		finish: toy.finish as string,
		palette: toy.palette as string,
		plate: toy.plate as string,
		drift: toy.drift as boolean,
		tuned: toy.tuned as Setup['tuned'],
		light: { spotlight: TOY_SPOTLIGHT, ...light }
	};
}
