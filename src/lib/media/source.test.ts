import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildCandidateIdentities,
	emptyExclusions,
	groupVerifiedWikidataMedia,
	isReusableLicense,
	parseCaptureYear,
	validatePlayerPhoto
} from '../../../scripts/media/logic.ts';
import type { CommonsMetadata, DataManifest } from '../../../scripts/media/types.ts';
import { acquireCommonsMetadata } from '../../../scripts/media/providers.ts';
import { fetchCachedBytes } from '../../../scripts/media/cache.ts';

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
			...licence, Attribution: { value: 'Required reuse credit' },
			Artist: { value: 'Example creator' }, Credit: { value: 'Example archive' }
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
