import { fetchCachedJson } from './cache.ts';
import { compareText, stripMarkup } from './logic.ts';
import type { CommonsCategorySource, CommonsMetadata, WikidataCategory, WikidataIdentity, WikidataMedia, WikidataPhoto } from './types.ts';

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

interface SparqlResponse {
	results?: {
		bindings?: Array<{
			bbref?: { value?: string };
			item?: { value?: string };
			image?: { value?: string };
			category?: { value?: string };
		}>;
	};
}

interface MetadataValue {
	value?: string;
}

interface CommonsResponse {
	query?: {
		normalized?: Array<{ from: string; to: string }>;
		redirects?: Array<{ from: string; to: string }>;
		pages?: Array<{
			pageid?: number;
			title?: string;
			missing?: boolean;
			imageinfo?: Array<{
				width?: number;
				height?: number;
				mime?: string;
				url?: string;
				thumburl?: string;
				thumbwidth?: number;
				thumbheight?: number;
				extmetadata?: Record<string, MetadataValue>;
			}>;
		}>;
	};
}
interface CategoryMember {
	pageid?: number;
	ns?: number;
	title?: string;
}

interface CategoryResponse {
	continue?: { continue?: string; cmcontinue?: string };
	query?: { categorymembers?: CategoryMember[] };
}


function batches<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
	return result;
}

function commonsTitleFromImageUrl(value: string): string | null {
	try {
		const url = new URL(value);
		const marker = '/wiki/Special:FilePath/';
		const offset = url.pathname.indexOf(marker);
		if (offset === -1) return null;
		return decodeURIComponent(url.pathname.slice(offset + marker.length)).replaceAll('_', ' ').trim() || null;
	} catch {
		return null;
	}
}

function cleanUrl(value: string): string {
	const url = new URL(value.replace(/^http:/, 'https:'));
	url.search = '';
	return url.toString();
}

export async function acquireWikidataMedia(
	bbrefIds: string[],
	cacheDir: string,
	offline: boolean,
	onProgress: (completed: number, total: number) => void
): Promise<WikidataMedia> {
	const groups = batches([...new Set(bbrefIds)].sort(compareText), 100);
	const photos: WikidataPhoto[] = [];
	const identities: WikidataIdentity[] = [];
	const categories: WikidataCategory[] = [];
	let completed = 0;
	for (const group of groups) {
		const values = group.map((id) => JSON.stringify(id)).join(' ');
		const query = `SELECT ?bbref ?item ?image ?category WHERE { VALUES ?bbref { ${values} } ?item wdt:P1825 ?bbref. OPTIONAL { ?item wdt:P18 ?image. } OPTIONAL { ?item wdt:P373 ?category. } }`;
		const url = new URL(WIKIDATA_ENDPOINT);
		url.searchParams.set('query', query);
		url.searchParams.set('format', 'json');
		const response = await fetchCachedJson<SparqlResponse>(
			cacheDir,
			'wikidata',
			query,
			url.toString(),
			offline,
			(payload) => Array.isArray(payload.results?.bindings)
		);
		for (const binding of response.results?.bindings ?? []) {
			const bbrefId = binding.bbref?.value;
			const entityUrl = binding.item?.value;
			const entityId = entityUrl?.match(/\/entity\/(Q\d+)$/)?.[1];
			if (!bbrefId || !entityId) continue;
			identities.push({ bbrefId, entityId });
			const imageUrl = binding.image?.value;
			const title = imageUrl ? commonsTitleFromImageUrl(imageUrl) : null;
			if (title) photos.push({ bbrefId, entityId, title });
			const category = binding.category?.value?.trim();
			if (category) categories.push({ bbrefId, entityId, title: category.replace(/^Category:/, '') });
		}
		completed += group.length;
		onProgress(completed, bbrefIds.length);
	}
	identities.sort((a, b) => compareText(a.bbrefId, b.bbrefId) || compareText(a.entityId, b.entityId));
	photos.sort((a, b) => compareText(a.bbrefId, b.bbrefId) || compareText(a.entityId, b.entityId) || compareText(a.title, b.title));
	categories.sort((a, b) => compareText(a.bbrefId, b.bbrefId) || compareText(a.entityId, b.entityId) || compareText(a.title, b.title));
	return { identities, photos, categories };
}

