import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildCandidateIdentities,
	emptyExclusions,
	groupVerifiedWikidataMedia,
	isReusableLicense,
	parseCaptureYear,
	validateCuratedPlayerPhoto,
	validatePlayerPhoto
} from '../../../scripts/media/logic.ts';
import type { CommonsMetadata, DataManifest } from '../../../scripts/media/types.ts';
import { acquireCommonsMetadata, discoverCommonsCategoryPhotos } from '../../../scripts/media/providers.ts';
import { digest, fetchCachedBytes } from '../../../scripts/media/cache.ts';
import { prepareImage } from '../../../scripts/media/images.ts';

const manifest: DataManifest = {
	dataVersion: 'data-version',
	candidates: [{ playerId: 'anon0001' }],
	franchises: []
};

function metadata(dateOriginal: string | null, license = 'CC BY-SA 4.0'): CommonsMetadata {
	return {
		title: 'Anonymous portrait.jpg',
		pageId: 1,
		width: 300,
		height: 360,
		mime: 'image/jpeg',
		downloadUrl: 'https://example.invalid/thumb.jpg',
		sourceUrl: 'https://example.invalid/source',
		dateOriginal,
		license,
		licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
		credit: 'Example creator'
	};
}

describe('capture-year evidence', () => {
	it('accepts explicit source dates and rejects uncertain text or ranges', () => {
		expect(parseCaptureYear('1998-07-12 18:30:00')).toBe(1998);
		expect(parseCaptureYear('1998')).toBe(1998);
		expect(parseCaptureYear('circa 1998')).toBeNull();
		expect(parseCaptureYear('1998/1999')).toBeNull();
		expect(parseCaptureYear('1998-07-12 or 1999-07-12')).toBeNull();
		expect(parseCaptureYear('1998-07-12 approximate')).toBeNull();
		expect(parseCaptureYear('1998-07-12T18:30:00Z')).toBe(1998);
		expect(parseCaptureYear(null)).toBeNull();
	});

	it('requires the evidenced date to fall inside the full playing career', () => {
		const excluded = emptyExclusions();
		expect(validatePlayerPhoto(metadata('1989-05-01'), 1990, 2000, excluded)).toBeNull();
		expect(excluded.outsideCareer).toBe(1);
		expect(validatePlayerPhoto(metadata('1997-05-01'), 1990, 2000, excluded)?.year).toBe(1997);
	});

	it('uses curated exact-year evidence only when source metadata is absent or agrees', () => {
		const absent = emptyExclusions();
		expect(validateCuratedPlayerPhoto(metadata(null), 1950, 1946, 1955, absent)?.year).toBe(1950);
		expect(Object.values(absent).reduce((sum, value) => sum + value, 0)).toBe(0);

		const matching = emptyExclusions();
		expect(validateCuratedPlayerPhoto(metadata('1950-06-01'), 1950, 1946, 1955, matching)?.year).toBe(1950);

		const contradictory = emptyExclusions();
		expect(validateCuratedPlayerPhoto(metadata('1951-06-01'), 1950, 1946, 1955, contradictory)).toBeNull();
		expect(contradictory.invalidMetadata).toBe(1);

		const approximate = emptyExclusions();
		expect(validateCuratedPlayerPhoto(metadata('circa 1950'), 1950, 1946, 1955, approximate)).toBeNull();
		expect(approximate.missingCaptureYear).toBe(1);
	});

	it('rejects video, audio, document and vector thumbnails as player photographs', () => {
		for (const mime of ['video/webm', 'application/ogg', 'application/pdf', 'image/svg+xml']) {
			const excluded = emptyExclusions();
			expect(validatePlayerPhoto({ ...metadata('1997'), mime }, 1990, 2000, excluded)).toBeNull();
			expect(excluded.invalidMetadata).toBe(1);
		}
		expect(validatePlayerPhoto({ ...metadata('1997'), mime: 'image/tiff' }, 1990, 2000, emptyExclusions())?.year).toBe(1997);
	});

	it('rejects obvious multi-subject and memorabilia records while retaining a reviewed solo portrait', () => {
		const excluded = emptyExclusions();
		const rejected = [
			{
				title: 'Player Alpha, Manager Beta and Player Gamma 1948.jpg',
				description: 'Player Alpha (left), Manager Beta (center) and Player Gamma (right)'
			},
			{
				title: 'Player Delta and Player Gamma 1949.jpeg',
				description: 'Player Delta (left) and Player Gamma (right)'
			},
			{
				title: 'Executive Epsilon and Player Gamma 1950.jpg',
				description: 'Executive Epsilon (left) with Player Gamma (right)'
			},
			{
				title: '1950 Bowman player.jpg',
				description: 'Image from a 1950 baseball card'
			},
			{
				title: 'Player Zeta.jpg',
				description: 'Major League Baseball player Player Zeta in 1950',
				credit: 'Bowman Gum'
			},
			{
				title: 'Scene 1950.jpg',
				description: 'Players line up for the national anthem before the game'
			},
			{
				title: 'Archive 1950.jpg',
				description: 'An executive shaking hands with a guest as Player Gamma looks on'
			}
		];
		for (const subject of rejected) {
			expect(validatePlayerPhoto({ ...metadata('1950'), ...subject }, 1946, 1955, excluded)).toBeNull();
		}
		expect(excluded.ambiguousSubject).toBe(rejected.length);

		const solo = {
			...metadata('1950'),
			title: 'Player Gamma 1950 (1).jpg',
			description: 'American baseball player Player Gamma'
		};
		expect(validateCuratedPlayerPhoto(solo, 1950, 1946, 1955, excluded)?.year).toBe(1950);
		expect(excluded.ambiguousSubject).toBe(rejected.length);
	});
});

