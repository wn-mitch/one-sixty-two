import { constants } from 'node:fs';
import { cp, lstat, readFile, rm } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const versionPattern = /^[a-f0-9]{64}$/;

async function retainedMediaVersions(directory: string): Promise<Set<string>> {
	const keep = new Set<string>();
	for (const name of ['current', 'previous']) {
		let text: string;
		try { text = await readFile(join(directory, `${name}.json`), 'utf8'); }
		catch (error) {
			if (name === 'previous' && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
			throw error;
		}
		const pointer = JSON.parse(text);
		if (!versionPattern.test(pointer.version) || pointer.manifestUrl !== `/media/${pointer.version}/manifest.json`) {
			throw new Error(`Invalid ${name} media pointer`);
		}
		keep.add(pointer.version);
	}
	// A retained manifest may reference a shared asset from another media version.
	// Resolve every such dependency before removing any generated directory.
	const collect = (value: unknown): void => {
		if (typeof value === 'string') {
			const match = /^\/media\/([a-f0-9]{64})\//.exec(value);
			if (match) keep.add(match[1]);
		} else if (Array.isArray(value)) value.forEach(collect);
		else if (value && typeof value === 'object') Object.values(value).forEach(collect);
	};
	for (const version of keep) {
		const path = join(directory, version);
		if (!(await lstat(path)).isDirectory()) throw new Error(`Media version is not a generated directory: ${version}`);
		const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
		if (manifest.version !== version) throw new Error(`Media manifest version mismatch: ${version}`);
		collect(manifest);
	}
	return keep;
}

/**
 * Generated datasets, rankings and media are served by the ASSETS binding by URL; nothing in the
 * SvelteKit bundle enumerates them. They bypass Vite's and the adapter's byte-for-byte copies and
 * are cloned into the deployment directory after the build instead.
 */
const GENERATED = new Set(['data', 'media', 'rankings']);

/** Copy-on-write clone where the filesystem supports it (APFS, Btrfs), an ordinary copy elsewhere. */
function clone(source: string, target: string, filter?: (file: string) => boolean): Promise<void> {
	return cp(source, target, { recursive: true, mode: constants.COPYFILE_FICLONE, filter });
}

/** Stage only the hand-authored static files for Vite; generated sections are packaged after the build. */
export async function stageBuildAssets(root: string): Promise<string> {
	const source = join(root, 'static');
	const directory = join(root, '.cache/build-assets');
	// Fail before building when the rollback pointers are unusable.
	await retainedMediaVersions(join(source, 'media'));
	await rm(directory, { recursive: true, force: true });
	await clone(source, directory, file => !GENERATED.has(relative(source, file).split(sep)[0]));
	return directory;
}

/**
 * Clone the generated sections into the built deployment directory. Media keeps the current and
 * previous versions and their referenced dependencies; older local rollback archives stay in static/.
 * Returns the number of archived media versions left out.
 */
export async function packageGeneratedAssets(root: string): Promise<number> {
	const source = join(root, 'static');
	const output = join(root, '.svelte-kit/cloudflare');
	const media = join(source, 'media');
	const keep = await retainedMediaVersions(media);
	let omitted = 0;
	for (const section of GENERATED) {
		await rm(join(output, section), { recursive: true, force: true });
		await clone(join(source, section), join(output, section), file => {
			if (section !== 'media') return true;
			const version = relative(media, file).split(sep)[0];
			if (!versionPattern.test(version) || keep.has(version)) return true;
			if (relative(media, file) === version) omitted++;
			return false;
		});
	}
	return omitted;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	console.log(`[assets] Packaged generated assets; omitted ${await packageGeneratedAssets(process.cwd())} archived media versions (local rollback archives preserved)`);
}
