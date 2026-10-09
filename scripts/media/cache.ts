import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalJSON } from '../data/compile.ts';

interface JsonEnvelope<T> {
	request: string;
	checksum: string;
	payload: T;
}

const USER_AGENT = '162-zero-media/1.0 (free-media compiler; https://www.wikidata.org/wiki/Wikidata:Data_access)';

export function digest(bytes: string | Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

export async function atomicWrite(path: string, bytes: string | Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, bytes);
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => undefined);
		throw error;
	}
}

export async function readVerifiedJson<T>(path: string, request: string): Promise<T | null> {
	let bytes: Buffer;
	try {
		bytes = await readFile(path);
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
		throw error;
	}
	try {
		const envelope = JSON.parse(bytes.toString('utf8')) as JsonEnvelope<T>;
		if (envelope.request !== request) return null;
		if (digest(canonicalJSON(envelope.payload)) !== envelope.checksum) return null;
		return envelope.payload;
	} catch {
		return null;
	}
}

async function requestWithRetry<T>(
	url: string,
	init: RequestInit | undefined,
	readResponse: (response: Response) => Promise<T>
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const response = await fetch(url, {
				...init,
				signal: init?.signal ?? AbortSignal.timeout(30_000),
				headers: { Accept: '*/*', 'User-Agent': USER_AGENT, ...init?.headers }
			});
			if (response.ok) return await readResponse(response);
			if (response.status !== 429 && response.status < 500) {
				const body = response.headers.get('content-type')?.includes('json') ? await response.json().catch(() => null) as { detail?: unknown } | null : null;
				const detail = typeof body?.detail === 'string' ? `: ${body.detail.slice(0, 240)}` : '';
				throw new PermanentProviderError(`HTTP ${response.status} ${response.statusText}${detail}`);
			}
			lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
			const retryHeader = response.headers.get('retry-after');
			const retryAfter = retryHeader && !/^\d+$/.test(retryHeader) ? (Date.parse(retryHeader) - Date.now()) / 1000 : Number(retryHeader);
			if (retryAfter > 60) throw new PermanentProviderError(`HTTP ${response.status}; provider requires retry after ${Math.ceil(retryAfter)} seconds`);
			const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(60_000, retryAfter * 1_000) : 1_000 * 2 ** attempt;
			const wait = Promise.withResolvers<void>();
			setTimeout(wait.resolve, delay);
			await wait.promise;
		} catch (error) {
			if (error instanceof PermanentProviderError) throw error;
			lastError = error;
			if (attempt < 3) {
				const wait = Promise.withResolvers<void>();
				setTimeout(wait.resolve, 1_000 * 2 ** attempt);
				await wait.promise;
			}
		}
	}
	throw new Error(`Provider request ${digest(url).slice(0, 12)} failed`, { cause: lastError });
}
class PermanentProviderError extends Error {}

export async function fetchCachedJson<T>(
	cacheDir: string,
	namespace: string,
	request: string,
	url: string,
	offline: boolean,
	validate?: (payload: T) => boolean,
	init?: RequestInit,
	refresh = false
): Promise<T> {
	const path = join(cacheDir, namespace, `${digest(request)}.json`);
	const cached = await readVerifiedJson<T>(path, request);
	if ((!refresh || offline) && cached !== null && (!validate || validate(cached))) return cached;
	if (offline) throw new Error(`Offline media acquisition requires cached ${namespace} response ${digest(request)}`);
	const payload = await requestWithRetry<T>(url, {
		...init,
		headers: { Accept: 'application/json', ...init?.headers }
	}, async response => {
		try {
			return (await response.json()) as T;
		} catch (error) {
			throw new Error(`Provider returned invalid JSON for ${namespace}`, { cause: error });
		}
	});
	if (validate && !validate(payload)) throw new Error(`Provider returned an invalid ${namespace} response`);
	const envelope: JsonEnvelope<T> = { request, checksum: digest(canonicalJSON(payload)), payload };
	await atomicWrite(path, `${canonicalJSON(envelope)}\n`);
	return payload;
}

interface ByteMetadata {
	url: string;
	checksum: string;
	length: number;
}

export async function fetchCachedBytes(cacheDir: string, url: string, offline: boolean): Promise<Buffer> {
	const key = digest(url);
	const bytesPath = join(cacheDir, 'downloads', `${key}.bin`);
	const metadataPath = join(cacheDir, 'downloads', `${key}.json`);
	try {
		const [bytes, metadataBytes] = await Promise.all([readFile(bytesPath), readFile(metadataPath)]);
		const metadata = JSON.parse(metadataBytes.toString('utf8')) as ByteMetadata;
		if (metadata.url === url && metadata.length === bytes.length && metadata.checksum === digest(bytes)) return bytes;
	} catch {
		// A malformed or stale pair is replaced online and rejected offline below.
	}
	if (offline) throw new Error(`Offline media acquisition requires cached image bytes ${key}`);
	const bytes = await requestWithRetry(url, undefined, async response =>
		Buffer.from(await response.arrayBuffer())
	);
	if (bytes.length > 16 * 1024 * 1024) throw new Error(`Provider image response exceeded the 16 MiB thumbnail limit for ${key}`);
	if (!bytes.length) throw new Error(`Provider returned an empty image response for ${key}`);
	const metadata: ByteMetadata = { url, checksum: digest(bytes), length: bytes.length };
	await atomicWrite(bytesPath, bytes);
	await atomicWrite(metadataPath, `${canonicalJSON(metadata)}\n`);
	return bytes;
}
