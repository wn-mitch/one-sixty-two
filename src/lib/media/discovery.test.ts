import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiscoveryAccess, discoverCommonsCollection, searchCommons, searchCommonsBatch, searchLoc, searchOpenverse } from '../../../scripts/media/discovery-providers.ts';
import { digest, fetchCachedJson } from '../../../scripts/media/cache.ts';
import { candidateBlockers } from '../../../scripts/media/audit.ts';
import { metadataFromCommonsPage } from '../../../scripts/media/providers.ts';
import { candidateMatchesPlayer, candidateRelevance, discoveryStrategy, isLegacyCandidate, mergeCandidates, readAcquisitions, readResearch, recordAcquisition, recordManualSearch, searchComplete, updateResearch, validateManualSearch, writeResearch } from '../../../scripts/media/research.ts';
import type { PlayerPhoto } from './types';
import type { PhotoCandidate, PlayerResearch, ResearchContext } from '../../../scripts/media/research.ts';
import type { ApprovedPhotoReview } from '../../../scripts/media/types.ts';

let cacheDir: string;
const identity = { playerId: 'synthetic01', bbrefId: 's/synthetic01', name: 'Example Athlete', firstYear: 1990, lastYear: 2000 };
const page = (id: number) => ({ pageid: id, title: `File:Example Athlete ${id}.jpg`, imageinfo: [{ width: 300, height: 350, mime: 'image/jpeg', url: `https://example.invalid/${id}.jpg`, extmetadata: {
	Artist: { value: 'Example photographer' }, LicenseShortName: { value: 'CC BY 4.0' }, DateTimeOriginal: { value: 'Uploaded in 2025' }
} }] });
const access = (offline = false) => new DiscoveryAccess({ cacheDir, offline, refresh: false });
const empty = (): PlayerResearch => ({ schemaVersion: 1, playerId: identity.playerId, name: identity.name, dataVersion: 'synthetic-data', candidates: [], searches: {} });

beforeEach(async () => { cacheDir = await mkdtemp(join(tmpdir(), 'media-discovery-')); });
afterEach(async () => { vi.unstubAllGlobals(); await rm(cacheDir, { recursive: true, force: true }); });

