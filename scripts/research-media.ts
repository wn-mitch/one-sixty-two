import { join } from 'node:path';
import { atomicWrite, digest } from './media/cache.ts';
import { canonicalJSON } from './data/compile.ts';
import { photoTier } from '../src/lib/media/photo-policy.ts';
import { selectPhoto } from '../src/lib/media/client.ts';
import { auditMedia } from './media/audit.ts';
import { DiscoveryAccess, discoverCommonsCollection, searchCommonsBatch, searchLoc, searchOpenverse } from './media/discovery-providers.ts';
import { cachedCandidates, candidateMatchesPlayer, discoveryStrategy, mergeCandidates, normalizedName, readJson, readResearch, recordManualSearch, researchContext, searchComplete, updateResearch, validateManualSearch, writeResearch } from './media/research.ts';
import type { PhotoCandidate, ResearchProvider, SearchState } from './media/research.ts';
import type { CandidateIdentity } from './media/types.ts';
import { acquireCommonsMetadata } from './media/providers.ts';

const [command, ...args] = process.argv.slice(2);
const allowed = /^(?:--(?:offline|refresh|missing-only)|--(?:providers|player|limit|requests|collection|record)=.+)$/;
if (!['discover', 'audit', 'record'].includes(command) || args.some(arg => !allowed.test(arg))) throw new Error('Usage: research-media.ts discover|audit|record [--offline] [--refresh] [--missing-only] [--providers=cached,commons,openverse,loc] [--player=id] [--limit=N] [--requests=N] [--collection=Commons category] [--record=JSON file]');
const option = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const positive = (name: string) => { const raw = option(name); if (raw === undefined) return Infinity; const n = Number(raw); if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Invalid --${name}`); return n; };
const context = await researchContext(process.cwd());
if (command === 'record') {
	if (!option('record')) throw new Error('Provide --record=JSON file with targeted manual search records');
	const entries = await readJson<unknown>(option('record')!);
	if (!Array.isArray(entries)) throw new Error('Manual search records must be an array');
	// Validate the entire input before changing any checkpoint.
	for (const entry of entries) {
		validateManualSearch(entry);
		if (!context.identities.some(identity => identity.playerId === entry.playerId)) throw new Error(`Unknown player in manual search: ${entry.playerId}`);
	}
	for (const entry of entries) {
		validateManualSearch(entry);
		await recordManualSearch(context, entry);
	}
	console.log(`[research] Recorded ${entries.length} targeted manual searches; no image approvals changed`);
	process.exit(0);
}
if (command === 'audit') {
	const summary = await auditMedia(context);
	console.log(JSON.stringify(summary, null, 2));
	process.exit(0);
}
const providers = (option('providers') ?? 'cached,commons,openverse,loc').split(',') as ResearchProvider[];
if (providers.some(provider => !['cached', 'commons', 'openverse', 'loc'].includes(provider))) throw new Error('Unknown discovery provider');
const requestedPlayer = option('player');
if (requestedPlayer && !context.identities.some(identity => identity.playerId === requestedPlayer)) throw new Error('Player is not in the selectable pool');
const access = new DiscoveryAccess({ cacheDir: context.cacheDir, offline: args.includes('--offline'), refresh: args.includes('--refresh'), requestLimit: positive('requests') });
console.log('[research] Indexing cached identities and candidate metadata');
const cached = await cachedCandidates(context);
const selections = new Map<string, typeof context.data.candidates>();
for (const candidate of context.data.candidates.filter(candidate => !candidate.eligibleSlots?.includes('BP'))) {
	const list = selections.get(candidate.playerId) ?? []; list.push(candidate); selections.set(candidate.playerId, list);
}
const priority = (identity: CandidateIdentity) => {
	const candidates = selections.get(identity.playerId) ?? [];
	let missing = 0, upgrades = 0;
	for (const candidate of candidates) {
		const year = Number(candidate.seasonId?.split(':')[1]);
		const photo = selectPhoto(context.media, identity.playerId, year, candidate.franchiseId);
		if (!photo) missing++;
		else if (photoTier(photo, year) > 0) upgrades++;
	}
	return { missing, upgrades };
};
const priorities = new Map(context.identities.map(identity => [identity.playerId, priority(identity)]));
const identities = context.identities.filter(identity => (!requestedPlayer || identity.playerId === requestedPlayer) && (!args.includes('--missing-only') || priorities.get(identity.playerId)!.missing))
	.sort((a, b) => {
		const pa = priorities.get(a.playerId)!, pb = priorities.get(b.playerId)!;
		return pb.missing - pa.missing || pb.upgrades - pa.upgrades || a.playerId.localeCompare(b.playerId);
	}).slice(0, positive('limit'));

const collection = option('collection');
if (collection) {
	const matchedNames = new Map<string, string[]>();
	for (const identity of identities) matchedNames.set(identity.playerId, (context.aliases.get(identity.playerId) ?? [identity.name]).map(normalizedName));
	const checkpoint = join(context.cacheDir, 'research/collections', `${digest(collection)}.json`);
	const visitedQueries: string[] = [];
	await atomicWrite(checkpoint, canonicalJSON({ collection, status: 'pending', queries: visitedQueries }));
	try { await discoverCommonsCollection(access, collection, async (candidates, query) => {
		visitedQueries.push(query);
		for (const identity of identities) {
			const matching = candidates.filter(candidate => matchedNames.get(identity.playerId)!.some(name => ` ${normalizedName(candidate.title)} `.includes(` ${name} `)));
			if (!matching.length) continue;
			const metadata = await acquireCommonsMetadata(matching.map(candidate => candidate.title), context.cacheDir, args.includes('--offline'), () => {});
			for (const candidate of matching) candidate.metadata = metadata.get(candidate.title);
			const record = await readResearch(context, identity);
			mergeCandidates(record, matching); await writeResearch(context, record);
		}
		console.log(`[research] Collection ${query}: ${candidates.length} files`);
		await atomicWrite(checkpoint, canonicalJSON({ collection, status: 'pending', queries: visitedQueries }));
	});
		await atomicWrite(checkpoint, canonicalJSON({ collection, status: 'complete', queries: visitedQueries }));
	} catch (error) {
		await atomicWrite(checkpoint, canonicalJSON({ collection, status: 'blocked', queries: visitedQueries, reason: error instanceof Error ? error.message : String(error) }));
		throw error;
	}
}

// Finish cached discovery for the entire pool before any service can block online research.
if (providers.includes('cached')) {
	for (const identity of identities) {
		const record = await readResearch(context, identity);
		mergeCandidates(record, cached.get(identity.playerId) ?? []);
		record.searches.cached = { status: 'complete', attempted: true, updatedAt: new Date().toISOString(), queries: ['Verified cached Wikidata, Commons categories, and names'] };
		await writeResearch(context, record);
	}
	console.log(`[research] Cached discovery complete for ${identities.length} players`);
}
await Promise.all([...new Set(providers.filter(provider => provider !== 'cached'))].map(async provider => {
	const strategy = discoveryStrategy(provider);
	let completed = 0, blocked = 0, skipped = 0;
	const pending = [];
	for (const identity of identities) {
		const record = await readResearch(context, identity);
		if (searchComplete(provider, record.searches[provider]) && !args.includes('--refresh')) skipped++;
		else pending.push(identity);
	}
	const batchSize = provider === 'commons' ? 12 : 1;
	for (let start = 0; start < pending.length; start += batchSize) {
		const batch = pending.slice(start, start + batchSize);
		const queries: string[] = [];
		const onPage = async (candidates: PhotoCandidate[], query: string) => {
			if (!queries.includes(query)) queries.push(query);
			for (const identity of batch) {
				const names = context.aliases.get(identity.playerId) ?? [identity.name];
				const matching = provider !== 'commons' ? candidates : candidates.filter(candidate => candidateMatchesPlayer(candidate, query, identity, names));
				await updateResearch(context, identity, record => {
					mergeCandidates(record, matching);
					record.searches[provider] = { status: 'pending', strategy, attempted: true, updatedAt: new Date().toISOString(), queries: [...queries] };
				});
			}
		};
		const globalBlock = access.blockReason(provider);
		let state: SearchState;
		try {
			if (globalBlock) throw new Error(globalBlock);
			const identity = batch[0];
			const aliases = context.aliases.get(identity.playerId) ?? [identity.name];
			if (provider === 'commons') await searchCommonsBatch(access, batch, context.aliases, onPage);
			else if (provider === 'openverse') await searchOpenverse(access, aliases, onPage);
			else if (provider === 'loc') await searchLoc(access, aliases, onPage);
			state = { status: 'complete', strategy, attempted: true, updatedAt: new Date().toISOString(), queries }; completed += batch.length;
		} catch (error) {
			const reason = error instanceof Error ? `${error.message}${error.cause instanceof Error ? `: ${error.cause.message}` : ''}` : String(error);
			state = { status: 'blocked', strategy, attempted: !globalBlock, updatedAt: new Date().toISOString(), queries, reason }; blocked += batch.length;
			if (!globalBlock) console.log(`[research] ${provider} ${batch[0].playerId}: ${reason}`);
			if (/Configured request limit/.test(reason)) access.block(provider, reason);
		}
		for (const identity of batch) await updateResearch(context, identity, record => { record.searches[provider] = state; });
		if (start % (batchSize * 10) === 0) console.log(`[research] ${provider}: ${completed} complete, ${blocked} blocked, ${skipped} reused`);
	}
	console.log(`[research] ${provider}: ${completed} complete, ${blocked} blocked, ${skipped} reused`);
}));
const pointerPath = join(context.cacheDir, 'audit/baseline-pointer.json');
await readJson(pointerPath).catch(async error => {
	if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	await atomicWrite(pointerPath, `${canonicalJSON({ schemaVersion: context.media.schemaVersion, version: context.media.version, manifestUrl: `/media/${context.media.version}/manifest.json` })}\n`);
});
console.log(`[research] Reports: ${join(context.cacheDir, 'audit')}`);
await auditMedia(context);
