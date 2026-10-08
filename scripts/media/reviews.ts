import { canonicalJSON } from '../data/compile.ts';
import { isCaptureDate, isPhotoCrop } from '../../src/lib/media/photo-policy.ts';
import type { PlayerPhoto } from '../../src/lib/media/types.ts';
import { digest } from './cache.ts';
import { prepareImage } from './images.ts';
import { emptyExclusions, validateReusableAsset } from './logic.ts';
import type { ApprovedPhotoReview, PhotoReview } from './types.ts';

const https = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function validateReviews(reviews: PhotoReview[], playerIds: Set<string>, franchises: Set<string>): void {
	if (!Array.isArray(reviews)) throw new Error('Photo review registry must be an array');
	const seen = new Set<string>();
	for (const review of reviews) {
		const key = `${review.playerId}\0${review.sourceId}`;
		if (!playerIds.has(review.playerId) || typeof review.sourceId !== 'string' || !review.sourceId.trim() || seen.has(key)) throw new Error(`Invalid or duplicate photo review: ${key}`);
		seen.add(key);
		if (review.status === 'rejected') {
			if (!review.reason?.trim() || !https(review.evidenceUrl)) throw new Error(`Rejected photo needs a reason and evidence: ${key}`);
			continue;
		}
		if (review.status !== 'approved' || review.visualReview !== true || !review.notes?.trim()) throw new Error(`Photo has not been reviewed: ${key}`);
		const { metadata, evidence } = review;
		if (!metadata || metadata.sourceId !== review.sourceId || !https(metadata.sourceUrl) || !https(metadata.downloadUrl)
			|| !/^image\/(?:jpeg|png|webp|tiff|gif)$/.test(metadata.mime)
			|| !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)
			|| !validateReusableAsset(metadata, emptyExclusions())) throw new Error(`Photo rights or metadata are incompatible: ${key}`);
		if (!evidence || ![evidence.identityUrl, evidence.uniformUrl, evidence.contextUrl, evidence.rightsUrl].every(https)
			|| !evidence.rightsBasis?.trim() || !hash(evidence.sourceChecksum) || !hash(evidence.snapshotChecksum)
			|| evidence.snapshotChecksum !== digest(canonicalJSON(metadata))) throw new Error(`Photo review snapshot or evidence is incompatible: ${key}`);
		if (!review.rights || !['original', 'reproduction'].includes(review.rights.kind)
			|| (review.rights.kind === 'reproduction' && !https(review.rights.underlyingRightsUrl))) throw new Error(`Underlying photographic rights are unverified: ${key}`);
		if (!isCaptureDate(review.captureDate) || (review.captureDate.kind !== 'unknown' && !https(review.captureEvidenceUrl))
			|| !['mlb', 'minor', 'other'].includes(review.uniform) || !['playing', 'later'].includes(review.context)
			|| (review.crop !== undefined && !isPhotoCrop(review.crop))
			|| (review.franchiseId !== undefined && !franchises.has(review.franchiseId))) throw new Error(`Photo classification is incompatible: ${key}`);
	}
}

/** Only reviewed, byte-pinned assets enter the public manifest. The snapshot preserves offline provenance. */
export async function prepareReviewedPhoto(review: ApprovedPhotoReview, cacheDir: string, stagingDirectory: string, offline: boolean): Promise<PlayerPhoto> {
	const asset = await prepareImage(review.metadata, cacheDir, stagingDirectory, offline, 384, review.crop, review.evidence.sourceChecksum);
	const rights = validateReusableAsset(review.metadata, emptyExclusions());
	if (!rights) throw new Error(`Unsupported reviewed image rights: ${review.sourceId}`);
	return {
		url: asset.filename, width: asset.width, height: asset.height, sourceUrl: asset.sourceUrl, ...rights,
		sourceId: review.sourceId, captureDate: review.captureDate,
		...(review.captureDate.kind === 'exact' ? { year: review.captureDate.year } : {}),
		uniform: review.uniform, context: review.context, review: 'approved', evidence: review.evidence,
		...(review.franchiseId ? { franchiseId: review.franchiseId } : {}),
		...(review.crop ? { crop: review.crop } : {}),
		...(review.captureEvidenceUrl ? { captureEvidenceUrl: review.captureEvidenceUrl } : {}),
		identityEvidenceUrl: review.evidence.identityUrl
	};
}
