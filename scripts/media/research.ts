import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireTables } from '../data/acquire.ts';
import { canonicalJSON } from '../data/compile.ts';
import type { MediaManifest, MediaPointer, PlayerPhoto } from '../../src/lib/media/types.ts';
import { atomicWrite, digest } from './cache.ts';
import { buildCandidateIdentities, emptyExclusions, groupVerifiedWikidataMedia } from './logic.ts';
import { cachedCommonsMetadata } from './inventory.ts';
import type { CandidateIdentity, CommonsMetadata, DataManifest, DataPointer, PhotoReview, WikidataMedia } from './types.ts';

export type ResearchProvider = 'cached' | 'commons' | 'openverse' | 'loc' | 'manual';
export const discoveryStrategy = (provider: ResearchProvider): string => provider === 'commons' ? 'names-subjects-categories-v3' : 'names-v1';
export const searchComplete = (provider: ResearchProvider, state?: SearchState): boolean => state?.status === 'complete'
	&& (provider !== 'commons' || state.strategy === discoveryStrategy(provider));
export interface SearchState {
	status: 'complete' | 'blocked' | 'pending';
	queries: string[];
	reason?: string;
	attempted: boolean;
	updatedAt: string;
	/** Original archive pages or search-result evidence reviewed during targeted research. */
	evidenceUrls?: string[];
	strategy?: string;
}
export interface PhotoCandidate {
	sourceId: string;
	provider: ResearchProvider;
	title: string;
	sourceUrl: string;
	metadata?: CommonsMetadata;
	via: string[];
}
export interface PlayerResearch {
	schemaVersion: 1;
	playerId: string;
	name: string;
	dataVersion: string;
	candidates: PhotoCandidate[];
	searches: Partial<Record<ResearchProvider, SearchState>>;
}
export interface ResearchContext {
	root: string;
	cacheDir: string;
	data: DataManifest;
	media: MediaManifest;
	identities: CandidateIdentity[];
	aliases: Map<string, string[]>;
	reviews: PhotoReview[];
}

export interface CandidateAcquisition {
	playerId: string;
	sourceId: string;
	status: 'acquired' | 'failed';
	updatedAt: string;
	reason?: string;
}

/** Separate files keep acquisition updates independent of a running discovery checkpoint. */
export async function recordAcquisition(cacheDir: string, result: CandidateAcquisition): Promise<void> {
	await atomicWrite(join(cacheDir, 'research/acquisitions', result.playerId, `${digest(result.sourceId)}.json`), canonicalJSON(result));
}

export async function readAcquisitions(cacheDir: string, playerId: string): Promise<Map<string, CandidateAcquisition>> {
	const directory = join(cacheDir, 'research/acquisitions', playerId);
	let paths: string[];
	try { paths = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map(); throw error; }
	const records = await Promise.all(paths.filter(path => path.endsWith('.json')).map(path => readJson<CandidateAcquisition>(join(directory, path))));
	return new Map(records.filter(record => record.playerId === playerId).map(record => [record.sourceId, record]));
}

export const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
export const normalizedName = (value: string) => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Search hits remain leads; even a structured subject can be a civilian portrait. */
export function candidateMatchesPlayer(candidate: PhotoCandidate, query: string, identity: CandidateIdentity, aliases: string[]): boolean {
	if (query.startsWith('Player category ')) return query.startsWith(`Player category ${identity.playerId}:`);
	if (query.startsWith('haswbstatement:')) return query === `haswbstatement:P180=${identity.wikidataId}`;
	const text = ` ${normalizedName(`${candidate.title} ${candidate.metadata?.description ?? ''}`)} `;
	return aliases.some(name => text.includes(` ${normalizedName(name)} `));
}

/** Baseball context outranks name-only matches without silently discarding broad research. */
export function candidateRelevance(candidate: PhotoCandidate, identity: CandidateIdentity, aliases: string[]): number {
	const metadata = candidate.metadata;
	const baseball = /\b(?:baseball|pitcher|batter|shortstop|outfielder|catcher|MLB|major league|minor league)\b/i
		.test(`${candidate.title} ${metadata?.description ?? ''} ${(metadata?.categories ?? []).join(' ')}`);
	const named = aliases.some(name => ` ${normalizedName(candidate.title)} `.includes(` ${normalizedName(name)} `));
	const subject = candidate.via.some(via => via === `Commons search: haswbstatement:P180=${identity.wikidataId}`
		|| via.startsWith(`Player category ${identity.playerId}:`) || via === 'cached identity/category');
	const mentioned = candidateMatchesPlayer(candidate, '', identity, aliases);
	return baseball && (mentioned || subject) ? 3 + Number(named) : subject ? 2 : Number(named);
}

