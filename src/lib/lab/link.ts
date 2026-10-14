import { CHOICES, dialOf, parseSetup, type Relief, type Setup, type Target } from './controls.ts';

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
	zoom: number;
}

export const ZOOMS = [1, 1.5, 2, 3, 4] as const;
export const MAX_STAGGER = 8;

/** The plain object a link stores: the setup's fields with the stagger and zoom beside them. */
export function linkObject(state: LinkState): Record<string, unknown> {
	return { ...state.setup, stagger: state.stagger, zoom: state.zoom };
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
	const setup = parseSetup((isToyState(record) ? fromToy(record) : record) as Partial<Setup>);
	const stagger = record.stagger as Partial<Stagger> | null | undefined;
	const target = typeof stagger?.target === 'string' ? stagger.target : '';
	const known = target !== '' && ((CHOICES as readonly string[]).includes(target) || dialOf(target, setup) !== undefined);
	const count = Number.isInteger(stagger?.count) ? stagger!.count! : 5;
	const page = Number.isInteger(stagger?.page) ? stagger!.page! : 0;
	return {
		setup,
		stagger: known ? { target, count: Math.min(Math.max(count, 2), MAX_STAGGER), page } : null,
		zoom: ZOOMS.includes(record.zoom as never) ? record.zoom as number : 1
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
