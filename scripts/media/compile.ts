import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HistoricalLogo, MediaAsset, MediaManifest, PlayerPhoto, TeamMedia } from '../../src/lib/media/types.ts';
import type { AcquiredTables } from '../data/acquire.ts';
import { canonicalJSON } from '../data/compile.ts';
import { digest } from './cache.ts';
import { prepareImage } from './images.ts';
import {
	buildCandidateIdentities,
	compareText,
	emptyExclusions,
	groupVerifiedWikidataMedia,
	validatePlayerPhoto,
	validateReusableAsset,
	validateTeamSources
} from './logic.ts';
import { acquireCommonsMetadata, acquireWikidataMedia, discoverCommonsCategoryPhotos } from './providers.ts';
import type {
	CommonsMetadata,
	DataManifest,
	ExclusionCounts,
	MediaPayload,
	PreparedAsset,
	TeamSourceRegistry
} from './types.ts';

const modifications = 'Files are auto-oriented, metadata stripped, resized to at most 384px, and re-encoded as WebP. Portraits may be cropped for display.';

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

async function prepareUniqueImages(
	metadata: CommonsMetadata[],
	cacheDir: string,
	assetDirectory: string,
	offline: boolean,
	onProgress: (completed: number, total: number) => void
): Promise<Map<number, PreparedAsset>> {
	const unique = [...new Map(metadata.map((item) => [item.pageId, item])).values()].sort((a, b) => a.pageId - b.pageId);
	const prepared = new Map<number, PreparedAsset>();
	let cursor = 0;
	let completed = 0;
	const workerCount = Math.min(4, unique.length);
	const workers = await Promise.allSettled(Array.from({ length: workerCount }, async () => {
		while (cursor < unique.length) {
			const item = unique[cursor++];
			const asset = await prepareImage(item, cacheDir, assetDirectory, offline);
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
	cacheDir: string;
	outputDir: string;
	offline: boolean;
	log(message: string): void;
}): Promise<GeneratedMedia> {
	validateTeamSources(input.teamSources, input.dataManifest.franchises);
	const exclusions = emptyExclusions();
	const identities = buildCandidateIdentities(
		input.dataManifest,
		input.tables.People ?? [],
		input.tables.Batting ?? [],
		input.tables.Pitching ?? [],
		exclusions
	);
	const playersSearched = new Set(input.dataManifest.candidates.map((candidate) => candidate.playerId)).size;
	input.log(`Resolving ${identities.length} verified sports identities across the full candidate pool`);
	const wikidata = await acquireWikidataMedia(
		identities.map((identity) => identity.bbrefId),
		input.cacheDir,
		input.offline,
		(completed, total) => {
			if (completed === total || completed % 1_000 === 0) input.log(`Identity lookup ${completed}/${total}`);
		}
	);
	const verified = groupVerifiedWikidataMedia(identities, wikidata.photos, wikidata.categories, exclusions, wikidata.identities);
	const targetYearsByPlayer = new Map<string, Set<number>>();
	for (const candidate of input.dataManifest.candidates) {
		const year = Number(candidate.seasonId?.split(':')[1]);
		if (!Number.isInteger(year)) continue;
		const years = targetYearsByPlayer.get(candidate.playerId) ?? new Set<number>();
		years.add(year);
		targetYearsByPlayer.set(candidate.playerId, years);
	}
	const categorySources = identities.flatMap((identity) =>
		(verified.categories.get(identity.playerId) ?? []).map((category) => ({
			playerId: identity.playerId,
			title: category.title,
			targetYears: [...(targetYearsByPlayer.get(identity.playerId) ?? new Set([identity.firstYear, identity.lastYear]))].sort((a, b) => a - b)
		}))
	);
	input.log(`Discovering dated alternatives in ${categorySources.length} verified Commons player categories`);
	const categoryPhotos = await discoverCommonsCategoryPhotos(categorySources, input.cacheDir, input.offline, (completed, total) => {
		if (completed === total || completed % 250 === 0) input.log(`Category discovery ${completed}/${total}`);
	});
	const candidateTitlesByPlayer = new Map<string, string[]>();
	for (const identity of identities) {
		const titles = [
			...(verified.photos.get(identity.playerId) ?? []).map((photo) => photo.title),
			...(categoryPhotos.get(identity.playerId) ?? [])
		];
		candidateTitlesByPlayer.set(identity.playerId, [...new Set(titles)].sort(compareText));
	}
	const logoTitles = Object.values(input.teamSources).flatMap((team) => [team.current?.title, ...team.historical.map((logo) => logo.title)]).filter((title): title is string => Boolean(title));
	const photoTitles = [...candidateTitlesByPlayer.values()].flat();
	const allTitles = [...new Set([...photoTitles, ...logoTitles])].sort(compareText);
	input.log(`Reading reusable-source metadata for ${allTitles.length} candidate files`);
	const commons = await acquireCommonsMetadata(allTitles, input.cacheDir, input.offline, (completed, total) => {
		if (completed === total || completed % 500 === 0) input.log(`Licence metadata ${completed}/${total}`);
	});

	const selectedPhotos = new Map<string, PreparedPhoto>();
	for (const identity of identities) {
		const seenPages = new Set<number>();
		for (const title of candidateTitlesByPlayer.get(identity.playerId) ?? []) {
			const metadata = commons.get(title);
			if (!metadata) {
				exclusions.invalidMetadata++;
				continue;
			}
			if (seenPages.has(metadata.pageId)) {
				exclusions.duplicatePhoto++;
				continue;
			}
			seenPages.add(metadata.pageId);
			const validation = validatePlayerPhoto(metadata, identity.firstYear, identity.lastYear, exclusions);
			if (!validation) continue;
			const candidate = { playerId: identity.playerId, metadata, ...validation };
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

		const generatedPlayers: Record<string, GeneratedPlayerMedia> = {};
		for (const identity of identities) {
			const photos = (acceptedPhotosByPlayer.get(identity.playerId) ?? [])
				.map((photo) => {
					const asset = prepared.get(photo.metadata.pageId);
					if (!asset) throw new Error(`Missing prepared player image page ${photo.metadata.pageId}`);
					return { asset, photo };
				})
				.sort((a, b) => a.photo.year - b.photo.year || compareText(a.asset.filename, b.asset.filename))
				.map(({ asset, photo }) => ({
					...semanticAsset(asset, photo),
					year: photo.year
				}));
			generatedPlayers[identity.playerId] = { name: identity.name, firstYear: identity.firstYear, lastYear: identity.lastYear, photos };
		}

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

		const photos = Object.values(generatedPlayers).reduce((count, player) => count + player.photos.length, 0);
		const logos = Object.values(generatedTeams).filter((team) => team.logo).length;
		const historicalLogos = Object.values(generatedTeams).reduce((count, team) => count + team.historical.length, 0);
		const diagnostics = {
			playersSearched,
			playersWithPhotos: Object.values(generatedPlayers).filter((player) => player.photos.length > 0).length,
			photos,
			logos,
			historicalLogos,
			excluded: totalExclusions(exclusions)
		};
		const semanticPayload: MediaPayload & { players: Record<string, GeneratedPlayerMedia> } = {
			teams: generatedTeams,
			players: generatedPlayers,
			diagnostics
		};
		const version = digest(canonicalJSON({ schemaVersion: 1, dataVersion: input.dataManifest.dataVersion, modifications, media: semanticPayload }));
		const replaceUrl = (asset: MediaAsset): MediaAsset => ({ ...asset, url: `/media/${version}/${asset.url}` });
		const teams = Object.fromEntries(Object.entries(generatedTeams).map(([id, team]) => [id, {
			...team,
			logo: team.logo ? replaceUrl(team.logo) : null,
			historical: team.historical.map((item) => ({ ...replaceUrl(item), firstYear: item.firstYear, lastYear: item.lastYear }))
		}]));
		const players = Object.fromEntries(Object.entries(generatedPlayers).map(([id, player]) => [id, {
			...player,
			photos: player.photos.map((item) => ({ ...replaceUrl(item), year: item.year }))
		}]));
		const manifest: MediaManifest = {
			schemaVersion: 1,
			version,
			dataVersion: input.dataManifest.dataVersion,
			modifications,
			teams,
			players,
			diagnostics
		};
		await writeFile(join(stagingDirectory, 'manifest.json'), `${canonicalJSON(manifest)}\n`);
		await writeFile(join(stagingDirectory, 'NOTICE.txt'), `${modifications}\nTeam names and marks may be trademarks of their respective owners. Source licences cover the image files and do not grant trademark rights.\n`);
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