/** Audit only the published legacy sources, without substituting a newer search hit. */
export function isLegacyCandidate(candidate: PhotoCandidate, photos: PlayerPhoto[]): boolean {
	return photos.some(photo => photo.review !== 'approved' && (photo.sourceId === candidate.sourceId
		|| [candidate.sourceUrl, ...(candidate.metadata ? [candidate.metadata.sourceUrl] : [])]
			.some(url => sourceKey(photo.sourceUrl) === sourceKey(url))));
}

export async function researchContext(root: string): Promise<ResearchContext> {
	const dataPointer = await readJson<DataPointer>(join(root, 'static/data/current.json'));
	const mediaPointer = await readJson<MediaPointer>(join(root, 'static/media/current.json'));
	const data = await readJson<DataManifest>(join(root, 'static', dataPointer.manifestUrl));
	const media = await readJson<MediaManifest>(join(root, 'static', mediaPointer.manifestUrl));
	const tables = await acquireTables(true);
	const identities = buildCandidateIdentities(data, tables.People ?? [], tables.Batting ?? [], tables.Pitching ?? [], emptyExclusions());
	const people = new Map((tables.People ?? []).map(person => [person.playerID, person]));
	const aliases = new Map(identities.map(identity => {
		const person = people.get(identity.playerId);
		return [identity.playerId, [...new Set([identity.name, person?.nameGiven ? `${person.nameGiven} ${person.nameLast}` : '', normalizedName(identity.name)])].filter(Boolean)];
	}));
	return { root, cacheDir: join(root, '.cache/media'), data, media, identities, aliases,
		reviews: await readJson<PhotoReview[]>(join(root, 'scripts/media/photo-reviews.json')) };
}

export async function readResearch(context: ResearchContext, identity: CandidateIdentity): Promise<PlayerResearch> {
	let record: PlayerResearch = { schemaVersion: 1, playerId: identity.playerId, name: identity.name, dataVersion: context.data.dataVersion, candidates: [], searches: {} };
	try {
		const value = await readJson<PlayerResearch>(join(context.cacheDir, 'research/players', `${identity.playerId}.json`));
		// Statistical rebuilds change dataVersion without changing a player's identity or source evidence.
		if (value.schemaVersion === 1 && value.playerId === identity.playerId) record = { ...value, dataVersion: context.data.dataVersion };
	} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
	try {
		const manual = await readJson<{ dataVersion: string; playerId: string; search: SearchState }>(join(context.cacheDir, 'research/manual', `${identity.playerId}.json`));
		validateManualSearch(manual);
		if (manual.playerId === identity.playerId) record.searches.manual = manual.search;
	} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
	return record;
}
export async function writeResearch(context: ResearchContext, record: PlayerResearch): Promise<void> {
	await atomicWrite(join(context.cacheDir, 'research/players', `${record.playerId}.json`), `${canonicalJSON(record)}\n`);
}

/** Manual review runs in a separate process; its overlay cannot be overwritten by discovery. */
export async function recordManualSearch(context: ResearchContext, entry: { playerId: string; search: SearchState }): Promise<void> {
	validateManualSearch(entry);
	await atomicWrite(join(context.cacheDir, 'research/manual', `${entry.playerId}.json`), canonicalJSON({ ...entry, dataVersion: context.data.dataVersion }));
}

const updates = new Map<string, Promise<void>>();

/** Providers run independently, but updates to one player's checkpoint must preserve each other. */
export async function updateResearch(context: ResearchContext, identity: CandidateIdentity, update: (record: PlayerResearch) => void): Promise<void> {
	const key = join(context.cacheDir, 'research/players', identity.playerId);
	const operation = (updates.get(key) ?? Promise.resolve()).then(async () => {
		const record = await readResearch(context, identity);
		update(record);
		await writeResearch(context, record);
	});
	const settled = operation.then(() => {}, () => {});
	updates.set(key, settled);
	try { await operation; } finally { if (updates.get(key) === settled) updates.delete(key); }
}