describe('free-media licence policy', () => {
	it('accepts reusable public-domain and attribution licences only', () => {
		expect(isReusableLicense('CC BY 4.0')).toBe(true);
		expect(isReusableLicense('CC BY-SA 3.0')).toBe(true);
		expect(isReusableLicense('CC0 1.0')).toBe(true);
		expect(isReusableLicense('PD-USGov')).toBe(true);
		expect(isReusableLicense('CC BY-NC 4.0')).toBe(false);
		expect(isReusableLicense('GFDL 1.2')).toBe(false);
		expect(isReusableLicense('All rights reserved')).toBe(false);
	});
});

describe('sports identity and career boundaries', () => {
	it('uses all batting and pitching source years rather than candidate years', () => {
		const excluded = emptyExclusions();
		const identities = buildCandidateIdentities(
			manifest,
			[{ playerID: 'anon0001', bbrefID: 'alpha01', nameFirst: 'Player', nameLast: 'One' }],
			[{ playerID: 'anon0001', yearID: '1987' }],
			[{ playerID: 'anon0001', yearID: '2003' }],
			excluded
		);
		expect(identities).toEqual([{ playerId: 'anon0001', bbrefId: 'a/alpha01', name: 'Player One', firstYear: 1987, lastYear: 2003 }]);
	});

	it('does not resolve composite bullpen units as people', () => {
		const excluded = emptyExclusions();
		const identities = buildCandidateIdentities(
			{
				dataVersion: 'data-version',
				candidates: [
					{ playerId: 'anon0001', eligibleSlots: ['DH'] },
					{ playerId: 'bullpen:F0', eligibleSlots: ['BP'] }
				],
				franchises: []
			},
			[
				{ playerID: 'anon0001', bbrefID: 'alpha01', nameFirst: 'Player', nameLast: 'One' },
				{ playerID: 'bullpen:F0', bbrefID: 'false01', nameFirst: 'Not', nameLast: 'A Person' }
			],
			[
				{ playerID: 'anon0001', yearID: '1950' },
				{ playerID: 'bullpen:F0', yearID: '1950' }
			],
			[],
			excluded
		);
		expect(identities.map((identity) => identity.playerId)).toEqual(['anon0001']);
		expect(excluded.missingPeople).toBe(0);
	});

	it('rejects an external identifier that resolves to multiple entities', () => {
		const excluded = emptyExclusions();
		const identities = [{ playerId: 'anon0001', bbrefId: 'a/alpha01', name: 'Player One', firstYear: 1987, lastYear: 2003 }];
		const grouped = groupVerifiedWikidataMedia(identities, [
			{ bbrefId: 'a/alpha01', entityId: 'Q100', title: 'Portrait one.jpg' }
		], [], excluded, [
			{ bbrefId: 'a/alpha01', entityId: 'Q100' },
			{ bbrefId: 'a/alpha01', entityId: 'Q200' }
		]);
		expect(grouped.photos.size).toBe(0);
		expect(excluded.ambiguousIdentity).toBe(1);
	});
});

