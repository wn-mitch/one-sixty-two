import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AtmospherePhoto, HistoricalLogo, MediaAsset, MediaManifest, PlayerPhoto, TeamMedia } from '../../src/lib/media/types.ts';
import type { AcquiredTables } from '../data/acquire.ts';
import { canonicalJSON } from '../data/compile.ts';
import { digest } from './cache.ts';
import { prepareImage } from './images.ts';
import {
	buildCandidateIdentities,
	compareText,
	emptyExclusions,
	parseCaptureYear,
	validateCuratedPlayerPhoto,
	validatePlayerPhoto,
	validateReusableAsset,
	validateTeamSources
} from './logic.ts';
import { inventoryMetadata } from './inventory.ts';
import { prepareReviewedPhoto, validateReviews } from './reviews.ts';
import { captureLabel } from '../../src/lib/media/photo-policy.ts';
import type {
	AtmosphereSourceRegistry,
	CommonsMetadata,
	DataManifest,
	DirectTeamLogoSource,
	ExclusionCounts,
	MediaPayload,
	PlayerSourceRegistry,
	PhotoReview,
	PreparedAsset,
	ReviewedPlayerPhotos,
	TeamSourceRegistry
} from './types.ts';
const modifications = 'Files are auto-oriented, metadata stripped, and re-encoded as WebP. Portrait and logo derivatives are resized to at most 384px; atmosphere derivatives are resized to at most 1280px. Portraits may be cropped for display.';
const rightsNotice = [
	'Source file copyright licences do not grant trademark, privacy, publicity, or likeness rights.',
	'Team names and marks may be trademarks of their respective owners. This game is not affiliated with or endorsed by the clubs or league.'
];

interface GeneratedPlayerMedia {
	name: string;
	firstYear: number;
	lastYear: number;
	photos: PlayerPhoto[];
}

interface PreparedPhoto {
	playerId: string;
	metadata: CommonsMetadata;
	year: number;
	license: string;
	licenseUrl: string;
	credit: string;
	captureEvidenceUrl?: string;
	identityEvidenceUrl?: string;
}

interface PreparedLogo {
	franchiseId: string;
	metadata: CommonsMetadata;
	firstYear?: number;
	lastYear?: number;
	license: string;
	licenseUrl: string;
	credit: string;
}

interface PreparedAtmosphere {
	id: string;
	caption: string;
	franchiseId: string;
	year: number;
	metadata: CommonsMetadata;
	license: string;
	licenseUrl: string;
	credit: string;
}

export interface GeneratedMedia {
	manifest: MediaManifest;
	exclusions: ExclusionCounts;
}

function semanticAsset(asset: PreparedAsset, override: { license: string; licenseUrl: string; credit: string }): MediaAsset {
	return {
		url: asset.filename,
		width: asset.width,
		height: asset.height,
		sourceUrl: asset.sourceUrl,
		license: override.license,
		licenseUrl: override.licenseUrl,
		credit: override.credit
	};
}

function directLogoMetadata(franchiseId: string, source: DirectTeamLogoSource, pageId: number): CommonsMetadata {
	return {
		title: `direct:${franchiseId}`,
		pageId,
		width: 1,
		height: 1,
		mime: 'image/svg+xml',
		downloadUrl: source.url,
		sourceUrl: source.sourceUrl,
		dateOriginal: null,
		license: source.license,
		licenseUrl: source.licenseUrl,
		credit: source.credit,
		sourceId: `direct:${franchiseId}`,
		pinSourceChecksum: source.checksum
	};
}

async function prepareUniqueImages(
	metadata: CommonsMetadata[],
	cacheDir: string,
	assetDirectory: string,
	offline: boolean,
	onProgress: (completed: number, total: number) => void,
	maxDimension = 384
): Promise<Map<number, PreparedAsset>> {
	const unique = [...new Map(metadata.map((item) => [item.pageId, item])).values()].sort((a, b) => a.pageId - b.pageId);
	const prepared = new Map<number, PreparedAsset>();
	let cursor = 0;
	let completed = 0;
	const workerCount = Math.min(4, unique.length);
	const workers = await Promise.allSettled(Array.from({ length: workerCount }, async () => {
		while (cursor < unique.length) {
			const item = unique[cursor++];
			const asset = await prepareImage(item, cacheDir, assetDirectory, offline, maxDimension, undefined, item.pinSourceChecksum);
			prepared.set(item.pageId, asset);
			completed++;
			onProgress(completed, unique.length);
		}
	}));
	const failure = workers.find((result): result is PromiseRejectedResult => result.status === 'rejected');
	if (failure) throw failure.reason;
	return prepared;
}

