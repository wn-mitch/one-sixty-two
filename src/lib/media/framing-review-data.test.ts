import { describe, it, expect } from 'vitest';
import { matchingReview, sourceInspected, type ReviewRow } from '../../../scripts/media/framing-review-data.ts';

const row = (extra: Record<string, unknown>): ReviewRow => ({ id: 'card', photo: '/media/version/photo.webp', status: 'pass', ...extra });
describe('framing review evidence', () => {
	it('selects the inspected immutable snapshot even when another review is newer', () => {
		const inspected = row({ captureChecksum: 'correct', note: 'inspected' });
		expect(matchingReview([inspected, row({ captureChecksum: 'other' })], '/media/new/photo.webp', 'correct')).toBe(inspected);
		expect(matchingReview([inspected], '/media/new/different.webp', 'correct')).toBeUndefined();
	});
	it('requires proven baseline identity for unpinned baseline judgments', () => {
		const baseline = row({ reviewStage: 'baseline render-and-source' });
		expect(matchingReview([baseline], baseline.photo, 'new')).toBeUndefined();
		expect(matchingReview([baseline], baseline.photo, 'new', true)).toBe(baseline);
		expect(matchingReview([row({ reviewStage: 'after' })], baseline.photo, 'new', true)).toBeUndefined();
	});
	it('does not turn explicit source comparison or a flagged capture into acceptance', () => {
		const source = row({ sourceCompared: true, status: 'needs-framing', captureChecksum: 'same' });
		expect(sourceInspected(source)).toBe(true);
		expect(matchingReview([source], source.photo, 'same')).toBeUndefined();
	});
});

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checksum } from '../../../scripts/media/framing-pixels.ts';

it('reconciles real CLI inputs without accepting stale captures or source-only metadata', async () => {
	const temporary = await mkdtemp(join(tmpdir(), 'framing-proof-'));
	const root = join(temporary, '.cache/media/framing');
	const phase = 'fixture';
	const run = promisify(execFile);
	const save = async (file: string, value: unknown) => writeFile(join(root, file), JSON.stringify(value));
	try {
		await mkdir(join(root, phase, 'cards'), { recursive: true });
		await mkdir(join(temporary, 'scripts/media'), { recursive: true });
		await mkdir(join(temporary, 'static/media'), { recursive: true });
		const entries = ['stale', 'matching', 'source'].map(id => ({ id, name: id, photo: '/media/photo.webp', sourceId: 'source', era: '1990s', renderFingerprint: id }));
		const evidence: Record<string, unknown> = {};
		for (const entry of entries) {
			const bytes = Buffer.from(entry.id);
			await writeFile(join(root, phase, 'cards', entry.id + '.jpg'), bytes);
			evidence[entry.id] = { version: 3, pixels: entry.id, jpegChecksum: checksum(bytes), baselineIdentical: false };
		}
		await save('inventory.json', { entries, photoCards: 3 });
		await save(phase + '/inventory.json', { entries });
		await save(phase + '/pixel-evidence.json', evidence);
		await save(phase + '/valid-captures.json', Object.fromEntries(entries.map(row => [row.id, { fingerprint: row.id }])));
		await save('reviews-root.json', [
			{ ...entries[0], status: 'corrected', captureChecksum: checksum(Buffer.from('old')) },
			{ ...entries[1], status: 'pass', captureChecksum: checksum(Buffer.from('matching')), note: 'matching snapshot' }
		]);
		await save('pixel-visual-reviews-fixture.json', [{ ...entries[1], status: 'verified', captureChecksum: checksum(Buffer.from('newer but different')) }]);
		await save('source-review-fixture.json', [{ ...entries[2], sourceCompared: true, subtype: 'tight-headshot', subjectBounds: { x: 0, y: 0, width: 1, height: 1 }, focalPoint: { x: .5, y: .5 }, status: 'pass' }]);
		await writeFile(join(temporary, 'scripts/media/photo-framing.json'), JSON.stringify({ entries: [] }));
		await writeFile(join(temporary, 'static/media/photo.webp'), 'source');
		await run(process.execPath, [resolve('scripts/media/framing-pixel-review.ts'), phase], { cwd: temporary });
		const result = JSON.parse(await readFile(join(root, phase, 'pixel-review.json'), 'utf8'));
		expect(result.results.find((row: ReviewRow) => row.id === 'stale').verification).toBe('pending-visual');
		expect(result.results.find((row: ReviewRow) => row.id === 'matching').verification).toBe('direct-visual');
		expect(result.results.find((row: ReviewRow) => row.id === 'source').verification).toBe('pending-visual');
		await run(process.execPath, [resolve('scripts/media/framing-gallery.ts'), phase], { cwd: temporary });
		const coverage = JSON.parse(await readFile(join(root, 'review-coverage.json'), 'utf8'));
		expect(coverage.reviewed).toBe(1);
		expect(coverage.sourceCoverage.measured).toBe(1);
		const html = await readFile(join(root, 'review.html'), 'utf8');
		expect(html).toContain('matching snapshot');
	} finally { await rm(temporary, { recursive: true, force: true }); }
});