it('retains requested attribution and rejects a source-only credit as creator evidence', async () => {
	const cacheDir = await mkdtemp(join(tmpdir(), 'media-source-'));
	const common = {
		width: 300, height: 360, mime: 'image/jpeg',
		url: 'https://example.invalid/original.jpg',
		thumburl: 'https://example.invalid/thumb.jpg'
	};
	const licence = {
		LicenseShortName: { value: 'CC BY 4.0' },
		LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
		DateTimeOriginal: { value: '1998-07-12' }
	};
	vi.stubGlobal('fetch', vi.fn(async () => Response.json({ query: { pages: [
		{ pageid: 1, title: 'File:Attributed portrait.jpg', imageinfo: [{ ...common, extmetadata: {
			...licence,
			ImageDescription: { value: '<span>Solo player portrait</span>' },
			Attribution: { value: 'Required reuse credit' },
			Artist: { value: 'Example creator' },
			Credit: { value: 'Example archive' }
		} }] },
		{ pageid: 2, title: 'File:Source-only portrait.jpg', imageinfo: [{ ...common, extmetadata: {
			...licence, Credit: { value: 'Example archive' }
		} }] }
	] } })));
	try {
		const images = await acquireCommonsMetadata(
			['Attributed portrait.jpg', 'Source-only portrait.jpg'], cacheDir, false, () => {}
		);
		expect(images.get('Attributed portrait.jpg')?.credit).toBe('Required reuse credit');
		expect(images.get('Attributed portrait.jpg')?.description).toBe('Solo player portrait');
		const sourceOnly = images.get('Source-only portrait.jpg');
		if (!sourceOnly) throw new Error('Source metadata fixture was not resolved');
		const excluded = emptyExclusions();
		expect(validatePlayerPhoto(sourceOnly, 1990, 2000, excluded)).toBeNull();
		expect(excluded.invalidMetadata).toBe(1);
	} finally {
		vi.unstubAllGlobals();
		await rm(cacheDir, { recursive: true, force: true });
	}
});

it('acquires a dated photo when a filename batch exceeds URL limits', async () => {
	const cacheDir = await mkdtemp(join(tmpdir(), 'media-source-'));
	const titles = Array.from({ length: 50 }, (_, index) => `Anonymous ${'x'.repeat(210)} ${index}.jpg`);
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		if (url.length > 8192) return new Response(null, { status: 414 });
		return Response.json({ query: { pages: [{
			pageid: 1, title: `File:${titles[0]}`, imageinfo: [{
				width: 300, height: 360, mime: 'image/jpeg',
				url: 'https://example.invalid/original.jpg', thumburl: 'https://example.invalid/thumb.jpg',
				extmetadata: {
					DateTimeOriginal: { value: '1998-07-12' },
					Artist: { value: 'Example creator' },
					LicenseShortName: { value: 'CC BY 4.0' },
					LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' }
				}
			}]
		}] } });
	}));
	try {
		const images = await acquireCommonsMetadata(titles, cacheDir, false, () => {});
		const image = images.get(titles[0]);
		if (!image) throw new Error('Dated source was not resolved');
		expect(validatePlayerPhoto(image, 1990, 2000, emptyExclusions())?.year).toBe(1998);
	} finally {
		vi.unstubAllGlobals();
		await rm(cacheDir, { recursive: true, force: true });
	}
});

it('retries an interrupted body and caches only the complete download', async () => {
	const cacheDir = await mkdtemp(join(tmpdir(), 'media-source-'));
	const expected = Buffer.from([1, 2, 3, 4]);
	const url = 'https://example.invalid/interrupted.jpg';
	let attempts = 0;
	vi.stubGlobal('fetch', vi.fn(async () => {
		if (attempts++ === 0) {
			return new Response(new ReadableStream({
				start(controller) {
					controller.enqueue(expected.subarray(0, 2));
					controller.error(new TypeError('terminated'));
				}
			}));
		}
		return new Response(expected);
	}));
	try {
		expect(await fetchCachedBytes(cacheDir, url, false)).toEqual(expected);
		vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline reads must not fetch'); }));
		expect(await fetchCachedBytes(cacheDir, url, true)).toEqual(expected);
	} finally {
		vi.unstubAllGlobals();
		await rm(cacheDir, { recursive: true, force: true });
	}
});