async function categoryMembers(
	title: string,
	types: 'file|subcat' | 'file' | 'subcat',
	cacheDir: string,
	offline: boolean
): Promise<CategoryMember[]> {
	const members: CategoryMember[] = [];
	const seenContinuations = new Set<string>();
	let continuation: NonNullable<CategoryResponse['continue']> | null = null;
	do {
		const genericToken: string = continuation?.continue?.trim() ?? '';
		const memberToken: string = continuation?.cmcontinue?.trim() ?? '';
		const continuationKey = memberToken || '(root)';
		if (seenContinuations.has(continuationKey)) {
			throw new Error(`Commons repeated category continuation token for ${title}`);
		}
		seenContinuations.add(continuationKey);
		const request: string = `category-v2:${types}:${title}:${genericToken}:${memberToken}`;
		const url = new URL(COMMONS_ENDPOINT);
		url.searchParams.set('action', 'query');
		url.searchParams.set('format', 'json');
		url.searchParams.set('formatversion', '2');
		url.searchParams.set('list', 'categorymembers');
		url.searchParams.set('cmtitle', `Category:${title.replace(/^Category:/, '')}`);
		url.searchParams.set('cmtype', types);
		url.searchParams.set('cmlimit', '500');
		if (genericToken) url.searchParams.set('continue', genericToken);
		if (memberToken) url.searchParams.set('cmcontinue', memberToken);
		const response: CategoryResponse = await fetchCachedJson<CategoryResponse>(
			cacheDir,
			'categories',
			request,
			url.toString(),
			offline,
			(payload) => Array.isArray(payload.query?.categorymembers)
		);
		members.push(...(response.query?.categorymembers ?? []));
		if (response.continue && !response.continue.cmcontinue?.trim()) {
			throw new Error(`Commons returned invalid category continuation for ${title}`);
		}
		continuation = response.continue ?? null;
	} while (continuation !== null);

	const seenPageIds = new Set<number>();
	const seenTitles = new Set<string>();
	return members
		.filter((member): member is CategoryMember & { title: string } => Boolean(member.title))
		.sort((a, b) => (a.pageid ?? Number.MAX_SAFE_INTEGER) - (b.pageid ?? Number.MAX_SAFE_INTEGER) || compareText(a.title, b.title))
		.filter((member) => {
			if ((member.pageid !== undefined && seenPageIds.has(member.pageid)) || seenTitles.has(member.title)) return false;
			if (member.pageid !== undefined) seenPageIds.add(member.pageid);
			seenTitles.add(member.title);
			return true;
		});
}

export async function discoverCommonsCategoryPhotos(
	sources: CommonsCategorySource[],
	cacheDir: string,
	offline: boolean,
	onProgress: (completed: number, total: number) => void
): Promise<Map<string, string[]>> {
	const byPlayer = new Map<string, string[]>();
	const uniqueSources = [...new Map(sources.map((source) => [`${source.playerId}\0${source.title}`, source])).values()]
		.sort((a, b) => compareText(a.playerId, b.playerId) || compareText(a.title, b.title));
	let cursor = 0;
	let completed = 0;
	const workerCount = Math.min(4, uniqueSources.length);
	await Promise.all(Array.from({ length: workerCount }, async () => {
		while (cursor < uniqueSources.length) {
			const source = uniqueSources[cursor++];
			const targetYears = new Set(source.targetYears);
			const rootTitle = source.title.replace(/^Category:/, '');
			const visitedCategories = new Set<string>([rootTitle]);
			const [rootFiles, rootSubcategories] = await Promise.all([
				categoryMembers(rootTitle, 'file', cacheDir, offline),
				categoryMembers(rootTitle, 'subcat', cacheDir, offline)
			]);
			const titles = rootFiles
				.filter((member) => member.ns === 6 && member.title)
				.map((member) => member.title!.replace(/^File:/, ''));
			const directSubcategories = rootSubcategories
				.filter((member) => member.ns === 14 && member.title)
				.map((member) => member.title!.replace(/^Category:/, ''));
			const candidateYearCategories = [...directSubcategories];
			for (const container of directSubcategories.filter((title) => /\bby (?:year|season)\b/i.test(title)).sort(compareText)) {
				if (visitedCategories.has(container)) continue;
				visitedCategories.add(container);
				const nested = await categoryMembers(container, 'subcat', cacheDir, offline);
				candidateYearCategories.push(...nested
					.filter((member) => member.ns === 14 && member.title)
					.map((member) => member.title!.replace(/^Category:/, '')));
			}
			for (const category of [...new Set(candidateYearCategories)].sort(compareText)) {
				const years = [...category.matchAll(/\b(18|19|20)\d{2}\b/g)].map((match) => Number(match[0]));
				if (!years.some((year) => targetYears.has(year)) || visitedCategories.has(category)) continue;
				visitedCategories.add(category);
				const members = await categoryMembers(category, 'file', cacheDir, offline);
				titles.push(...members
					.filter((member) => member.ns === 6 && member.title)
					.map((member) => member.title!.replace(/^File:/, '')));
			}
			const existing = byPlayer.get(source.playerId) ?? [];
			existing.push(...titles);
			byPlayer.set(source.playerId, existing);
			completed++;
			onProgress(completed, uniqueSources.length);
		}
	}));
	for (const [playerId, titles] of byPlayer) byPlayer.set(playerId, [...new Set(titles)].sort(compareText));
	return byPlayer;
}