function totalExclusions(exclusions: ExclusionCounts): number {
	return Object.values(exclusions).reduce((total, count) => total + count, 0);
}

function validateAtmosphereSources(registry: AtmosphereSourceRegistry, manifest: DataManifest): void {
	const franchises = new Set(manifest.franchises.map((franchise) => franchise.id));
	const ids = new Set<string>();
	for (const source of registry) {
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id) || ids.has(source.id)
			|| !source.title.trim() || !source.caption.trim() || !franchises.has(source.franchiseId)
			|| !Number.isInteger(source.year)) {
			throw new Error(`Invalid atmosphere source ${source.id || '(missing id)'}`);
		}
		ids.add(source.id);
	}
}

function validatePlayerSources(registry: PlayerSourceRegistry, playerIds: Set<string>): void {
	for (const [playerId, sources] of Object.entries(registry)) {
		if (!playerIds.has(playerId) || !Array.isArray(sources) || sources.length === 0) {
			throw new Error(`Curated player source does not match a verified candidate: ${playerId}`);
		}
		const titles = new Set<string>();
		for (const source of sources) {
			if (!source.title.trim() || titles.has(source.title) || !Number.isInteger(source.captureYear)
				|| !source.captureEvidenceUrl.startsWith('https://') || !source.identityEvidenceUrl.startsWith('https://')) {
				throw new Error(`Invalid curated player source for ${playerId}`);
			}
			titles.add(source.title);
		}
	}
}

/**
 * Published assets are content-addressed, so an existing file is reusable only
 * while its bytes still hash to its filename. Staged files repair anything else.
 */
async function repairPublishedAssets(stagingDirectory: string, versionDirectory: string): Promise<void> {
	for (const name of (await readdir(stagingDirectory)).sort()) {
		if (name === 'manifest.json' || name === 'NOTICE.txt') continue;
		const published = join(versionDirectory, name);
		try {
			if (digest(await readFile(published)) === name.replace(/\.webp$/, '')) continue;
		} catch (error) {
			if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
		}
		const temporary = `${published}.${randomUUID()}.tmp`;
		try {
			await copyFile(join(stagingDirectory, name), temporary);
			await rename(temporary, published);
		} finally {
			await rm(temporary, { force: true });
		}
	}
}