describe('explicit discovery and checkpoints', () => {
	it('audits published legacy identities instead of substituting unrelated or already classified sources', () => {
		const candidate: PhotoCandidate = { sourceId: 'commons:1', provider: 'commons', title: identity.name, sourceUrl: 'https://example.invalid/Example_Athlete.jpg', via: [] };
		const photo = { sourceId: 'commons:1', sourceUrl: candidate.sourceUrl, review: 'legacy' } as PlayerPhoto;
		expect(isLegacyCandidate(candidate, [photo])).toBe(true);
		expect(isLegacyCandidate({ ...candidate, sourceId: 'commons:2', sourceUrl: 'https://example.invalid/new.jpg' }, [photo])).toBe(false);
		expect(isLegacyCandidate(candidate, [{ ...photo, review: 'approved' }])).toBe(false);
		expect(isLegacyCandidate(candidate, [{ ...photo, sourceId: undefined, sourceUrl: 'https://example.invalid/Example%20Athlete.jpg' }])).toBe(true);
		expect(isLegacyCandidate({ ...candidate, sourceUrl: 'https://commons.wikimedia.org/?curid=1',
			metadata: { ...metadataFromCommonsPage(page(1))!, sourceUrl: candidate.sourceUrl } }, [{ ...photo, sourceId: undefined }])).toBe(true);
	});
	it('keeps manual research after a stale discovery writer and requires the current search strategy', async () => {
		const context = { cacheDir, data: { dataVersion: 'synthetic-data' } } as ResearchContext;
		const stale = await readResearch(context, identity);
		const search = { status: 'complete' as const, attempted: true, updatedAt: '2026-01-01', queries: ['Example Athlete archive'], evidenceUrls: ['https://example.invalid/archive'] };
		await recordManualSearch(context, { playerId: identity.playerId, search });
		await writeResearch(context, stale);
		expect((await readResearch(context, identity)).searches.manual).toEqual(search);
		expect(searchComplete('commons', search)).toBe(false);
		expect(searchComplete('commons', { ...search, strategy: discoveryStrategy('commons') })).toBe(true);
		expect(searchComplete('manual', search)).toBe(true);
		expect((await readResearch({ ...context, data: { dataVersion: 'next' } } as ResearchContext, identity)).searches.manual).toEqual(search);
	});
	it('retains source evidence and unfinished searches across statistical rebuilds', async () => {
		const context = { cacheDir, data: { dataVersion: 'synthetic-data' } } as ResearchContext;
		const record = empty();
		record.candidates = [{ sourceId: 'commons:1', provider: 'commons', title: identity.name, sourceUrl: 'https://example.invalid/portrait', via: ['original search'] }];
		record.searches.commons = { status: 'pending', queries: ['unfinished page'], attempted: true, updatedAt: '2026-01-01' };
		await writeResearch(context, record);
		const rebuilt = await readResearch({ ...context, data: { dataVersion: 'next' } } as ResearchContext, identity);
		expect(rebuilt).toEqual({ ...record, dataVersion: 'next' });
		expect((await readResearch(context, { ...identity, playerId: 'other01' })).candidates).toEqual([]);
	});
	it('preserves independent provider pages arriving together and recovers after a failed update', async () => {
		const context = { cacheDir, data: { dataVersion: 'synthetic-data' } } as ResearchContext;
		const providers = ['commons', 'openverse', 'loc'] as const;
		await Promise.all(providers.map(provider => updateResearch(context, identity, record => {
			record.searches[provider] = { status: 'complete', queries: [provider], attempted: true, updatedAt: '2026-01-01' };
			mergeCandidates(record, [{ sourceId: `${provider}:1`, provider, title: identity.name, sourceUrl: `https://example.invalid/${provider}`, via: [provider] }]);
		})));
		const record = await readResearch(context, identity);
		expect(Object.keys(record.searches).sort()).toEqual([...providers].sort());
		expect(record.candidates).toHaveLength(3);
		await expect(updateResearch(context, identity, () => { throw new Error('Interrupted'); })).rejects.toThrow('Interrupted');
		await updateResearch(context, identity, value => { value.searches.commons!.status = 'pending'; });
		expect((await readResearch(context, identity)).searches.commons?.status).toBe('pending');
	});
	it('requires evidence for completed manual searches and reasons for external blockers', () => {
		const entry = { playerId: identity.playerId, search: { status: 'complete', attempted: true, updatedAt: '2026-01-01', queries: ['Example Athlete baseball photograph'], evidenceUrls: ['https://example.invalid/archive/search'] } };
		expect(() => validateManualSearch(entry)).not.toThrow();
		expect(() => validateManualSearch({ ...entry, search: { ...entry.search, evidenceUrls: [] } })).toThrow('evidence');
		expect(() => validateManualSearch({ ...entry, search: { ...entry.search, status: 'blocked' } })).toThrow('blocker');
	});
	it('reads all Commons pages, deduplicates leads and reproduces the same queue offline', async () => {
		const requests: URL[] = [];
		vi.stubGlobal('fetch', vi.fn(async (input: string) => {
			const url = new URL(input); requests.push(url);
			return Response.json(url.searchParams.has('gsroffset') ? { batchcomplete: true, query: { pages: [page(1), page(2)] } }
				: { continue: { continue: '-||', gsroffset: 50 }, query: { pages: [page(1)] } });
		}));
		const record = empty();
		await searchCommons(access(), identity, [identity.name], async candidates => mergeCandidates(record, candidates));
		expect(requests).toHaveLength(2); expect(record.candidates.map(c => c.sourceId)).toEqual(['commons:1', 'commons:2']);
		expect(candidateBlockers(record.candidates[0])).toContain('unreviewed identity, uniform, context and crop');
		vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected offline request'); }));
		const replay = empty(); await searchCommons(access(true), identity, [identity.name], async candidates => mergeCandidates(replay, candidates));
		expect(replay).toEqual(record);
	});
	it('rejects repeated continuation tokens instead of reporting an exhaustive empty search', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ continue: { continue: '-||', gsroffset: 50 }, query: { pages: [] } })));
		await expect(searchCommons(access(), identity, [identity.name], async () => {})).rejects.toThrow('repeated');
	});
	it('retains pagination and offline replay when a document thumbnail fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async (input: string) => {
			const params = new URL(input).searchParams;
			if (params.has('gsroffset')) return Response.json({ batchcomplete: true, query: { pages: [page(2)] } });
			if (params.has('iiurlwidth')) return Response.json({ error: { code: 'urlparamnormal', info: 'Document thumbnail unavailable' } });
			return Response.json({ continue: { continue: '-||', gsroffset: 50 }, query: { pages: [page(1)] } });
		}));
		const record = empty();
		await searchCommons(access(), identity, [identity.name], async candidates => mergeCandidates(record, candidates));
		expect(record.candidates.map(c => c.sourceId)).toEqual(['commons:1', 'commons:2']);
		vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected offline request'); }));
		const replay = empty();
		await searchCommons(access(true), identity, [identity.name], async candidates => mergeCandidates(replay, candidates));
		expect(replay).toEqual(record);
	});
	it('surfaces provider query warnings and keeps interrupted state resumable', async () => {
		const context = { cacheDir, data: { dataVersion: 'synthetic-data' } } as ResearchContext;
		const record = empty(); record.searches.commons = { status: 'pending', queries: ['name'], attempted: true, updatedAt: '2026-01-01' };
		await writeResearch(context, record); expect(await readResearch(context, identity)).toEqual(record);
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ warnings: { search: 'Too many terms' }, batchcomplete: true })));
		await expect(searchCommons(access(), identity, [identity.name], async () => {})).rejects.toThrow('truncated');
		expect((await readResearch(context, identity)).searches.commons?.status).toBe('pending');
	});
	it('bounds batched name and structured-subject queries and removes duplicate normalized aliases', async () => {
		const queries: string[] = [];
		vi.stubGlobal('fetch', vi.fn(async (url: string) => { queries.push(new URL(url).searchParams.get('gsrsearch')!); return Response.json({ batchcomplete: true }); }));
		const identities = Array.from({ length: 9 }, (_, i) => ({ ...identity, playerId: `synthetic${i}`, name: `Example Athlete ${i}`, wikidataId: `Q${i + 1}` }));
		await searchCommonsBatch(access(), identities, new Map(identities.map(p => [p.playerId, [p.name, p.name.toLowerCase()]])), async () => {});
		expect(queries).toHaveLength(11); expect(queries.every(query => query.split(' OR ').length <= 8)).toBe(true);
		expect(queries.filter(query => query.startsWith('haswbstatement:')).every(query => !query.includes(' OR '))).toBe(true);
	}, 20_000);
	it('routes unnamed structured hits only to their actual subject, including single-player batches', () => {
		const athlete = { ...identity, wikidataId: 'Q123' };
		const candidate: PhotoCandidate = { sourceId: 'commons:1', provider: 'commons', title: 'Camera frame.jpg', sourceUrl: 'https://example.invalid/file', via: [] };
		expect(candidateMatchesPlayer(candidate, 'haswbstatement:P180=Q123', athlete, [athlete.name])).toBe(true);
		expect(candidateMatchesPlayer(candidate, 'haswbstatement:P180=Q999', athlete, [athlete.name])).toBe(false);
		expect(candidateMatchesPlayer(candidate, 'haswbstatement:P180=Q123 OR haswbstatement:P180=Q999', athlete, [athlete.name])).toBe(false);
		expect(candidateMatchesPlayer(candidate, 'Player category someoneelse: Training day', athlete, [athlete.name])).toBe(false);
	});
	it('puts baseball subjects ahead of a namesake landscape and keeps ambiguous leads unapproved', () => {
		const lead = (title: string, description: string): PhotoCandidate => ({ sourceId: 'commons:1', provider: 'commons', title, sourceUrl: 'https://example.invalid/file', via: [],
			metadata: { ...metadataFromCommonsPage(page(1))!, title, description, categories: [] } });
		const landscape = lead('Example Athlete hill.jpg', 'Landscape photographed by Example Athlete');
		const portrait = lead('Camera frame.jpg', 'Baseball pitcher Example Athlete warming up');
		const unrelated = lead('Other Athlete.jpg', 'Baseball pitcher Other Athlete warming up');
		expect(candidateRelevance(portrait, identity, [identity.name])).toBeGreaterThan(candidateRelevance(landscape, identity, [identity.name]));
		expect(candidateRelevance(unrelated, identity, [identity.name])).toBeLessThan(2);
		expect(candidateBlockers(portrait)).toContain('unreviewed identity, uniform, context and crop');
		expect(candidateMatchesPlayer(lead('Example Athleteson.jpg', ''), '', identity, [identity.name])).toBe(false);
	});
	it('traverses collections with cycle detection without treating membership as approval', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json({ query: { categorymembers: new URL(url).searchParams.get('cmtitle') === 'Category:Collection'
			? [{ ns: 14, title: 'Category:Child', pageid: 10 }] : [{ ns: 14, title: 'Category:Collection', pageid: 11 }, { ns: 6, title: 'File:Example Athlete.jpg', pageid: 1 }] } })));
		const leads: PhotoCandidate[] = []; await discoverCommonsCollection(access(), 'Collection', async candidates => { leads.push(...candidates); });
		expect(leads).toHaveLength(1); expect(candidateBlockers(leads[0])).toContain('original-source rights and image acquisition unverified');
		await expect(discoverCommonsCollection(access(true), 'Collection', async () => {}, 1)).rejects.toThrow('have not been searched');
	});
	it('follows verified player subcategories even when image filenames do not name the player', async () => {
		vi.stubGlobal('fetch', vi.fn(async (input: string) => {
			const params = new URL(input).searchParams;
			if (params.has('gsrsearch')) return Response.json({ batchcomplete: true });
			if (params.get('cmtitle') === 'Category:Example Athlete') return Response.json({ query: { categorymembers: [{ ns: 14, pageid: 2, title: 'Category:Training day' }] } });
			if (params.get('cmtitle') === 'Category:Training day') return Response.json({ query: { categorymembers: [{ ns: 6, pageid: 3, title: 'File:Camera frame 3.jpg' }] } });
			return Response.json({ query: { pages: [{ ...page(3), title: 'File:Camera frame 3.jpg' }] } });
		}));
		const found: PhotoCandidate[] = [], queries: string[] = [];
		await searchCommonsBatch(access(), [{ ...identity, commonsCategories: ['Example Athlete'] }], new Map([[identity.playerId, [identity.name]]]), async (items, query) => { found.push(...items); queries.push(query); });
		expect(found).toHaveLength(1); expect(found[0].metadata?.title).toBe('Camera frame 3.jpg');
		expect(queries).toContain('Player category synthetic01: Training day');
		expect(candidateBlockers(found[0])).toContain('unreviewed identity, uniform, context and crop');
	});
});

