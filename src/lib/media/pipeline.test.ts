import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest } from '../../../scripts/media/cache.ts';
import { prepareImage } from '../../../scripts/media/images.ts';
import { packageMediaAssets, stageBuildAssets } from '../../../scripts/package-assets.ts';
import { generateMedia } from '../../../scripts/media/compile.ts';
import { canonicalJSON } from '../../../scripts/data/compile.ts';
import { selectPhoto, validateMedia } from './client.ts';
import { auditMedia } from '../../../scripts/media/audit.ts';
import { writeResearch } from '../../../scripts/media/research.ts';
import type { ResearchContext } from '../../../scripts/media/research.ts';
import { parse } from 'csv-parse/sync';
import type { ApprovedPhotoReview } from '../../../scripts/media/types.ts';
import type { AcquiredTables } from '../../../scripts/data/acquire.ts';

let root: string;
const exec = promisify(execFile);
const sourceUrl = 'https://example.invalid/synthetic.ppm';
// Distinct halves let the test detect both wrong crop coordinates and reuse of an uncropped derivative.
const source = Buffer.concat([Buffer.from('P6\n80 40\n255\n'), Buffer.from(Array.from({ length: 80 * 40 }, (_, i) => i % 80 < 40 ? [255, 0, 0] : [0, 0, 255]).flat())]);
const metadata = { sourceId: 'archive:synthetic', pageId: 0, title: 'Synthetic photographic extract', width: 8000, height: 4000, mime: 'image/png', downloadUrl: sourceUrl, sourceUrl: 'https://example.invalid/source', dateOriginal: 'Uploaded 2025', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', credit: 'Synthetic archive' };
const crop = { x: .5, y: 0, width: .5, height: 1 };
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'portrait-pipeline-')); await mkdir(join(root, 'downloads'));
	const key = digest(sourceUrl); await writeFile(join(root, 'downloads', `${key}.bin`), source);
	await writeFile(join(root, 'downloads', `${key}.json`), JSON.stringify({ url: sourceUrl, checksum: digest(source), length: source.length }));
	vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Compilation must not perform discovery or online acquisition in this test'); }));
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });

function review(id = 'archive:synthetic'): ApprovedPhotoReview {
	const snapshot = { ...metadata, sourceId: id };
	return { playerId: 'synthetic01', sourceId: id, status: 'approved', metadata: snapshot, captureDate: { kind: 'exact', year: 1988 }, captureEvidenceUrl: metadata.sourceUrl,
		uniform: 'minor', context: 'playing', crop, notes: 'Synthetic review of underlying photographic work and individual crop', visualReview: true,
		rights: { kind: 'reproduction', underlyingRightsUrl: metadata.sourceUrl },
		evidence: { identityUrl: metadata.sourceUrl, uniformUrl: metadata.sourceUrl, contextUrl: metadata.sourceUrl, rightsUrl: metadata.sourceUrl, rightsBasis: 'Archive releases the underlying photographic work', sourceChecksum: digest(source), snapshotChecksum: digest(canonicalJSON(snapshot)) } };
}