export async function generateMedia(input: {
	dataManifest: DataManifest;
	tables: AcquiredTables;
	teamSources: TeamSourceRegistry;
	playerSources: PlayerSourceRegistry;
	reviewedPlayerPhotos: ReviewedPlayerPhotos;
	photoReviews?: PhotoReview[];
	atmosphereSources: AtmosphereSourceRegistry;
	cacheDir: string;
	outputDir: string;
	offline: boolean;
	log(message: string): void;
}): Promise<GeneratedMedia> {
	validateTeamSources(input.teamSources, input.dataManifest.franchises);
	validateAtmosphereSources(input.atmosphereSources, input.dataManifest);
	const exclusions = emptyExclusions();
	const identities = buildCandidateIdentities(
		input.dataManifest,
		input.tables.People ?? [],
		input.tables.Batting ?? [],
		input.tables.Pitching ?? [],
		exclusions
	);
	const individualCandidates = input.dataManifest.candidates.filter((candidate) => !candidate.eligibleSlots?.includes('BP'));
	const playersSearched = new Set(individualCandidates.map((candidate) => candidate.playerId)).size;
	validatePlayerSources(input.playerSources, new Set(identities.map((identity) => identity.playerId)));
	const reviews = input.photoReviews ?? [];
	validateReviews(reviews, new Set(identities.map(identity => identity.playerId)), new Set(input.dataManifest.franchises.map(franchise => franchise.id)));
	const reviewKeys = new Set(reviews.map(review => `${review.playerId}\0${review.sourceId}`));
	input.log(`Compiling reviewed inventory for ${identities.length} player identities`);
	const candidateTitlesByPlayer = new Map<string, string[]>();
	for (const identity of identities) {
		const titles = [
			...(input.reviewedPlayerPhotos[identity.playerId] ?? []),
			...(input.playerSources[identity.playerId] ?? []).map((source) => source.title)
		];
		candidateTitlesByPlayer.set(identity.playerId, [...new Set(titles)].sort(compareText));
	}
	const logoTitles = Object.values(input.teamSources).flatMap((team) => [
		team.current && 'title' in team.current ? team.current.title : null,
		...team.historical.map((logo) => logo.title)
	]).filter((title): title is string => Boolean(title));
	const photoTitles = [...candidateTitlesByPlayer.values()].flat();
	const allTitles = [...new Set([...photoTitles, ...logoTitles])].sort(compareText);
	input.log(`Reading reusable-source metadata for ${allTitles.length} candidate files`);
	const commons = await inventoryMetadata(allTitles, input.cacheDir, input.offline);

	const atmosphereTitles = input.atmosphereSources.map((source) => source.title);
	input.log(`Reading reusable-source metadata for ${atmosphereTitles.length} atmosphere files`);
	const atmosphereMetadata = await inventoryMetadata(atmosphereTitles, input.cacheDir, input.offline, 1280);
	const acceptedAtmosphere: PreparedAtmosphere[] = [];
	for (const source of [...input.atmosphereSources].sort((a, b) => compareText(a.id, b.id))) {
		const metadata = atmosphereMetadata.get(source.title);
		if (!metadata) throw new Error(`Missing Commons metadata for atmosphere source ${source.id}`);
		const captureYear = parseCaptureYear(metadata.dateOriginal);
		if (captureYear !== source.year) {
			throw new Error(`Atmosphere source ${source.id} has capture year ${String(captureYear)}, expected ${source.year}`);
		}
		const validation = validateReusableAsset(metadata, exclusions);
		if (!validation) throw new Error(`Atmosphere source ${source.id} is not reusable`);
		acceptedAtmosphere.push({ ...source, metadata, ...validation });
	}

	const selectedPhotos = new Map<string, PreparedPhoto>();
	for (const identity of identities) {
		const seenPages = new Set<number>();
		const reviewedTitles = new Set(input.reviewedPlayerPhotos[identity.playerId] ?? []);
		for (const title of candidateTitlesByPlayer.get(identity.playerId) ?? []) {
			const metadata = commons.get(title);
			if (!metadata) {
				exclusions.invalidMetadata++;
				continue;
			}
			if (reviewKeys.has(`${identity.playerId}\0${metadata.sourceId ?? `commons:${metadata.pageId}`}`)) continue;
			if (!reviewedTitles.has(metadata.title)) {
				exclusions.ambiguousSubject++;
				continue;
			}
			if (seenPages.has(metadata.pageId)) {
				exclusions.duplicatePhoto++;
				continue;
			}
			seenPages.add(metadata.pageId);
			const curated = input.playerSources[identity.playerId]?.find((source) => source.title === title);
			const validation = curated
				? validateCuratedPlayerPhoto(metadata, curated.captureYear, identity.firstYear, identity.lastYear, exclusions)
				: validatePlayerPhoto(metadata, identity.firstYear, identity.lastYear, exclusions);
			if (!validation) continue;
			const evidence = curated ? {
				captureEvidenceUrl: curated.captureEvidenceUrl,
				identityEvidenceUrl: curated.identityEvidenceUrl
			} : {};
			const candidate = { playerId: identity.playerId, metadata, ...validation, ...evidence };
			const key = `${identity.playerId}\0${validation.year}`;
			const current = selectedPhotos.get(key);
			const candidatePortrait = metadata.height >= metadata.width && metadata.height / metadata.width <= 2.5;
			const currentPortrait = current ? current.metadata.height >= current.metadata.width && current.metadata.height / current.metadata.width <= 2.5 : false;
			const candidateQuality = Math.min(metadata.width, metadata.height) * 1_000_000 + metadata.width * metadata.height;
			const currentQuality = current ? Math.min(current.metadata.width, current.metadata.height) * 1_000_000 + current.metadata.width * current.metadata.height : -1;
			if (!current || Number(candidatePortrait) > Number(currentPortrait) || (candidatePortrait === currentPortrait && (candidateQuality > currentQuality || (candidateQuality === currentQuality && compareText(metadata.title, current.metadata.title) < 0)))) {
				if (current) exclusions.duplicatePhoto++;
				selectedPhotos.set(key, candidate);
			} else {
				exclusions.duplicatePhoto++;
			}
		}
	}
	const acceptedPhotos = [...selectedPhotos.values()].sort((a, b) => compareText(a.playerId, b.playerId) || a.year - b.year || compareText(a.metadata.title, b.metadata.title));
	const acceptedPhotosByPlayer = new Map<string, PreparedPhoto[]>();
	for (const photo of acceptedPhotos) {
		const list = acceptedPhotosByPlayer.get(photo.playerId) ?? [];
		list.push(photo);
		acceptedPhotosByPlayer.set(photo.playerId, list);
	}

	const acceptedLogos: PreparedLogo[] = [];
	for (const [franchiseId, team] of Object.entries(input.teamSources).sort(([a], [b]) => compareText(a, b))) {
		if (!team.current) {
			exclusions.missingLogo++;
		} else if ('source' in team.current) {
			const metadata = directLogoMetadata(franchiseId, team.current, -(acceptedLogos.length + 1));
			acceptedLogos.push({
				franchiseId, metadata,
				license: team.current.license,
				licenseUrl: team.current.licenseUrl,
				credit: team.current.credit
			});
		} else {
			const metadata = commons.get(team.current.title);
			if (!metadata) {
				exclusions.invalidMetadata++;
				exclusions.missingLogo++;
			} else {
				const validation = validateReusableAsset(metadata, exclusions);
				if (validation) acceptedLogos.push({ franchiseId, metadata, ...validation });
				else exclusions.missingLogo++;
			}
		}
		for (const historical of team.historical) {
			const metadata = commons.get(historical.title);
			if (!metadata) {
				exclusions.invalidMetadata++;
				exclusions.missingLogo++;
			} else {
				const validation = validateReusableAsset(metadata, exclusions);
				if (validation) acceptedLogos.push({ franchiseId, metadata, firstYear: historical.firstYear, lastYear: historical.lastYear, ...validation });
				else exclusions.missingLogo++;
			}
		}
	}

	const stagingDirectory = join(input.cacheDir, 'build', randomUUID());
	await mkdir(stagingDirectory, { recursive: true });
	try {
		const prepared = await prepareUniqueImages(
			[...acceptedPhotos.map((photo) => photo.metadata), ...acceptedLogos.map((logo) => logo.metadata)],
			input.cacheDir,
			stagingDirectory,
			input.offline,
			(completed, total) => {
				if (completed === total || completed % 100 === 0) input.log(`Local thumbnails ${completed}/${total}`);
			}
		);
		const preparedAtmosphere = await prepareUniqueImages(
			acceptedAtmosphere.map((photo) => photo.metadata),
			input.cacheDir,
			stagingDirectory,
			input.offline,
			(completed, total) => {
				if (completed === total) input.log(`Local atmosphere images ${completed}/${total}`);
			},
			1280
		);

		const generatedPlayers: Record<string, GeneratedPlayerMedia> = {};
		for (const identity of identities) {
			const photos: PlayerPhoto[] = (acceptedPhotosByPlayer.get(identity.playerId) ?? [])
				.map((photo) => {
					const asset = prepared.get(photo.metadata.pageId);
					if (!asset) throw new Error(`Missing prepared player image page ${photo.metadata.pageId}`);
					return { asset, photo };
				})
				.sort((a, b) => a.photo.year - b.photo.year || compareText(a.asset.filename, b.asset.filename))
				.map(({ asset, photo }) => ({
					...semanticAsset(asset, photo),
					year: photo.year,
					captureDate: { kind: 'exact', year: photo.year },
					sourceId: photo.metadata.sourceId ?? `commons:${photo.metadata.pageId}`,
					uniform: 'unclassified', context: 'unclassified', review: 'legacy',
					...(photo.captureEvidenceUrl ? { captureEvidenceUrl: photo.captureEvidenceUrl } : {}),
					...(photo.identityEvidenceUrl ? { identityEvidenceUrl: photo.identityEvidenceUrl } : {})
				}));
			generatedPlayers[identity.playerId] = { name: identity.name, firstYear: identity.firstYear, lastYear: identity.lastYear, photos };
		}
		for (const review of reviews) {
			if (review.status !== 'approved') continue;
			generatedPlayers[review.playerId].photos.push(await prepareReviewedPhoto(review, input.cacheDir, stagingDirectory, input.offline));
		}
		for (const player of Object.values(generatedPlayers)) player.photos.sort((a, b) => compareText(a.sourceId ?? a.url, b.sourceId ?? b.url));

		const generatedTeams: Record<string, TeamMedia> = {};
		for (const [franchiseId, source] of Object.entries(input.teamSources).sort(([a], [b]) => compareText(a, b))) {
			const logos = acceptedLogos.filter((logo) => logo.franchiseId === franchiseId);
			const current = logos.find((logo) => logo.firstYear === undefined);
			let logo: MediaAsset | null = null;
			if (current) {
				const asset = prepared.get(current.metadata.pageId);
				if (!asset) throw new Error(`Missing prepared current logo page ${current.metadata.pageId}`);
				logo = semanticAsset(asset, current);
			}
			const historical: HistoricalLogo[] = logos
				.filter((item): item is PreparedLogo & { firstYear: number; lastYear: number } => item.firstYear !== undefined && item.lastYear !== undefined)
				.map((item) => {
					const asset = prepared.get(item.metadata.pageId);
					if (!asset) throw new Error(`Missing prepared historical logo page ${item.metadata.pageId}`);
					return { ...semanticAsset(asset, item), firstYear: item.firstYear, lastYear: item.lastYear };
				})
				.sort((a, b) => a.firstYear - b.firstYear || a.lastYear - b.lastYear || compareText(a.url, b.url));
			generatedTeams[franchiseId] = { name: source.name, color: source.color, logo, historical };
		}

		const generatedAtmosphere: Record<string, AtmospherePhoto> = {};
		for (const source of acceptedAtmosphere) {
			const asset = preparedAtmosphere.get(source.metadata.pageId);
			if (!asset) throw new Error(`Missing prepared atmosphere image page ${source.metadata.pageId}`);
			generatedAtmosphere[source.id] = {
				...semanticAsset(asset, source),
				id: source.id,
				caption: source.caption,
				franchiseId: source.franchiseId,
				year: source.year
			};
		}

		const photos = Object.values(generatedPlayers).reduce((count, player) => count + player.photos.length, 0);
		const logos = Object.values(generatedTeams).filter((team) => team.logo).length;
		const historicalLogos = Object.values(generatedTeams).reduce((count, team) => count + team.historical.length, 0);
		const diagnostics = {
			playersSearched,
			playersWithPhotos: Object.values(generatedPlayers).filter((player) => player.photos.length > 0).length,
			photos,
			logos,
			historicalLogos,
			atmospherePhotos: Object.keys(generatedAtmosphere).length,
			excluded: totalExclusions(exclusions)
		};
		const semanticPayload: MediaPayload & { players: Record<string, GeneratedPlayerMedia> } = {
			teams: generatedTeams,
			players: generatedPlayers,
			atmosphere: generatedAtmosphere,
			diagnostics
		};
		const version = digest(canonicalJSON({
			schemaVersion: 3,
			dataVersion: input.dataManifest.dataVersion,
			modifications,
			rightsNotice,
			media: semanticPayload
		}));
		const replaceUrl = (asset: MediaAsset): MediaAsset => ({ ...asset, url: `/media/${version}/${asset.url}` });
		const teams = Object.fromEntries(Object.entries(generatedTeams).map(([id, team]) => [id, {
			...team,
			logo: team.logo ? replaceUrl(team.logo) : null,
			historical: team.historical.map((item) => ({ ...replaceUrl(item), firstYear: item.firstYear, lastYear: item.lastYear }))
		}]));
		const players = Object.fromEntries(Object.entries(generatedPlayers).map(([id, player]) => [id, {
			...player,
			photos: player.photos.map((item) => ({
				...item,
				...replaceUrl(item),
				...(item.captureEvidenceUrl ? { captureEvidenceUrl: item.captureEvidenceUrl } : {}),
				...(item.identityEvidenceUrl ? { identityEvidenceUrl: item.identityEvidenceUrl } : {})
			}))
		}]));
		const atmosphere = Object.fromEntries(Object.entries(generatedAtmosphere).map(([id, item]) => [id, {
			...replaceUrl(item),
			id: item.id,
			caption: item.caption,
			franchiseId: item.franchiseId,
			year: item.year
		}]));
		const manifest: MediaManifest = {
			schemaVersion: 3,
			version,
			dataVersion: input.dataManifest.dataVersion,
			modifications,
			teams,
			players,
			atmosphere,
			diagnostics
		};
		await writeFile(join(stagingDirectory, 'manifest.json'), `${canonicalJSON(manifest)}\n`);
		const creditedAssets: Array<{
			label: string;
			asset: MediaAsset;
			captureEvidenceUrl?: string;
			identityEvidenceUrl?: string;
		}> = [
			...Object.entries(manifest.teams).flatMap(([id, team]) => [
				...(team.logo ? [{ label: `${id} current mark`, asset: team.logo }] : []),
				...team.historical.map((asset) => ({ label: `${id} ${asset.firstYear}-${asset.lastYear} mark`, asset }))
			]),
			...Object.entries(manifest.players).flatMap(([id, player]) =>
				player.photos.map((asset) => ({
					label: `${id} ${captureLabel(asset)} portrait`,
					asset,
					captureEvidenceUrl: asset.captureEvidenceUrl,
					identityEvidenceUrl: asset.identityEvidenceUrl
				}))),
			...Object.values(manifest.atmosphere).map((asset) => ({ label: `${asset.id} ${asset.year} atmosphere`, asset }))
		];
		creditedAssets.sort((a, b) => compareText(a.label, b.label));
		const notice = [
			modifications,
			...rightsNotice,
			...creditedAssets.map(({ label, asset, captureEvidenceUrl, identityEvidenceUrl }) => [
				label,
				`Credit: ${asset.credit}`,
				`Source: ${asset.sourceUrl}`,
				`Licence: ${asset.license} (${asset.licenseUrl})`,
				...(captureEvidenceUrl ? [`Capture-date evidence: ${captureEvidenceUrl}`] : []),
				...(identityEvidenceUrl ? [`Player-identity evidence: ${identityEvidenceUrl}`] : [])
			].join('\n'))
		].join('\n\n');
		await writeFile(join(stagingDirectory, 'NOTICE.txt'), `${notice}\n`);
		await mkdir(input.outputDir, { recursive: true });
		const versionDirectory = join(input.outputDir, version);
		try {
			await rename(stagingDirectory, versionDirectory);
		} catch (error) {
			if (!(typeof error === 'object' && error !== null && 'code' in error && (error.code === 'EEXIST' || error.code === 'ENOTEMPTY'))) throw error;
			const existing = await readFile(join(versionDirectory, 'manifest.json'), 'utf8');
			if (existing !== `${canonicalJSON(manifest)}\n`) throw new Error(`Existing media version ${version} does not match generated content`);
			await repairPublishedAssets(stagingDirectory, versionDirectory);
			await rm(stagingDirectory, { recursive: true, force: true });
		}
		return { manifest, exclusions };
	} catch (error) {
		await rm(stagingDirectory, { recursive: true, force: true });
		throw error;
	}
}