describe('Commons category discovery', () => {
	it('reads every category page and matching direct year category, deduplicates, and replays offline', async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), 'media-categories-'));
		const requests: URL[] = [];
		const categoryResponse = (url: URL) => {
			const category = url.searchParams.get('cmtitle');
			const type = url.searchParams.get('cmtype');
			const token = url.searchParams.get('cmcontinue');
			if (category === 'Category:Verified Player' && type === 'file') {
				if (!token) return {
					continue: { continue: '-||', cmcontinue: 'root-next' },
					query: { categorymembers: [{ pageid: 3, ns: 6, title: 'File:Root first.jpg' }] }
				};
				return { query: { categorymembers: [
					{ pageid: 3, ns: 6, title: 'File:Root first.jpg' },
					{ pageid: 4, ns: 6, title: 'File:Root second.jpg' }
				] } };
			}
			if (category === 'Category:Verified Player' && type === 'subcat') return { query: { categorymembers: [
				{ pageid: 10, ns: 14, title: 'Category:Verified Player by year' },
				{ pageid: 11, ns: 14, title: 'Category:Verified Player in 1950' }
			] } };
			if (category === 'Category:Verified Player by year' && type === 'subcat') return { query: { categorymembers: [
				{ pageid: 11, ns: 14, title: 'Category:Verified Player in 1950' },
				{ pageid: 12, ns: 14, title: 'Category:Verified Player in 1951' }
			] } };
			if (category === 'Category:Verified Player in 1950' && type === 'file') {
				if (!token) return {
					continue: { continue: '-||', cmcontinue: 'year-next' },
					query: { categorymembers: [{ pageid: 20, ns: 6, title: 'File:Undated.jpg' }] }
				};
				return { query: { categorymembers: [
					{ pageid: 21, ns: 6, title: 'File:Dated portrait.jpg' },
					{ pageid: 21, ns: 6, title: 'File:Dated portrait.jpg' }
				] } };
			}
			throw new Error(`Unexpected category request ${url}`);
		};
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = new URL(String(input));
			if (url.searchParams.get('list') === 'categorymembers') {
				requests.push(url);
				return Response.json(categoryResponse(url));
			}
			const body = init?.body as URLSearchParams;
			const titles = body.get('titles')!.split('|');
			return Response.json({ query: { pages: titles.map((title, index) => {
				const normalized = title.replace(/^File:/, '');
				const dated = normalized === 'Dated portrait.jpg';
				return {
					pageid: 100 + index,
					title,
					imageinfo: [{
						width: 600,
						height: 800,
						mime: 'image/jpeg',
						url: `https://example.invalid/${index}.jpg`,
						thumburl: `https://example.invalid/${index}-thumb.jpg`,
						thumbwidth: 384,
						thumbheight: 512,
						extmetadata: {
							DateTimeOriginal: dated ? { value: '1950' } : undefined,
							Artist: { value: 'Example archive' },
							LicenseShortName: { value: 'Public domain' }
						}
					}]
				};
			}) } });
		}));
		try {
			const sources = [{ playerId: 'player01', title: 'Verified Player', targetYears: [1950] }];
			const discovered = await discoverCommonsCategoryPhotos(sources, cacheDir, false, () => {});
			expect(discovered.get('player01')).toEqual([
				'Dated portrait.jpg',
				'Root first.jpg',
				'Root second.jpg',
				'Undated.jpg'
			]);
			expect(requests.every((url) => url.searchParams.get('cmlimit') === '500')).toBe(true);
			expect(requests.some((url) =>
				url.searchParams.get('continue') === '-||' &&
				url.searchParams.get('cmcontinue') === 'root-next'
			)).toBe(true);
			expect(requests.filter((url) =>
				url.searchParams.get('cmtitle') === 'Category:Verified Player in 1950' &&
				url.searchParams.get('cmtype') === 'file' &&
				!url.searchParams.get('cmcontinue')
			)).toHaveLength(1);

			const commons = await acquireCommonsMetadata(discovered.get('player01')!, cacheDir, false, () => {});
			const accepted = [...commons.values()].filter((item) =>
				validatePlayerPhoto(item, 1948, 1955, emptyExclusions())
			);
			expect(accepted.map((item) => item.title)).toEqual(['Dated portrait.jpg']);

			vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline reads must not fetch'); }));
			expect(await discoverCommonsCategoryPhotos(sources, cacheDir, true, () => {})).toEqual(discovered);
			expect(await acquireCommonsMetadata(discovered.get('player01')!, cacheDir, true, () => {})).toEqual(commons);
		} finally {
			vi.unstubAllGlobals();
			await rm(cacheDir, { recursive: true, force: true });
		}
	});

	it('rejects a repeated category continuation token', async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), 'media-categories-'));
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
			const url = new URL(String(input));
			if (url.searchParams.get('cmtype') === 'subcat') {
				return Response.json({ query: { categorymembers: [] } });
			}
			return Response.json({
				continue: { continue: '-||', cmcontinue: 'repeated' },
				query: { categorymembers: [] }
			});
		}));
		try {
			await expect(discoverCommonsCategoryPhotos(
				[{ playerId: 'player01', title: 'Verified Player', targetYears: [1950] }],
				cacheDir,
				false,
				() => {}
			)).rejects.toThrow('repeated category continuation token');
		} finally {
			vi.unstubAllGlobals();
			await rm(cacheDir, { recursive: true, force: true });
		}
	});
});

