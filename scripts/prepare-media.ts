import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, normalize, sep } from 'node:path';
import type { MediaManifest, MediaPointer } from '../src/lib/media/types.ts';
import { validateMedia } from '../src/lib/media/client.ts';
import { acquireTables, CHECKSUMS, SOURCE_COMMIT } from './data/acquire.ts';
import { canonicalJSON } from './data/compile.ts';
import { digest } from './media/cache.ts';
import { generateMedia } from './media/compile.ts';
import type { DataManifest, DataPointer, TeamSourceRegistry } from './media/types.ts';

const args = new Set(process.argv.slice(2));
for (const argument of args) {
	if (argument !== '--offline') throw new Error(`Unknown media preparation option: ${argument}`);
}
const offline = args.has('--offline');
const root = process.cwd();
const cacheDir = join(root, '.cache', 'media');
const outputDir = join(root, 'static', 'media');

async function readJson<T>(path: string, label: string): Promise<T> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch (error) {
		throw new Error(`Unable to read ${label} at ${path}`, { cause: error });
	}
}
interface PreparedCache {
	compilerHash: string;
	dataVersion: string;
	version: string;
	manifestChecksum: string;
}

async function compilerFingerprint(dataManifestPath: string): Promise<string> {
	const hash = createHash('sha256')
		.update(SOURCE_COMMIT)
		.update(canonicalJSON(CHECKSUMS))
		.update(await readFile(dataManifestPath));
	const mediaFiles = (await readdir(join(root, 'scripts', 'media')))
		.filter((name) => name.endsWith('.ts') || name.endsWith('.json'))
		.sort();
	for (const path of [
		join(root, 'scripts', 'prepare-media.ts'),
		join(root, 'src', 'lib', 'media', 'types.ts'),
		...mediaFiles.map((name) => join(root, 'scripts', 'media', name))
	]) hash.update(path).update(await readFile(path));
	return hash.digest('hex');
}

async function canReusePrepared(compilerHash: string, dataVersion: string): Promise<boolean> {
	try {
		const prepared = await readJson<PreparedCache>(join(cacheDir, 'prepared.json'), 'prepared media cache');
		if (prepared.compilerHash !== compilerHash || prepared.dataVersion !== dataVersion) return false;
		const pointer = await readJson<MediaPointer>(join(outputDir, 'current.json'), 'generated media pointer');
		if (pointer.schemaVersion !== 1 || pointer.version !== prepared.version || pointer.manifestUrl !== `/media/${prepared.version}/manifest.json`) return false;
		const manifest = await readJson<MediaManifest>(join(outputDir, prepared.version, 'manifest.json'), 'generated media manifest');
		validateMedia(manifest, prepared.version);
		if (manifest.dataVersion !== dataVersion || digest(canonicalJSON(manifest)) !== prepared.manifestChecksum) return false;
		const urls = [
			...Object.values(manifest.teams).flatMap((team) => [team.logo?.url, ...team.historical.map((logo) => logo.url)]),
			...Object.values(manifest.players).flatMap((player) => player.photos.map((photo) => photo.url))
		].filter((url): url is string => Boolean(url));
		for (const url of new Set(urls)) {
			const expectedPrefix = `/media/${prepared.version}/`;
			if (!url.startsWith(expectedPrefix) || !/^[0-9a-f]{64}\.webp$/.test(basename(url))) return false;
			const filename = basename(url);
			if (digest(await readFile(join(outputDir, prepared.version, filename))) !== filename.replace(/\.webp$/, '')) return false;
		}
		return true;
	} catch {
		return false;
	}
}


const dataPointer = await readJson<DataPointer>(join(root, 'static', 'data', 'current.json'), 'current statistical data pointer');
if (dataPointer.schemaVersion !== 1 || !dataPointer.dataVersion || !dataPointer.manifestUrl.startsWith('/data/')) {
	throw new Error('Current statistical data pointer is incompatible with media schema 1');
}
const relativeManifest = normalize(dataPointer.manifestUrl.replace(/^\//, ''));
if (relativeManifest.startsWith(`..${sep}`) || relativeManifest.includes(`${sep}..${sep}`)) {
	throw new Error('Current statistical manifest URL escapes the static directory');
}
const dataManifestPath = join(root, 'static', relativeManifest);
const dataManifest = await readJson<DataManifest>(dataManifestPath, 'current statistical manifest');
if (dataManifest.dataVersion !== dataPointer.dataVersion || !Array.isArray(dataManifest.candidates) || !Array.isArray(dataManifest.franchises)) {
	throw new Error('Current statistical manifest does not match its pointer');
}
const compilerHash = await compilerFingerprint(dataManifestPath);
if (!offline && await canReusePrepared(compilerHash, dataManifest.dataVersion)) {
	console.log(`[media] Reusing verified generated media for statistical data ${dataManifest.dataVersion}`);
	process.exit(0);
}
const teamSources = await readJson<TeamSourceRegistry>(join(root, 'scripts', 'media', 'team-sources.json'), 'team media source registry');
const tables = await acquireTables(offline);
const generated = await generateMedia({
	dataManifest,
	tables,
	teamSources,
	cacheDir,
	outputDir,
	offline,
	log: (message) => console.log(`[media] ${message}`)
});
const pointer: MediaPointer = {
	schemaVersion: 1,
	version: generated.manifest.version,
	manifestUrl: `/media/${generated.manifest.version}/manifest.json`
};
const temporaryPointer = join(outputDir, `.current-${randomUUID()}.json`);
await writeFile(temporaryPointer, `${canonicalJSON(pointer)}\n`);
try {
	await rename(temporaryPointer, join(outputDir, 'current.json'));
} catch (error) {
	await rm(temporaryPointer, { force: true }).catch(() => undefined);
	throw error;
}
await mkdir(cacheDir, { recursive: true });
const temporaryCache = join(cacheDir, `.prepared-${randomUUID()}.json`);
const preparedCache: PreparedCache = {
	compilerHash,
	dataVersion: generated.manifest.dataVersion,
	version: generated.manifest.version,
	manifestChecksum: digest(canonicalJSON(generated.manifest))
};
await writeFile(temporaryCache, `${canonicalJSON(preparedCache)}\n`);
await rename(temporaryCache, join(cacheDir, 'prepared.json'));
console.log(
	`[media] Prepared ${generated.manifest.diagnostics.playersWithPhotos}/${generated.manifest.diagnostics.playersSearched} player portraits, ` +
	`${generated.manifest.diagnostics.logos} current logos and ${generated.manifest.diagnostics.historicalLogos} historical logos: ${generated.manifest.version}`
);
console.log(`[media] Exclusions ${canonicalJSON(generated.exclusions)}`);
console.log('[media] Coverage is limited to dated, reusable Wikidata P18 and verified Commons P373 category files; undated or out-of-career images are excluded.');
