import { join } from 'node:path';
import { digest, fetchCachedJson, readVerifiedJson } from './cache.ts';
import { metadataFromCommonsPage } from './providers.ts';
import type { CommonsResponse } from './providers.ts';
import { commonsCandidate, normalizedName } from './research.ts';
import type { PhotoCandidate, ResearchProvider } from './research.ts';
import type { CandidateIdentity } from './types.ts';

export interface DiscoveryOptions {
	cacheDir: string;
	offline: boolean;
	refresh: boolean;
	/** Stops a bounded run explicitly; cached pages do not consume this allowance. */
	requestLimit?: number;
}
type Json = Record<string, any>;
export class DiscoveryBlocked extends Error {}

/** A process uses one serialized request stream per provider. Published provider limits are ceilings. */
export class DiscoveryAccess {
	private nextRequest = new Map<ResearchProvider, number>();
	private used = new Map<ResearchProvider, number>();
	private blocked = new Map<ResearchProvider, string>();
	private failures = new Map<ResearchProvider, number>();
	readonly options: DiscoveryOptions;
	constructor(options: DiscoveryOptions) { this.options = options; }
	block(provider: ResearchProvider, reason: string): void { this.blocked.set(provider, reason); }
	blockReason(provider: ResearchProvider): string | undefined { return this.blocked.get(provider); }
	async json(provider: ResearchProvider, url: string, validate: (value: Json) => boolean): Promise<Json> {
		const request = `research-v1:${url}`;
		const cached = await readVerifiedJson<Json>(join(this.options.cacheDir, 'research-responses', `${digest(request)}.json`), request);
		if ((!this.options.refresh || this.options.offline) && cached && validate(cached)) return cached;
		if (this.options.offline) throw new DiscoveryBlocked(`Offline snapshot missing for ${provider}: ${digest(request)}`);
		const blocked = this.blocked.get(provider);
		if (blocked) throw new DiscoveryBlocked(blocked);
		if ((this.used.get(provider) ?? 0) >= (this.options.requestLimit ?? Infinity)) throw new DiscoveryBlocked(`Configured request limit reached for ${provider}; resume this provider`);
		const delay = Math.max(0, (this.nextRequest.get(provider) ?? 0) - Date.now());
		if (delay) await new Promise(resolve => setTimeout(resolve, delay));
		this.nextRequest.set(provider, Date.now() + (provider === 'loc' ? 3200 : 1100));
		this.used.set(provider, (this.used.get(provider) ?? 0) + 1);
		const headers: Record<string, string> = {};
		if (provider === 'openverse' && process.env.OPENVERSE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.OPENVERSE_ACCESS_TOKEN}`;
		try {
			const result = await fetchCachedJson<Json>(this.options.cacheDir, 'research-responses', request, url, false, validate, { headers }, this.options.refresh);
			this.failures.set(provider, 0);
			return result;
		} catch (error) {
			const message = error instanceof Error ? `${error.message}${error.cause instanceof Error ? `: ${error.cause.message}` : ''}` : String(error);
			// A service-wide denial must not trigger thousands of identical requests.
			if (/HTTP (?:401|403|429)|retry after|CAPTCHA/i.test(message)) this.block(provider, message);
			const failures = (this.failures.get(provider) ?? 0) + 1;
			this.failures.set(provider, failures);
			if (failures >= 3) this.block(provider, `Three consecutive provider failures; retry required: ${message}`);
			throw error;
		}
	}
}

function commonsUrl(params: Record<string, string>): string {
	const url = new URL('https://commons.wikimedia.org/w/api.php');
	url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', maxlag: '5', ...params }).toString();
	return url.toString();
}
function commonsValid(value: Json): boolean {
	if (value.error || value.warnings) throw new DiscoveryBlocked(`Commons rejected or truncated the query: ${JSON.stringify(value.error ?? value.warnings)}`);
	return !value.error && !value.warnings && (Array.isArray(value.query?.pages) || Array.isArray(value.query?.categorymembers) || value.batchcomplete === true);
}

/** Some document hits cannot generate thumbnails. Keep the search page and its continuation. */
async function commonsImages(access: DiscoveryAccess, params: Record<string, string>): Promise<Json> {
	const query = { ...params, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata' };
	try {
		return await access.json('commons', commonsUrl({ ...query, iiurlwidth: '384' }), commonsValid);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		if (!/"code":"urlparamnormal"/.test(reason) && !(access.options.offline && /Offline snapshot missing/.test(reason))) throw error;
		return access.json('commons', commonsUrl(query), commonsValid);
	}
}

export async function searchCommons(access: DiscoveryAccess, identity: CandidateIdentity, aliases: string[], onPage: (candidates: PhotoCandidate[], query: string) => Promise<void>): Promise<string[]> {
	const names = [...new Map(aliases.map(name => [normalizedName(name), name])).values()];
	const queries = names.map(name => `"${name.replace(/["\\]/g, '')}"`);
	if (identity.wikidataId) queries.push(`haswbstatement:P180=${identity.wikidataId}`);
	return commonsQueries(access, queries, onPage);
}

