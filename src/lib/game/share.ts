import { replayInput, validateReplay } from './draft.ts';
import type { Draft, Manifest } from './types.ts';
import {
	SHARE_DIMENSIONS,
	SHARE_FORMATS,
	type ShareFormat,
	type SharePublication,
	type SharePublicationImage
} from '../share/types.ts';

const MAX_BYTES = 16 * 1024;
const MAX_TOKEN_LENGTH = Math.ceil(MAX_BYTES * 4 / 3);
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export interface StoredReplay {
	id: string;
	replayUrl: string;
}

export class ShareRequestError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
		this.name = 'ShareRequestError';
	}
}

export class ShareCapabilityError extends Error {
	readonly capability: 'text-clipboard' | 'image-clipboard' | 'native-share';
	constructor(capability: 'text-clipboard' | 'image-clipboard' | 'native-share') {
		super(`${capability} is unavailable`);
		this.capability = capability;
		this.name = 'ShareCapabilityError';
	}
}

type FetchBoundary = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ImageCopyBoundary {
	fetch: FetchBoundary;
	clipboard?: Pick<Clipboard, 'write'>;
	ClipboardItem?: typeof ClipboardItem;
}

interface DownloadBoundary {
	fetch: FetchBoundary;
	save: (blob: Blob, filename: string) => void;
}

function normalizedOrigin(origin: string): string {
	const parsed = new URL(origin);
	if (
		(parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
		|| parsed.pathname !== '/'
		|| parsed.search
		|| parsed.hash
		|| parsed.username
		|| parsed.password
	) throw new Error('Share origin is invalid');
	return parsed.origin;
}

async function responsePayload(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function payloadMessage(payload: unknown): string | null {
	return payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
		? payload.message
		: null;
}

function replayRequestMessage(status: number, payload: unknown): string {
	return payloadMessage(payload)
		?? (status === 413
			? 'Replay is too large.'
			: status === 409
				? 'Replay is incompatible with this dataset.'
				: 'Replay storage is unavailable. Please retry.');
}

function publicationRequestMessage(status: number, payload: unknown): string {
	return payloadMessage(payload)
		?? (status === 409
			? 'Replay is incompatible with this dataset.'
			: 'Share images could not be prepared. Your replay is saved; please retry.');
}

function validRecord(value: unknown): value is SharePublication['record'] {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	const keys = ['wins', 'losses', 'longestWinningStreak', 'runsFor', 'runsAgainst'];
	if (!keys.every(key => {
		const count = record[key];
		return typeof count === 'number' && Number.isInteger(count) && count >= 0;
	})) return false;
	if (Number(record.wins) + Number(record.losses) !== 162) return false;
	if (record.losses === 0) return record.firstLoss === null;
	return typeof record.firstLoss === 'number' && Number.isInteger(record.firstLoss) && record.firstLoss >= 1 && record.firstLoss <= 162;
}

function validPublicationImage(value: unknown, replayId: string, format: ShareFormat, origin: string): value is SharePublicationImage {
	if (!value || typeof value !== 'object') return false;
	const image = value as Record<string, unknown>;
	const dimensions = SHARE_DIMENSIONS[format];
	if (image.width !== dimensions.width || image.height !== dimensions.height || typeof image.sha256 !== 'string' || !DIGEST_PATTERN.test(image.sha256)) return false;
	if (typeof image.url !== 'string') return false;
	try {
		const url = new URL(image.url, origin);
		return image.url === url.href
			&& url.origin === origin
			&& url.pathname === `/api/replays/${replayId}/share/${format}.png`
			&& !url.search
			&& !url.hash
			&& !url.username
			&& !url.password;
	} catch {
		return false;
	}
}

export function validateSharePublication(value: unknown, replayId: string, origin: string): SharePublication {
	if (!value || typeof value !== 'object') throw new Error('Share preparation returned an invalid publication. Please retry.');
	const publication = value as Record<string, unknown>;
	const canonicalOrigin = normalizedOrigin(origin);
	if (
		publication.schemaVersion !== 1
		|| publication.replayId !== replayId
		|| typeof publication.replayUrl !== 'string'
		|| typeof publication.modelDigest !== 'string'
		|| !DIGEST_PATTERN.test(publication.modelDigest)
		|| !validRecord(publication.record)
		|| !publication.images
		|| typeof publication.images !== 'object'
	) throw new Error('Share preparation returned an invalid publication. Please retry.');
	const replayUrl = new URL(publication.replayUrl, canonicalOrigin);
	if (publication.replayUrl !== replayUrl.href || replayUrl.origin !== canonicalOrigin || replayUrl.pathname !== `/r/${replayId}` || replayUrl.search || replayUrl.hash) {
		throw new Error('Share preparation returned an invalid publication. Please retry.');
	}
	const images = publication.images as Record<string, unknown>;
	if (!SHARE_FORMATS.every(format => validPublicationImage(images[format], replayId, format, canonicalOrigin))) {
		throw new Error('Share preparation returned an invalid publication. Please retry.');
	}
	return value as SharePublication;
}

/** Encode versioned inputs for deterministic fragment round-trip verification. */
export function encodeReplay(draft: Draft): string {
	const bytes = new TextEncoder().encode(JSON.stringify(replayInput(draft)));
	if (bytes.length > MAX_BYTES) throw new Error('Replay exceeds the size limit');
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Decode a replay token and require the current replay contract. */
export function decodeReplay(token: string, manifest: Manifest): Draft {
	if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > MAX_TOKEN_LENGTH) throw new Error('Invalid replay link');
	try {
		const padded = token.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(token.length / 4) * 4, '=');
		const binary = atob(padded);
		if (binary.length > MAX_BYTES) throw new Error('Replay exceeds the size limit');
		const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
		const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
		return validateReplay(value, manifest);
	} catch (error) {
		if (error instanceof Error && (error.message === 'Saved draft is incompatible' || error.message.includes('incompatible'))) throw new Error('Replay version is incompatible');
		if (error instanceof Error && error.message === 'Replay exceeds the size limit') throw error;
		throw new Error('Invalid replay link: its draft or lineup could not be verified');
	}
}

/** Store the minimal replay input without preparing paid share artwork. */
export async function storeReplay(draft: Draft, origin: string, fetcher: FetchBoundary = fetch): Promise<StoredReplay> {
	const input = replayInput(draft);
	const bytes = new TextEncoder().encode(JSON.stringify(input));
	if (bytes.length > MAX_BYTES) throw new Error('Replay exceeds the size limit');
	const canonicalOrigin = normalizedOrigin(origin);
	let response: Response;
	try {
		response = await fetcher(`${canonicalOrigin}/api/replays`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input)
		});
	} catch {
		throw new ShareRequestError('Replay storage is unavailable. Please retry.', 0);
	}
	const payload = await responsePayload(response);
	if (!response.ok) throw new ShareRequestError(replayRequestMessage(response.status, payload), response.status);
	const id = payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string' ? payload.id : '';
	if (!ID_PATTERN.test(id)) throw new Error('Replay storage returned an invalid link. Please retry.');
	const replayUrl = `${canonicalOrigin}/r/${id}`;
	if (replayUrl.length > 100) throw new Error('Replay link is too long for this deployment. Please retry.');
	return { id, replayUrl };
}


