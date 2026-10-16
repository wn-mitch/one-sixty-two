import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checksum, type PixelEvidence } from './framing-pixels.ts';
import { atomicWrite } from './cache.ts';

/** Reconcile exact rendered photo pixels with explicitly inspected captures.
 * Unmatched pixel groups remain a visual-review queue, never inferred passes.
 */
const root = join(process.cwd(), '.cache/media/framing');
const phase = process.argv[2] ?? 'after-pixels';
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Invalid capture phase');
const run = promisify(execFile);
const read = async <T>(file: string, fallback: T): Promise<T> => {
	try { return JSON.parse(await readFile(join(root, file), 'utf8')) as T; }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
};
type Row = Record<string, unknown> & { id: string; photo: string; sourceId: string; name: string; era: string };
const inventory = await read<{ entries: Row[] }>(`${phase}/inventory.json`, { entries: [] });
const evidence = await read<Record<string, PixelEvidence>>(`${phase}/pixel-evidence.json`, {});
const valid = await read<Record<string, { fingerprint: string }>>(`${phase}/valid-captures.json`, {});
const files = ['reviews-framing.json', 'reviews-review.json', 'reviews-root.json', 'reviews-capture.json', 'baseline/reviews.json', 'after/reviews.json', 'blackwell-reviews.json',
	'independent-root-proposal-review.json', 'independent-root2-proposal-review.json', 'independent-capture-proposal-review.json', 'reviews-root3-independent.json', 'independent-framing-first-review.json', 'pixel-visual-reviews.json'];
const reviews = new Map<string, Row>();
for (const file of files) for (const review of await read<Row[]>(file, [])) reviews.set(review.id, review);
const derivative = (url: string) => url.split('/').at(-1);
const status = (row: Row) => String(row.review && row.review !== 'pending' ? row.review : row.status ?? 'pending');
const accepted = new Set(['pass', 'verified', 'corrected', 'source-limited', 'source-limitation']);
const groups = new Map<string, Row[]>();
const invalid: string[] = [];
for (const row of inventory.entries) {
	const proof = evidence[row.id];
	if (!proof || proof.version !== 2 || valid[row.id]?.fingerprint !== row.renderFingerprint) continue;
	// A phase can be resumed while this command runs. Never trust a stale screenshot hash.
	const actual = await readFile(join(root, phase, 'cards', `${row.id}.jpg`)).catch(() => null);
	if (!actual || checksum(actual) !== proof.jpegChecksum) { invalid.push(row.id); continue; }
	const key = `${derivative(row.photo)}:${proof.pixels}`;
	groups.set(key, [...(groups.get(key) ?? []), row]);
}
const results: Record<string, unknown>[] = [], queue: Row[] = [];
for (const [key, rows] of groups) {
	const directlyReviewed = rows.filter(row => {
		const review = reviews.get(row.id), proof = evidence[row.id];
		if (!review || !accepted.has(status(review)) || derivative(review.photo ?? '') !== derivative(row.photo)) return false;
		return review.captureChecksum === proof.jpegChecksum ||
			(!String(review.reviewStage ?? '').includes('after') && proof.baselineIdentical);
	});
	const anchor = directlyReviewed[0];
	if (!anchor) queue.push({ ...rows[0], pixelGroup: key, equivalentCards: rows.length });
	for (const row of rows) {
		const direct = directlyReviewed.some(item => item.id === row.id);
		const review = anchor && reviews.get(direct ? row.id : anchor.id)!;
		results.push({ id: row.id, photo: row.photo, pixelGroup: key, anchor: anchor?.id,
			verification: direct ? 'direct-visual' : anchor ? 'pixel-match' : 'pending-visual',
			status: review ? status(review) : 'pending', subtype: review?.subtype,
			captureChecksum: evidence[row.id].jpegChecksum });
	}
}
const counts = { expected: inventory.entries.length, pixelChecked: results.length,
	directVisual: results.filter(row => row.verification === 'direct-visual').length,
	pixelMatched: results.filter(row => row.verification === 'pixel-match').length,
	pendingVisualCards: results.filter(row => row.verification === 'pending-visual').length,
	pendingDistinctFrames: queue.length, invalidCaptures: invalid };
await atomicWrite(join(root, `${phase}/pixel-review.json`), JSON.stringify({ counts, results }));
await atomicWrite(join(root, `${phase}/pixel-review-queue.json`), JSON.stringify(queue));
if (process.argv.includes('--contacts')) {
	const directory = join(root, `${phase}/pixel-review`);
	await mkdir(directory, { recursive: true });
	for (let offset = 0; offset < queue.length; offset += 64) {
		const batch = queue.slice(offset, offset + 64), name = `contact-${String(offset).padStart(6, '0')}`;
		await run('magick', ['montage', ...batch.map(row => join(root, phase, 'cards', `${row.id}.jpg`)), '-tile', '8x', '-geometry', '200x280+0+0', '-background', '#10161c', '-quality', '85', join(directory, `${name}.jpg`)]);
		await atomicWrite(join(directory, `${name}.json`), JSON.stringify(batch));
	}
}
console.log(JSON.stringify(counts));