export async function searchCommonsBatch(access: DiscoveryAccess, identities: CandidateIdentity[], aliases: Map<string, string[]>, onPage: (candidates: PhotoCandidate[], query: string) => Promise<void>): Promise<string[]> {
	const names = [...new Map(identities.flatMap(identity => aliases.get(identity.playerId) ?? [identity.name]).map(name => [normalizedName(name), name])).values()];
	// CirrusSearch limits query complexity. Small groups also avoid silently truncated terms.
	const chunks = (terms: string[]) => Array.from({ length: Math.ceil(terms.length / 8) }, (_, i) => terms.slice(i * 8, i * 8 + 8).join(' OR '));
	const queries = chunks(names.map(name => `"${name.replace(/["\\]/g, '')}"`));
	const entities = identities.flatMap(identity => identity.wikidataId ? [`haswbstatement:P180=${identity.wikidataId}`] : []);
	// A combined subject query does not identify which entity matched each file.
	// Keep these queries individual so unnamed photographs reach only their subject.
	queries.push(...entities);
	await commonsQueries(access, queries, onPage);
	for (const identity of identities) for (const category of identity.commonsCategories ?? []) {
		await discoverCommonsCollection(access, category, async (candidates, child) => {
			const query = `Player category ${identity.playerId}: ${child}`;
			queries.push(query);
			// Metadata comes through the same rate-limited, resumable request stream as searches.
			for (let start = 0; start < candidates.length; start += 50) {
				const batch = candidates.slice(start, start + 50);
				const response = await commonsImages(access, { pageids: batch.map(item => item.sourceId.replace('commons:', '')).join('|') });
				const metadata = new Map(((response as CommonsResponse).query?.pages ?? []).flatMap(page => {
					const item = metadataFromCommonsPage(page); return item ? [[String(`commons:${item.pageId}`), item] as const] : [];
				}));
				await onPage(batch.map(item => ({ ...item, metadata: metadata.get(item.sourceId), via: [...item.via, query] })), query);
			}
			if (!candidates.length) await onPage([], query);
		});
	}
	return queries;
}

async function commonsQueries(access: DiscoveryAccess, queries: string[], onPage: (candidates: PhotoCandidate[], query: string) => Promise<void>): Promise<string[]> {
	for (const query of queries) {
		let continuation: Record<string, string> = {};
		const seen = new Set<string>();
		do {
			const token = JSON.stringify(continuation);
			if (seen.has(token)) throw new DiscoveryBlocked('Commons repeated a search continuation token');
			seen.add(token);
			const response = await commonsImages(access, { generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '50', ...continuation });
			const candidates = ((response as CommonsResponse).query?.pages ?? []).flatMap(page => {
				const metadata = metadataFromCommonsPage(page);
				return metadata ? [commonsCandidate(metadata, `Commons search: ${query}`)] : [];
			});
			await onPage(candidates, query);
			continuation = response.continue ?? {};
		} while (Object.keys(continuation).length);
	}
	return queries;
}