/** Explicitly prepare all immutable share formats for an already stored replay. */
export async function prepareSharePublication(replayId: string, origin: string, fetcher: FetchBoundary = fetch): Promise<SharePublication> {
	if (!ID_PATTERN.test(replayId)) throw new Error('Replay storage returned an invalid link. Please retry.');
	const canonicalOrigin = normalizedOrigin(origin);
	let response: Response;
	try {
		response = await fetcher(`${canonicalOrigin}/api/replays/${replayId}/share`, { method: 'POST' });
	} catch {
		throw new ShareRequestError('Share images could not be prepared. Your replay is saved; please retry.', 0);
	}
	const payload = await responsePayload(response);
	if (!response.ok) throw new ShareRequestError(publicationRequestMessage(response.status, payload), response.status);
	return validateSharePublication(payload, replayId, canonicalOrigin);
}

export function isShareIncompatibility(error: unknown): boolean {
	return error instanceof ShareRequestError && error.status === 409;
}

export async function fetchPublishedPng(publication: SharePublication, format: ShareFormat, fetcher: FetchBoundary = fetch): Promise<Blob> {
	const image = publication.images[format];
	let response: Response;
	try {
		response = await fetcher(image.url, { headers: { accept: 'image/png' } });
	} catch {
		throw new Error('The published PNG is unavailable. Please retry.');
	}
	if (!response.ok || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'image/png') {
		throw new Error('The published PNG is unavailable. Please retry.');
	}
	return response.blob();
}

export function supportsImageClipboard(
	clipboard: Pick<Clipboard, 'write'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard,
	ClipboardItemConstructor: typeof ClipboardItem | undefined = globalThis.ClipboardItem
): boolean {
	return typeof clipboard?.write === 'function' && typeof ClipboardItemConstructor === 'function';
}

/**
 * Construct the ClipboardItem and call write synchronously from the gesture.
 * Its PNG promise may finish only after publication has been prepared.
 */
export function beginCopyPublishedImage(
	publication: Promise<SharePublication>,
	format: ShareFormat,
	boundary: ImageCopyBoundary = {
		fetch,
		clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
		ClipboardItem: globalThis.ClipboardItem
	}
): Promise<void> {
	if (!supportsImageClipboard(boundary.clipboard, boundary.ClipboardItem)) {
		throw new ShareCapabilityError('image-clipboard');
	}
	const png = publication.then(value => fetchPublishedPng(value, format, boundary.fetch));
	const ClipboardItemConstructor = boundary.ClipboardItem!;
	const clipboard = boundary.clipboard!;
	return clipboard.write([new ClipboardItemConstructor({ 'image/png': png })]);
}

export function copyShareLink(
	link: string,
	clipboard: Pick<Clipboard, 'writeText'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard
): Promise<void> {
	if (typeof clipboard?.writeText !== 'function') return Promise.reject(new ShareCapabilityError('text-clipboard'));
	return clipboard.writeText(link);
}

function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

export async function downloadPublishedImage(
	publication: SharePublication,
	format: ShareFormat,
	boundary: DownloadBoundary = { fetch, save: saveBlob }
): Promise<void> {
	const blob = await fetchPublishedPng(publication, format, boundary.fetch);
	boundary.save(blob, `162-0-${publication.record.wins}-${publication.record.losses}-${format}.png`);
}

export function requestNativeShare(
	publication: SharePublication,
	share: ((data: ShareData) => Promise<void>) | undefined = typeof navigator === 'undefined' ? undefined : navigator.share?.bind(navigator)
): Promise<void> {
	if (!share) return Promise.reject(new ShareCapabilityError('native-share'));
	try {
		return share({
			title: `${publication.record.wins}-${publication.record.losses} in 162-0`,
			text: `Can you beat ${publication.record.wins}-${publication.record.losses}?`,
			url: publication.replayUrl
		});
	} catch (error) {
		return Promise.reject(error);
	}
}