describe('reviewed image acquisition and offline compilation', () => {
	it('packages current, rollback and referenced media without deleting local archives', async () => {
		const versions = ['a', 'b', 'c', 'd'].map(letter => letter.repeat(64));
		const directory = join(root, '.svelte-kit/cloudflare/media');
		for (const version of versions) {
			await mkdir(join(directory, version), { recursive: true });
			await writeFile(join(directory, version, 'manifest.json'), JSON.stringify({ version,
				...(version === versions[0] ? { photo: `/media/${versions[2]}/portrait.webp` } : {}) }));
		}
		for (const [i, name] of ['current', 'previous'].entries()) await writeFile(join(directory, `${name}.json`), JSON.stringify({ version: versions[i], manifestUrl: `/media/${versions[i]}/manifest.json` }));
		await cp(directory, join(root, 'static/media'), { recursive: true });
		await writeFile(join(root, 'static/media', versions[3], 'manifest.json'), 'local archive');
		const staged = join(await stageBuildAssets(root), 'media');
		for (const version of versions.slice(0, 3)) expect(await readFile(join(staged, version, 'manifest.json'), 'utf8')).toContain(version);
		await expect(readFile(join(staged, versions[3], 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
		expect(await packageMediaAssets(root)).toBe(1);
		for (const version of versions.slice(0, 3)) expect(await readFile(join(directory, version, 'manifest.json'), 'utf8')).toContain(version);
		await expect(readFile(join(directory, versions[3], 'manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
		expect(await readFile(join(root, 'static/media', versions[3], 'manifest.json'), 'utf8')).toBe('local archive');
		await writeFile(join(directory, 'previous.json'), JSON.stringify({ version: '../unsafe', manifestUrl: '/media/../unsafe/manifest.json' }));
		await expect(packageMediaAssets(root)).rejects.toThrow('Invalid previous');
		expect(await readFile(join(directory, versions[1], 'manifest.json'), 'utf8')).toContain(versions[1]);
		await writeFile(join(root, 'static/media/previous.json'), JSON.stringify({ version: '../unsafe', manifestUrl: '/media/../unsafe/manifest.json' }));
		await expect(stageBuildAssets(root)).rejects.toThrow('Invalid previous');
		expect(await readFile(join(staged, versions[2], 'manifest.json'), 'utf8')).toContain(versions[2]);
	});
	it('reports every individual selection and requires review of every removed source', async () => {
		const photo = { url: '/media/example/image.webp', width: 80, height: 40, year: 1996, sourceUrl: metadata.sourceUrl, sourceId: 'archive:first', license: 'CC0', licenseUrl: metadata.licenseUrl, credit: metadata.credit };
		const baseline = { schemaVersion: 2, version: 'baseline', dataVersion: 'synthetic-data', players: { synthetic01: { name: 'Example Athlete', firstYear: 1996, lastYear: 1996, photos: [photo, { ...photo, sourceId: 'archive:second' }] } } };
		await mkdir(join(root, 'static/media/baseline'), { recursive: true });
		await mkdir(join(root, 'audit'));
		await writeFile(join(root, 'static/media/baseline/manifest.json'), JSON.stringify(baseline));
		await writeFile(join(root, 'audit/baseline-pointer.json'), JSON.stringify({ manifestUrl: '/media/baseline/manifest.json' }));
		const identity = { playerId: 'synthetic01', bbrefId: 'synthetic01', name: 'Example Athlete', firstYear: 1996, lastYear: 1996 };
		const context = { root, cacheDir: root, data: { dataVersion: 'synthetic-data', candidates: [
			{ playerId: 'synthetic01', seasonId: 'synthetic01:1996:AL:AAA', franchiseId: 'AAA' },
			{ playerId: 'bullpen', seasonId: 'bullpen:1996:AL:AAA', franchiseId: 'AAA', eligibleSlots: ['BP'] }
		] }, media: { ...baseline, version: 'current', players: { synthetic01: { ...baseline.players.synthetic01, photos: [] } } }, identities: [identity], aliases: new Map(),
			reviews: [{ playerId: 'synthetic01', sourceId: 'archive:first', status: 'rejected', reason: 'Verified namesake', evidenceUrl: metadata.sourceUrl }] } as unknown as ResearchContext;
		await writeResearch(context, { schemaVersion: 1, playerId: identity.playerId, name: identity.name, dataVersion: 'synthetic-data', candidates: [], searches: {
			commons: { status: 'blocked', reason: 'Provider said "try again", query incomplete', queries: ['Example Athlete'], attempted: true, updatedAt: '2026-01-01' }
		} });
		const first = await auditMedia(context);
		expect(first.totalSelections).toBe(1);
		expect(first.losses).toEqual([{ seasonId: 'synthetic01:1996:AL:AAA', playerId: identity.playerId, explained: false, reasons: ['Verified namesake'] }]);
		context.reviews.push({ ...context.reviews[0], sourceId: 'archive:second' });
		const second = await auditMedia(context);
		expect(second.losses).toEqual([{ seasonId: 'synthetic01:1996:AL:AAA', playerId: identity.playerId, explained: true, reasons: ['Verified namesake', 'Verified namesake'] }]);
		const rows = parse(await readFile(join(root, 'audit/players.csv'), 'utf8'), { columns: true }) as Array<{ blockers: string }>;
		expect(rows[0].blockers).toContain('Provider said "try again", query incomplete');
		// A completed search with rejected leads must still explain the blank in the summary CSV.
		expect(rows[0].blockers).toContain('rejected: Verified namesake');
		expect(rows[0].blockers).not.toContain('no candidate discovered');
		// Legacy manifests can lack IDs and use a different encoding of the file URL.
		await writeFile(join(root, 'static/media/baseline/manifest.json'), JSON.stringify({ ...baseline,
			players: { synthetic01: { ...baseline.players.synthetic01, photos: [{ ...photo, sourceId: undefined,
				sourceUrl: 'http://commons.wikimedia.org/wiki/File:Example_Athlete%2C_uniform.jpg?utm_source=archive' }] } } }));
		await writeResearch(context, { schemaVersion: 1, playerId: identity.playerId, name: identity.name, dataVersion: 'synthetic-data', searches: {},
			candidates: [{ sourceId: 'archive:first', provider: 'commons', title: 'Example Athlete, uniform.jpg',
				sourceUrl: 'https://commons.wikimedia.org/?curid=123',
				metadata: { ...metadata, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example_Athlete,_uniform.jpg' }, via: ['cached identity/category'] }] });
		expect((await auditMedia(context)).losses).toEqual([{ seasonId: 'synthetic01:1996:AL:AAA', playerId: identity.playerId, explained: true, reasons: ['Verified namesake'] }]);
		const selections = parse(await readFile(join(root, 'audit/selections.csv'), 'utf8'), { columns: true });
		expect(selections).toHaveLength(1);
		expect(selections[0]).toMatchObject({ playerId: identity.playerId, franchiseId: 'AAA', year: '1996', before: 'true', after: 'false', tier: '6' });
	});
	it('uses decoded dimensions, never upscales, invalidates changed crops and pins source bytes', async () => {
		const assetDir = join(root, 'assets');
		const full = await prepareImage(metadata, root, assetDir, true, 384, undefined, digest(source));
		const cropped = await prepareImage(metadata, root, assetDir, true, 384, crop, digest(source));
		expect([full.width, full.height]).toEqual([80, 40]); expect([cropped.width, cropped.height]).toEqual([40, 40]);
		expect(cropped.filename).not.toBe(full.filename);
		const { stdout } = await exec('magick', [join(assetDir, cropped.filename), '-format', '%[fx:mean.r] %[fx:mean.b]', 'info:']);
		const [red, blue] = stdout.trim().split(/\s+/).map(Number); expect(red).toBeLessThan(.05); expect(blue).toBeGreaterThan(.95);
		expect((await prepareImage(metadata, root, assetDir, true, 384, crop, digest(source))).filename).toBe(cropped.filename);
		await expect(prepareImage(metadata, root, assetDir, true, 384, crop, '0'.repeat(64))).rejects.toThrow('bytes changed');
	});
	it('publishes reviewed pre-debut crops and same-year alternatives reproducibly without broad searches', async () => {
		const first = review(), second = { ...review('archive:alternative'), uniform: 'mlb' as const, franchiseId: 'AAA' };
		const franchises = Array.from({ length: 30 }, (_, i) => ({ id: i ? `T${i}` : 'AAA', name: `Synthetic Club ${i}` }));
		const input = { dataManifest: { dataVersion: 'synthetic-data', candidates: [{ playerId: 'synthetic01', seasonId: 'synthetic01:1996:AL:AAA', franchiseId: 'AAA' }], franchises },
			tables: { People: [{ playerID: 'synthetic01', nameFirst: 'Example', nameLast: 'Athlete', bbrefID: 'synthetic01' }], Batting: [{ playerID: 'synthetic01', yearID: '1996' }], Pitching: [] } as unknown as AcquiredTables,
			teamSources: Object.fromEntries(franchises.map(team => [team.id, { name: team.name, color: '#123456', current: null, historical: [] }])), playerSources: {}, reviewedPlayerPhotos: {}, photoReviews: [first, second], atmosphereSources: [], cacheDir: root, outputDir: join(root, 'published'), offline: true, log: () => {} };
		const generated = await generateMedia(input); validateMedia(generated.manifest, generated.manifest.version);
		expect(generated.manifest.players.synthetic01.photos).toHaveLength(2);
		expect(selectPhoto(generated.manifest, 'synthetic01', 1996, 'AAA')?.sourceId).toBe(second.sourceId);
		const originalVersion = generated.manifest.version;
		expect((await generateMedia(input)).manifest.version).toBe(originalVersion);
		const asset = generated.manifest.players.synthetic01.photos[0]; const bytes = await readFile(join(root, 'published', originalVersion, asset.url.split('/').at(-1)!));
		expect(asset.url).toContain(digest(bytes));
		input.photoReviews[0] = { ...first, crop: { x: 0, y: 0, width: .5, height: 1 } };
		expect((await generateMedia(input)).manifest.version).not.toBe(originalVersion);
		expect(await readFile(join(root, 'published', originalVersion, 'manifest.json'), 'utf8')).toContain(originalVersion);
	});
});