export function validateManualSearch(value: unknown): asserts value is { playerId: string; search: SearchState } {
	const entry = value as { playerId?: unknown; search?: Partial<SearchState> } | null;
	const search = entry?.search;
	if (!entry || typeof entry.playerId !== 'string' || !search || !['complete', 'blocked', 'pending'].includes(String(search.status))
		|| !Array.isArray(search.queries) || !search.queries.length || search.queries.some(query => typeof query !== 'string' || !query.trim())
		|| !Array.isArray(search.evidenceUrls) || !search.evidenceUrls.length || search.evidenceUrls.some(url => typeof url !== 'string' || !/^https:\/\/\S+$/.test(url))
		|| search.attempted !== true || typeof search.updatedAt !== 'string' || !Number.isFinite(Date.parse(search.updatedAt))
		|| (search.status === 'blocked' && !search.reason?.trim())) throw new Error('Manual search records require queries, evidence URLs, time, attempted status and any blocker');
}
export function mergeCandidates(record: PlayerResearch, additions: PhotoCandidate[]): void {
	type Entry = { value: PhotoCandidate; ids: Set<string>; urls: Set<string> };
	const ids = new Map<string, Entry>(), urls = new Map<string, Entry>(), entries = new Set<Entry>();
	for (const item of [...record.candidates, ...additions]) {
		let candidate = item;
		try {
			const url = new URL(item.sourceUrl), pageId = url.searchParams.get('curid');
			if (url.hostname === 'commons.wikimedia.org' && pageId && /^[1-9][0-9]*$/.test(pageId)) candidate = { ...item, sourceId: `commons:${pageId}` };
		} catch { /* A malformed provider URL remains an unverified lead. */ }
		const key = sourceKey(candidate.sourceUrl);
		const byId = ids.get(candidate.sourceId), byUrl = urls.get(key);
		const entry = byId ?? byUrl ?? { value: candidate, ids: new Set<string>(), urls: new Set<string>() };
		if (byId && byUrl && byId !== byUrl) {
			// An original-source hit can join two previously unrelated index identities.
			for (const id of byUrl.ids) { entry.ids.add(id); ids.set(id, entry); }
			for (const url of byUrl.urls) { entry.urls.add(url); urls.set(url, entry); }
			entry.value.via = [...new Set([...entry.value.via, ...byUrl.value.via])];
			entry.value.metadata ??= byUrl.value.metadata;
			entries.delete(byUrl);
		}
		const prior = entry.value;
		// Prefer the original provider's qualified identity over a search-index identifier.
		const preferred = (prior.metadata && !candidate.metadata) || (prior.provider === 'commons' && candidate.provider === 'openverse') ? prior : candidate;
		entry.value = { ...prior, ...preferred, metadata: candidate.metadata ?? prior.metadata,
			via: [...new Set([...prior.via, ...candidate.via])].sort() };
		entry.ids.add(candidate.sourceId); entry.urls.add(key);
		ids.set(candidate.sourceId, entry); urls.set(key, entry); entries.add(entry);
	}
	record.candidates = [...entries].map(entry => entry.value).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

export function sourceKey(value: string): string {
	try {
		const url = new URL(value);
		url.protocol = 'https:'; url.hash = '';
		for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
		return `${url.host}${decodeURIComponent(url.pathname).replaceAll('_', ' ')}${url.search}`;
	} catch { return value; }
}

export function commonsCandidate(metadata: CommonsMetadata, via: string): PhotoCandidate {
	return { sourceId: metadata.sourceId ?? `commons:${metadata.pageId}`, provider: 'commons', title: metadata.title, sourceUrl: metadata.sourceUrl, metadata, via: [via] };
}

/** Read all valid historical responses, including files rejected by publication rules. */
export async function cachedCandidates(context: ResearchContext): Promise<Map<string, PhotoCandidate[]>> {
	const metadata = await cachedCommonsMetadata(context.cacheDir);
	const wikidata: WikidataMedia = { identities: [], photos: [], categories: [] };
	const categoryFiles = new Map<string, Set<string>>(), children = new Map<string, Set<string>>();
	for (const namespace of ['wikidata', 'categories']) {
		const directory = join(context.cacheDir, namespace);
		let files: string[];
		try { files = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
		for (const file of files.filter(file => file.endsWith('.json')).sort()) {
			const envelope = await readJson<{ request: string; checksum: string; payload: Record<string, any> }>(join(directory, file));
			if (!envelope.payload || digest(canonicalJSON(envelope.payload)) !== envelope.checksum) continue;
			if (namespace === 'wikidata') {
				for (const binding of envelope.payload.results?.bindings ?? []) {
					const bbrefId = binding.bbref?.value, entityId = binding.item?.value?.match(/\/(Q\d+)$/)?.[1];
					if (!bbrefId || !entityId) continue;
					wikidata.identities.push({ bbrefId, entityId });
					if (binding.image?.value) wikidata.photos.push({ bbrefId, entityId, title: decodeURIComponent(binding.image.value.split('/Special:FilePath/')[1] ?? '').replaceAll('_', ' ') });
					if (binding.category?.value) wikidata.categories.push({ bbrefId, entityId, title: binding.category.value });
				}
			} else {
				const parts = envelope.request.split(':');
				if (parts[0] !== 'category-v2') continue;
				const title = parts.slice(2, -2).join(':');
				for (const member of envelope.payload.query?.categorymembers ?? []) {
					const target = member.ns === 6 ? categoryFiles : member.ns === 14 ? children : null;
					if (!target || !member.title) continue;
					const entries = target.get(title) ?? new Set<string>();
					entries.add(member.title.replace(/^(File|Category):/, '')); target.set(title, entries);
				}
			}
		}
	}
	const grouped = groupVerifiedWikidataMedia(context.identities.filter(identity => identity.bbrefId), wikidata.photos, wikidata.categories, emptyExclusions(), wikidata.identities);
	const entityIds = new Map<string, Set<string>>();
	for (const item of wikidata.identities) { const ids = entityIds.get(item.bbrefId) ?? new Set<string>(); ids.add(item.entityId); entityIds.set(item.bbrefId, ids); }
	for (const identity of context.identities) {
		const ids = entityIds.get(identity.bbrefId); if (ids?.size === 1) identity.wikidataId = [...ids][0];
		identity.commonsCategories = [...new Set((grouped.categories.get(identity.playerId) ?? []).map(category => category.title))];
	}
	const names = new Map<string, Set<string>>();
	for (const identity of context.identities) for (const alias of context.aliases.get(identity.playerId) ?? []) {
		const name = normalizedName(alias), set = names.get(name) ?? new Set<string>(); set.add(identity.playerId); names.set(name, set);
	}
	const nameMatches = new Map<string, CommonsMetadata[]>();
	// Names only nominate candidates. No identity or license approval is inferred from text matching.
	for (const item of new Map([...metadata.values()].map(item => [item.pageId, item])).values()) {
		const title = normalizedName(item.title), words = title.split(' ');
		for (let start = 0; start < words.length; start++) for (let length = 2; length <= Math.min(5, words.length - start); length++) {
			for (const id of names.get(words.slice(start, start + length).join(' ')) ?? []) {
				const matches = nameMatches.get(id) ?? []; matches.push(item); nameMatches.set(id, matches);
			}
		}
	}
	const results = new Map<string, PhotoCandidate[]>();
	for (const identity of context.identities) {
		const titles = new Set((grouped.photos.get(identity.playerId) ?? []).map(photo => photo.title));
		const queue = (grouped.categories.get(identity.playerId) ?? []).map(category => category.title);
		const visited = new Set<string>();
		while (queue.length) {
			const category = queue.shift()!;
			if (visited.has(category)) continue;
			visited.add(category);
			for (const title of categoryFiles.get(category) ?? []) titles.add(title);
			for (const child of children.get(category) ?? []) {
				if (normalizedName(child).includes(normalizedName(identity.name))) queue.push(child);
			}
		}
		const candidates = [...titles].flatMap(title => metadata.has(title) ? [commonsCandidate(metadata.get(title)!, 'cached identity/category')] : []);
		candidates.push(...(nameMatches.get(identity.playerId) ?? []).map(item => commonsCandidate(item, 'cached name search')));
		results.set(identity.playerId, candidates);
	}
	return results;
}