export async function acquireCommonsMetadata(
	titles: string[],
	cacheDir: string,
	offline: boolean,
	onProgress: (completed: number, total: number) => void,
	thumbnailWidth = 384
): Promise<Map<string, CommonsMetadata>> {
	if (!Number.isInteger(thumbnailWidth) || thumbnailWidth < 1 || thumbnailWidth > 4096) {
		throw new Error(`Invalid Commons thumbnail width: ${thumbnailWidth}`);
	}
	const uniqueTitles = [...new Set(titles.map((title) => title.replace(/^File:/, '').trim()))].sort(compareText);
	const groups = batches(uniqueTitles, 50);
	const metadata = new Map<string, CommonsMetadata>();
	let completed = 0;
	for (const group of groups) {
		const request = `thumbnail-v3:${thumbnailWidth}:${group.join('|')}`;
		const url = new URL(COMMONS_ENDPOINT);
		url.searchParams.set('format', 'json');
		url.searchParams.set('formatversion', '2');
		url.searchParams.set('redirects', '1');
		url.searchParams.set('prop', 'imageinfo');
		url.searchParams.set('iiprop', 'url|size|mime|extmetadata');
		url.searchParams.set('iiurlwidth', String(thumbnailWidth));
		url.searchParams.set('titles', group.map((title) => `File:${title}`).join('|'));
		const response = await fetchCachedJson<CommonsResponse>(
			cacheDir,
			'commons',
			request,
			`${COMMONS_ENDPOINT}?action=query`,
			offline,
			(payload) => Array.isArray(payload.query?.pages),
			{ method: 'POST', body: url.searchParams }
		);
		const aliases = new Map<string, string>();
		for (const alias of [...(response.query?.normalized ?? []), ...(response.query?.redirects ?? [])]) {
			aliases.set(alias.from.replace(/^File:/, ''), alias.to.replace(/^File:/, ''));
		}
		for (const page of response.query?.pages ?? []) {
			const info = page.imageinfo?.[0];
			if (page.missing || !page.pageid || !page.title || !info?.url || !info.width || !info.height || !info.mime) continue;
			const normalizedTitle = page.title.replace(/^File:/, '');
			const ext = info.extmetadata ?? {};
			const thumbWithinRequest = info.thumbwidth === undefined || (info.thumbwidth > 0 && info.thumbwidth <= thumbnailWidth);
			const originalWithinRequest = info.width <= thumbnailWidth && info.height <= thumbnailWidth && info.mime !== 'image/svg+xml';
			const rawDownload = info.thumburl && thumbWithinRequest ? info.thumburl : (originalWithinRequest ? info.url : null);
			if (!rawDownload) continue;
			if (info.mime === 'image/svg+xml' && !new URL(rawDownload).pathname.toLowerCase().endsWith('.png')) continue;
			const rawCredit = ext.Attribution?.value || ext.Artist?.value || null;
			const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(normalizedTitle).replaceAll('%20', '_')}`;
			metadata.set(normalizedTitle, {
				title: normalizedTitle,
				pageId: page.pageid,
				width: info.width,
				height: info.height,
				mime: info.mime,
				downloadUrl: cleanUrl(rawDownload),
				sourceUrl,
				description: ext.ImageDescription?.value ? stripMarkup(ext.ImageDescription.value) : null,
				dateOriginal: ext.DateTimeOriginal?.value ? stripMarkup(ext.DateTimeOriginal.value) : null,
				license: ext.LicenseShortName?.value ? stripMarkup(ext.LicenseShortName.value) : null,
				licenseUrl: ext.LicenseUrl?.value ? stripMarkup(ext.LicenseUrl.value).replace(/^http:/, 'https:') : null,
				credit: rawCredit ? stripMarkup(rawCredit) : null
			});
		}
		for (const requestedTitle of group) {
			let resolvedTitle = requestedTitle;
			const visited = new Set<string>();
			while (aliases.has(resolvedTitle) && !visited.has(resolvedTitle)) {
				visited.add(resolvedTitle);
				resolvedTitle = aliases.get(resolvedTitle)!;
			}
			const resolved = metadata.get(resolvedTitle);
			if (resolved) metadata.set(requestedTitle, resolved);
		}
		completed += group.length;
		onProgress(completed, uniqueTitles.length);
	}
	return metadata;
}