it('keys Commons metadata caches by requested thumbnail width', async () => {
	const cacheDir = await mkdtemp(join(tmpdir(), 'media-metadata-'));
	const widths: string[] = [];
	vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
		const body = init?.body as URLSearchParams;
		const width = body.get('iiurlwidth')!;
		widths.push(width);
		return Response.json({ query: { pages: [{
			pageid: Number(width),
			title: 'File:Width sample.jpg',
			imageinfo: [{
				width: 1600,
				height: 900,
				mime: 'image/jpeg',
				url: 'https://example.invalid/original.jpg',
				thumburl: `https://example.invalid/thumb-${width}.jpg`,
				thumbwidth: Number(width),
				thumbheight: Math.round(Number(width) * 0.5625),
				extmetadata: {
					DateTimeOriginal: { value: '1950' },
					Artist: { value: 'Example creator' },
					LicenseShortName: { value: 'CC BY 4.0' }
				}
			}]
		}] } });
	}));
	try {
		expect((await acquireCommonsMetadata(['Width sample.jpg'], cacheDir, false, () => {})).get('Width sample.jpg')?.downloadUrl)
			.toBe('https://example.invalid/thumb-384.jpg');
		expect((await acquireCommonsMetadata(['Width sample.jpg'], cacheDir, false, () => {}, 1280)).get('Width sample.jpg')?.downloadUrl)
			.toBe('https://example.invalid/thumb-1280.jpg');
		expect(widths).toEqual(['384', '1280']);
		vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline reads must not fetch'); }));
		await acquireCommonsMetadata(['Width sample.jpg'], cacheDir, true, () => {});
		await acquireCommonsMetadata(['Width sample.jpg'], cacheDir, true, () => {}, 1280);
	} finally {
		vi.unstubAllGlobals();
		await rm(cacheDir, { recursive: true, force: true });
	}
});

it('uses distinct dimension-bounded optimized caches for portraits and atmosphere images', async () => {
	const cacheDir = await mkdtemp(join(tmpdir(), 'media-images-'));
	const assetDirectory = join(cacheDir, 'assets');
	const source = Buffer.from([1, 2, 3, 4]);
	const sourceUrl = 'https://example.invalid/source.jpg';
	const sourceChecksum = digest(source);
	const downloadKey = digest(sourceUrl);
	await mkdir(join(cacheDir, 'downloads'), { recursive: true });
	await writeFile(join(cacheDir, 'downloads', `${downloadKey}.bin`), source);
	await writeFile(join(cacheDir, 'downloads', `${downloadKey}.json`), JSON.stringify({
		url: sourceUrl,
		checksum: sourceChecksum,
		length: source.length
	}));
	await mkdir(join(cacheDir, 'optimized'), { recursive: true });
	for (const [maxDimension, width, height] of [[384, 384, 216], [1280, 1200, 675]] as const) {
		const bytes = Buffer.from(`optimized-${maxDimension}`);
		const key = digest(`commons-thumb-webp-v2\0${maxDimension}\0${sourceUrl}\0${sourceChecksum}`);
		await writeFile(join(cacheDir, 'optimized', `${key}.webp`), bytes);
		await writeFile(join(cacheDir, 'optimized', `${key}.json`), JSON.stringify({
			checksum: digest(bytes),
			width,
			height,
			sourceChecksum
		}));
	}
	try {
		const portrait = await prepareImage({ ...metadata('1950'), downloadUrl: sourceUrl }, cacheDir, assetDirectory, true);
		const atmosphere = await prepareImage({ ...metadata('1950'), downloadUrl: sourceUrl }, cacheDir, assetDirectory, true, 1280);
		expect({ width: portrait.width, height: portrait.height }).toEqual({ width: 384, height: 216 });
		expect({ width: atmosphere.width, height: atmosphere.height }).toEqual({ width: 1200, height: 675 });
		expect(portrait.filename).not.toBe(atmosphere.filename);
	} finally {
		await rm(cacheDir, { recursive: true, force: true });
	}
});
