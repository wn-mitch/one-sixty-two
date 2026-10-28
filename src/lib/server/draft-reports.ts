import { DraftReportInvalidError, parseDraftReport, type DraftSharedReport } from '../draft/share-report.ts';
import { LEAGUE_VERSION, RUN_VERSION } from '../draft/versions.ts';
import { MODEL_VERSION, RULES_VERSION } from '../game/types.ts';
import { contentId, REPLAY_ID_PATTERN } from './replays.ts';
import {
	bucketGet, decodeJson, pngDimensions, PNG_MAX_BYTES, readBoundedBody, ShareIncompatibleError, ShareInvalidError, ShareNotFoundError,
	ShareUnavailableError, storeImmutable, type OwnedBytes, type ShareServerBindings
} from './share-images.ts';

/** Shared Draft Mode reports and their link-preview images, beside the Classic replays in the same bucket. */
export const DRAFT_REPORT_PREFIX = 'draft-reports/v1/';
export const DRAFT_REPORT_MAX_BYTES = 32 * 1024;
/** The card image size: the download and the `og:image`. */
export const DRAFT_CARD = { width: 1200, height: 630 } as const;

const reportKey = (id: string) => `${DRAFT_REPORT_PREFIX}${id}.json`;
const imageKey = (id: string) => `${DRAFT_REPORT_PREFIX}${id}.png`;

export const draftReportUrl = (origin: string, id: string): string => `${origin}/d/${id}`;
export const draftReportImageUrl = (origin: string, id: string): string => `${origin}/api/draft-reports/${id}/card.png`;

function parse(value: unknown): DraftSharedReport {
	try { return parseDraftReport(value); }
	catch (error) {
		if (error instanceof DraftReportInvalidError) throw new ShareInvalidError(error.message);
		throw error;
	}
}

/**
 * Publishes a finished Draft season from the current build: the report, content-addressed so the same
 * season always gets the same link, and its card image. A report from another build is refused; the
 * first image stored for a report stays, since every browser draws the same card a little differently.
 */
export async function publishDraftReport(bindings: ShareServerBindings, value: unknown, image: OwnedBytes | null, dataVersion: string): Promise<{ id: string; url: string }> {
	const report = parse(value);
	if (report.dataVersion !== dataVersion || report.runVersion !== RUN_VERSION || report.leagueVersion !== LEAGUE_VERSION
		|| report.modelVersion !== MODEL_VERSION || report.rulesVersion !== RULES_VERSION) throw new ShareIncompatibleError('This season was played on another version of the game.');
	const bytes = new TextEncoder().encode(JSON.stringify(report));
	if (bytes.byteLength > DRAFT_REPORT_MAX_BYTES) throw new ShareInvalidError('The shared season is too large.');
	if (image) {
		if (image.byteLength > PNG_MAX_BYTES) throw new ShareInvalidError('The share image is too large.');
		const { width, height } = pngDimensions(image);
		if (width !== DRAFT_CARD.width || height !== DRAFT_CARD.height) throw new ShareInvalidError('The share image has the wrong size.');
	}
	const id = await contentId(bytes);
	await storeImmutable(bindings.REPLAYS, reportKey(id), bytes, 'application/json', DRAFT_REPORT_MAX_BYTES);
	if (image && !(await bucketGet(bindings.REPLAYS, imageKey(id)))) {
		try { await bindings.REPLAYS.put(imageKey(id), image, { httpMetadata: { contentType: 'image/png' }, onlyIf: { etagDoesNotMatch: '*' } }); }
		catch { throw new ShareUnavailableError(); }
	}
	return { id, url: draftReportUrl(bindings.PUBLIC_ORIGIN.replace(/\/+$/, ''), id) };
}

/** A shared report and whether its card image was stored. Reports from earlier builds still read: they are snapshots, not replays. */
export async function loadDraftReport(bindings: ShareServerBindings, id: string): Promise<{ report: DraftSharedReport; image: boolean }> {
	if (!REPLAY_ID_PATTERN.test(id)) throw new ShareNotFoundError();
	const object = await bucketGet(bindings.REPLAYS, reportKey(id));
	if (!object) throw new ShareNotFoundError();
	const report = parse(decodeJson(await readBoundedBody(object.body, DRAFT_REPORT_MAX_BYTES), 'The shared season'));
	return { report, image: !!(await bucketGet(bindings.REPLAYS, imageKey(id))) };
}

/** A shared report's card image. */
export async function loadDraftReportImage(bindings: ShareServerBindings, id: string): Promise<OwnedBytes> {
	if (!REPLAY_ID_PATTERN.test(id)) throw new ShareNotFoundError();
	const object = await bucketGet(bindings.REPLAYS, imageKey(id));
	if (!object) throw new ShareNotFoundError();
	return readBoundedBody(object.body, PNG_MAX_BYTES);
}