describe('provider failures and original-source verification', () => {
	it('keeps acquisition failures visible until a successful retry without changing discovery progress', async () => {
		const candidate: PhotoCandidate = { sourceId: 'archive:1', provider: 'manual', title: 'Example Athlete', sourceUrl: 'https://example.invalid/source', via: [] };
		const failed = { playerId: identity.playerId, sourceId: candidate.sourceId, status: 'failed' as const, reason: 'HTTP 503', updatedAt: '2026-01-01' };
		await recordAcquisition(cacheDir, failed);
		expect(candidateBlockers(candidate, undefined, (await readAcquisitions(cacheDir, identity.playerId)).get(candidate.sourceId))).toContain('acquisition failure: HTTP 503');
		await recordAcquisition(cacheDir, { ...failed, status: 'acquired', reason: undefined });
		expect(candidateBlockers(candidate, undefined, (await readAcquisitions(cacheDir, identity.playerId)).get(candidate.sourceId))).not.toContain('acquisition failure: HTTP 503');
		expect(await readAcquisitions(cacheDir, 'other-identity')).toEqual(new Map());
		const approval = { status: 'approved' } as ApprovedPhotoReview;
		expect(candidateBlockers(candidate, approval, failed)).toEqual(['approved image awaiting compilation', 'acquisition failure: HTTP 503']);
		expect(candidateBlockers(candidate, approval, failed, true)).toEqual([]);
	});
	it('records Openverse as leads only and rejects incomplete pagination', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url: string) => {
			expect(Number(new URL(url).searchParams.get('page_size'))).toBeLessThanOrEqual(20);
			return Response.json({ page: 1, page_count: 1, results: [{ id: 'index1', title: 'Example Athlete', foreign_landing_url: 'https://example.invalid/original', license: 'by', license_version: '4.0' }] });
		}));
		const leads: PhotoCandidate[] = []; await searchOpenverse(access(), [identity.name], async candidates => { leads.push(...candidates); });
		expect(leads[0].metadata).toBeUndefined(); expect(leads[0].via.join(' ')).toContain('original-source verification required');
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ page: 1, page_count: 2, results: [] })));
		await expect(searchOpenverse(new DiscoveryAccess({ cacheDir, offline: false, refresh: true }), [identity.name], async () => {})).rejects.toThrow('incomplete pagination');
	});
	it('detects an incomplete LOC page rather than declaring no candidate found', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [], pagination: { total: 2, next: 'next-page' } })));
		await expect(searchLoc(access(), [identity.name], async () => {})).rejects.toThrow('incomplete pagination');
	});
	it('stops service-wide authentication failures after one request', async () => {
		const fetch = vi.fn(async () => new Response(null, { status: 401 })); vi.stubGlobal('fetch', fetch);
		const provider = access();
		await expect(searchOpenverse(provider, [identity.name], async () => {})).rejects.toThrow('401');
		await expect(searchOpenverse(provider, ['Different Athlete'], async () => {})).rejects.toThrow('401');
		expect(fetch).toHaveBeenCalledTimes(1); expect(provider.blockReason('openverse')).toContain('401');
	});
	it('distinguishes offline misses and bounded runs from completed no-result searches', async () => {
		await expect(searchCommons(access(true), identity, [identity.name], async () => {})).rejects.toThrow('Offline snapshot missing');
		await expect(searchCommons(new DiscoveryAccess({ cacheDir, offline: false, refresh: false, requestLimit: 0 }), identity, [identity.name], async () => {})).rejects.toThrow('request limit');
	});
	it('deduplicates original-source URLs across indexes without sharing identity decisions between namesakes', () => {
		const record = empty(); const original: PhotoCandidate = { sourceId: 'commons:1', provider: 'commons', title: 'Example Athlete', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example_Athlete.jpg', via: ['name'] };
		mergeCandidates(record, [original, { ...original, sourceId: 'openverse:2', provider: 'openverse', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example%20Athlete.jpg?utm_source=index', via: ['index'] }]);
		expect(record.candidates).toHaveLength(1); expect(record.candidates[0].via).toEqual(['index', 'name']);
		expect(record.candidates[0].sourceId).toBe('commons:1');
		mergeCandidates(record, [{ ...original, sourceId: 'openverse:3', provider: 'openverse', sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=1', via: ['alternate URL'] }]);
		expect(record.candidates).toHaveLength(1); expect(record.candidates[0].sourceId).toBe('commons:1');
		expect(candidateBlockers(record.candidates[0])).toContain('unreviewed identity, uniform, context and crop');
		const other = { ...empty(), playerId: 'namesake02' }; expect(other.candidates).toEqual([]);
	});
	it('joins bridged index identities and retains their alternate source URLs', () => {
		const record = empty();
		const lead = (sourceId: string, sourceUrl: string, via: string): PhotoCandidate => ({ sourceId, sourceUrl, provider: sourceId.startsWith('commons:') ? 'commons' : 'openverse', title: identity.name, via: [via] });
		mergeCandidates(record, [
			lead('openverse:1', 'https://example.invalid/a', 'index A'),
			lead('openverse:2', 'https://example.invalid/b', 'index B'),
			lead('commons:3', 'https://example.invalid/a', 'original A'),
			lead('commons:3', 'https://example.invalid/b', 'original B'),
			lead('openverse:1', 'https://example.invalid/c', 'alternate'),
			lead('openverse:4', 'https://example.invalid/b', 'repeat')
		]);
		expect(record.candidates).toHaveLength(1);
		expect(record.candidates[0].sourceId).toBe('commons:3');
		expect(record.candidates[0].via).toEqual(['alternate', 'index A', 'index B', 'original A', 'original B', 'repeat']);
	});
	it('refreshes metadata explicitly, detects corruption and replays the replacement offline', async () => {
		let revision = 1; const fetch = vi.fn(async () => Response.json({ revision })); vi.stubGlobal('fetch', fetch);
		const get = (offline: boolean, refresh = false) => fetchCachedJson<{ revision: number }>(cacheDir, 'test', 'same-query', 'https://example.invalid/api', offline, value => !!value.revision, undefined, refresh);
		expect(await get(false)).toEqual({ revision: 1 }); revision = 2;
		expect(await get(false)).toEqual({ revision: 1 }); expect(await get(false, true)).toEqual({ revision: 2 });
		expect(await get(true, true)).toEqual({ revision: 2 }); expect(fetch).toHaveBeenCalledTimes(2);
		const path = join(cacheDir, 'test', `${digest('same-query')}.json`); const corrupted = JSON.parse(await readFile(path, 'utf8')); corrupted.payload.revision = 3; await writeFile(path, JSON.stringify(corrupted));
		await expect(get(true)).rejects.toThrow('requires cached');
	});
});
