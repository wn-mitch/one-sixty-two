import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJSON } from '../data/compile.ts';
import { digest } from './cache.ts';
import { acquireCommonsMetadata, metadataFromCommonsPage } from './providers.ts';
import type { CommonsResponse } from './providers.ts';
import type { CommonsMetadata } from './types.ts';

/** Reads only complete, checksum-verified snapshots. Discovery and compilation share these records. */
export async function cachedCommonsMetadata(cacheDir: string, width = 384): Promise<Map<string, CommonsMetadata>> {
	const result = new Map<string, CommonsMetadata>();
	let files: string[];
	try { files = await readdir(join(cacheDir, 'commons')); }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw error; }
	for (const file of files.filter(name => name.endsWith('.json')).sort()) {
		let envelope: { request: string; checksum: string; payload: CommonsResponse };
		try { envelope = JSON.parse(await readFile(join(cacheDir, 'commons', file), 'utf8')); } catch { continue; }
		if (!envelope.request?.startsWith(`thumbnail-v3:${width}:`) || !Array.isArray(envelope.payload?.query?.pages)
			|| digest(canonicalJSON(envelope.payload)) !== envelope.checksum) continue;
		for (const page of envelope.payload.query.pages) {
			const metadata = metadataFromCommonsPage(page, width);
			if (metadata) result.set(metadata.title, metadata);
		}
		const aliases = [...(envelope.payload.query.normalized ?? []), ...(envelope.payload.query.redirects ?? [])];
		for (let pass = 0; pass < aliases.length; pass++) {
			for (const alias of aliases) {
				const metadata = result.get(alias.to.replace(/^File:/, ''));
				if (metadata) result.set(alias.from.replace(/^File:/, ''), metadata);
			}
		}
	}
	return result;
}

/** Normal builds resolve only explicit inventory entries, never run broad discovery. */
export async function inventoryMetadata(titles: string[], cacheDir: string, offline: boolean, width = 384): Promise<Map<string, CommonsMetadata>> {
	const cached = await cachedCommonsMetadata(cacheDir, width);
	const missing = [...new Set(titles)].filter(title => !cached.has(title));
	if (missing.length) {
		const fetched = await acquireCommonsMetadata(missing, cacheDir, offline, () => undefined, width);
		for (const [title, metadata] of fetched) cached.set(title, metadata);
	}
	return new Map(titles.flatMap(title => cached.has(title) ? [[title, cached.get(title)!]] : []));
}
