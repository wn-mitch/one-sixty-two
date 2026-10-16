import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type ReviewRow = Record<string, unknown> & { id: string; photo: string };
export const derivative = (url: string) => url.split('/').at(-1) ?? '';
export const reviewStatus = (row: ReviewRow) => String(row.status && row.status !== 'pending' ? row.status : row.review ?? 'pending');
export const acceptedReviews = new Set(['pass', 'verified', 'corrected', 'source-limited', 'source-limitation']);
export const sourceInspected = (row: ReviewRow) => row.sourceReviewed === true || row.sourceCompared === true || /render-and-source/.test(String(row.reviewStage ?? ''));

/** Only final visual judgments and explicit source inspections are inputs. Candidate
 * registries, flag indexes, and padded-coordinate backups are deliberately excluded. */
export async function loadReviews(root: string): Promise<ReviewRow[]> {
	const files = new Set(['reviews-framing.json', 'reviews-review.json', 'reviews-root.json', 'reviews-capture.json',
		'baseline/reviews.json', 'after/reviews.json', 'blackwell-reviews.json',
		'independent-root-proposal-review.json', 'independent-root2-proposal-review.json', 'independent-capture-proposal-review.json',
		'reviews-root3-independent.json', 'independent-framing-first-review.json', 'reviews-review-final.json',
		'independent-capture2-final-review.json', 'independent-capture-follow-final-review.json',
		'independent-framing-second-review.json', 'pixel-visual-reviews-review.json', 'pixel-visual-reviews.json',
		'pixel-corrected-reviews-review.json', 'pixel-root-corrected-reviews-review.json',
		'capture-assignment-independent-final.json', 'capture-last3-independent-final.json', 'flag-current-adjudications.json',
		'independent-capture-follow-source-metadata.json', 'independent-capture2-source-metadata.json']);
	for (const file of await readdir(root)) {
		if (/^pixel-visual-reviews(?:-.*)?\.json$/.test(file) || /^source-review-.*\.json$/.test(file) || /^global-.*-(?:corrected-review|retained-review|retained)\.json$/.test(file)) files.add(file);
	}
	const rows: ReviewRow[] = [];
	for (const file of files) {
		try {
			const data = JSON.parse(await readFile(join(root, file), 'utf8'));
			if (!Array.isArray(data)) throw new Error(`Expected review array: ${file}`);
			rows.push(...data.map(row => ({ ...row, reviewFile: file })));
		} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
	}
	return rows;
}

/** A different snapshot of the same card must not replace matching evidence. */
export function matchingReview(rows: ReviewRow[], photo: string, captureChecksum: string | undefined, baselineIdentical = false): ReviewRow | undefined {
	return [...rows].reverse().find(row => acceptedReviews.has(reviewStatus(row)) && derivative(row.photo ?? '') === derivative(photo) &&
		((!!captureChecksum && row.captureChecksum === captureChecksum) ||
		 (!row.captureChecksum && baselineIdentical && !String(row.reviewStage ?? '').includes('after'))));
}