/** Explicit collections may be traversed independently of identity. Their files still require review. */
export async function discoverCommonsCollection(access: DiscoveryAccess, root: string, onPage: (candidates: PhotoCandidate[], query: string) => Promise<void>, maxCategories = 500): Promise<void> {
	const queue = [root.replace(/^Category:/, '')], visited = new Set<string>();
	while (queue.length) {
		const title = queue.shift()!;
		if (visited.has(title)) continue;
		if (visited.size >= maxCategories) throw new DiscoveryBlocked(`Collection traversal reached ${maxCategories} categories; remaining categories have not been searched`);
		visited.add(title);
		let continuation: Record<string, string> = {};
		const seen = new Set<string>();
		do {
			const token = JSON.stringify(continuation);
			if (seen.has(token)) throw new DiscoveryBlocked('Commons repeated a category continuation token');
			seen.add(token);
			const response = await access.json('commons', commonsUrl({ list: 'categorymembers', cmtitle: `Category:${title}`, cmtype: 'file|subcat', cmlimit: '500', ...continuation }), commonsValid);
			const members: Array<{ ns: number; pageid: number; title: string }> = response.query?.categorymembers ?? [];
			queue.push(...members.filter(item => item.ns === 14).map(item => item.title.replace(/^Category:/, '')));
			await onPage(members.filter(item => item.ns === 6).map(item => ({ sourceId: `commons:${item.pageid}`, provider: 'commons', title: item.title.replace(/^File:/, ''),
				sourceUrl: `https://commons.wikimedia.org/?curid=${item.pageid}`, via: [`Collection: ${title}`] })), title);
			continuation = response.continue ?? {};
		} while (Object.keys(continuation).length);
	}
}

export async function searchOpenverse(access: DiscoveryAccess, aliases: string[], onPage: (candidates: PhotoCandidate[], query: string) => Promise<void>): Promise<string[]> {
	const queries = [...new Map(aliases.map(name => [normalizedName(name), name])).values()];
	for (const query of queries) {
		let page = 1, pages = 1;
		do {
			const url = new URL('https://api.openverse.org/v1/images/');
			url.search = new URLSearchParams({ q: `"${query}"`, license: 'by,by-sa,cc0,pdm', page_size: '20', page: String(page) }).toString();
			const response = await access.json('openverse', url.toString(), value => Array.isArray(value.results) && Number.isInteger(value.page_count) && value.page === page);
			pages = response.page_count;
			if (pages < 0 || (page < pages && response.results.length === 0)) throw new DiscoveryBlocked('Openverse returned incomplete pagination');
			await onPage(response.results.map((item: Json): PhotoCandidate => ({ sourceId: `openverse:${item.id}`, provider: 'openverse', title: item.title ?? '', sourceUrl: item.foreign_landing_url,
				// Search metadata is a lead, not an approved original-source rights snapshot.
				via: [`Openverse: ${query}`, `Reported ${item.license} ${item.license_version ?? ''}; original-source verification required`, ...(item.url ? [`Preview: ${item.url}`] : [])] })), query);
			page++;
		} while (page <= pages);
	}
	return queries;
}

export async function searchLoc(access: DiscoveryAccess, aliases: string[], onPage: (candidates: PhotoCandidate[], query: string) => Promise<void>): Promise<string[]> {
	const queries = [...new Map(aliases.map(name => [normalizedName(name), name])).values()];
	for (const query of queries) {
		let page = 1, next = true;
		while (next) {
			const url = new URL('https://www.loc.gov/photos/');
			url.search = new URLSearchParams({ q: `"${query}"`, fo: 'json', c: '100', sp: String(page), at: 'results,pagination' }).toString();
			const response = await access.json('loc', url.toString(), value => Array.isArray(value.results) && !!value.pagination && Number.isInteger(value.pagination.total));
			await onPage(response.results.map((item: Json): PhotoCandidate => ({ sourceId: `loc:${item.id}`, provider: 'loc', title: item.title ?? '', sourceUrl: item.id,
				via: [`LOC: ${query}`, 'Item-level rights and digitized image require review'] })), query);
			next = !!response.pagination.next;
			if (next && (!response.results.length || page >= response.pagination.total)) throw new DiscoveryBlocked('LOC returned incomplete pagination');
			page++;
		}
	}
	return queries;
}
