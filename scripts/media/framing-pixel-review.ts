import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checksum, type PixelEvidence } from './framing-pixels.ts';
import { atomicWrite } from './cache.ts';
import { loadReviews, derivative, reviewStatus as status, matchingReview } from './framing-review-data.ts';

/** Reconcile exact rendered photo pixels with explicitly inspected captures.
 * Unmatched pixel groups remain a visual-review queue, never inferred passes.
 */
const root = join(process.cwd(), '.cache/media/framing');
const phase = process.argv[2] ?? 'after-pixels';
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error('Invalid capture phase');
const run = promisify(execFile);
const font = process.env.FRAMING_AUDIT_FONT ?? (process.platform === 'darwin' ? '/System/Library/Fonts/Helvetica.ttc' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
const read = async <T>(file: string, fallback: T): Promise<T> => {
	try { return JSON.parse(await readFile(join(root, file), 'utf8')) as T; }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
};
type Row = Record<string, unknown> & { id: string; photo: string; sourceId: string; name: string; era: string };
const inventory = await read<{ entries: Row[] }>(`${phase}/inventory.json`, { entries: [] });
const evidence = await read<Record<string, PixelEvidence>>(`${phase}/pixel-evidence.json`, {});
const valid = await read<Record<string, { fingerprint: string }>>(`${phase}/valid-captures.json`, {});
const reviews = new Map<string, Row[]>();
for (const review of await loadReviews(root)) reviews.set(review.id, [...(reviews.get(review.id) ?? []), review as Row]);
const groups = new Map<string, Row[]>();
const invalid: string[] = [];
for (const row of inventory.entries) {
	const proof = evidence[row.id];
	if (!proof || ![2, 3].includes(proof.version) || valid[row.id]?.fingerprint !== row.renderFingerprint) continue;
	// A phase can be resumed while this command runs. Never trust a stale screenshot hash.
	const actual = await readFile(join(root, phase, 'cards', `${row.id}.jpg`)).catch(() => null);
	if (!actual || checksum(actual) !== proof.jpegChecksum) { invalid.push(row.id); continue; }
	const key = `${derivative(row.photo)}:${proof.version}:${proof.pixels}`;
	groups.set(key, [...(groups.get(key) ?? []), row]);
}
const results: Record<string, unknown>[] = [], queue: Row[] = [];
for (const [key, rows] of groups) {
	// Keep all immutable review versions: a later review of another snapshot must
	// neither hide a matching proof nor approve pixels it never inspected.
	const matchingReviews = new Map(rows.flatMap(row => {
		const proof = evidence[row.id];
		const review = matchingReview(reviews.get(row.id) ?? [], row.photo, proof.jpegChecksum, proof.baselineIdentical);
		return review ? [[row.id, review] as const] : [];
	}));
	const directlyReviewed = rows.filter(row => matchingReviews.has(row.id));
	const anchor = directlyReviewed[0];
	if (!anchor) queue.push({ ...rows[0], pixelGroup: key, equivalentCards: rows.length });
	for (const row of rows) {
		const direct = directlyReviewed.some(item => item.id === row.id);
		const review = anchor && matchingReviews.get(direct ? row.id : anchor.id)!;
		results.push({ id: row.id, photo: row.photo, pixelGroup: key, anchor: anchor?.id,
			verification: direct ? 'direct-visual' : anchor ? 'pixel-match' : 'pending-visual',
			status: review ? status(review) : 'pending', subtype: review?.subtype,
			captureChecksum: evidence[row.id].jpegChecksum, anchorCaptureChecksum: anchor ? evidence[anchor.id].jpegChecksum : undefined });
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
		await run('magick', ['montage', '-font', font, ...batch.map(row => join(root, phase, 'cards', `${row.id}.jpg`)), '-tile', '8x', '-geometry', '200x280+0+0', '-background', '#10161c', '-quality', '85', join(directory, `${name}.jpg`)]);
		await atomicWrite(join(directory, `${name}.json`), JSON.stringify(batch));
	}
}
console.log(JSON.stringify(counts));
