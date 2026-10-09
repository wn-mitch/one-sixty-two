import { constants } from 'node:fs';
import { cp, lstat, readFile, readdir, rm } from 'node:fs/promises';
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

/** Keep rollback archives in static/ while bounding the generated deployment package. */
export async function packageMediaAssets(root: string): Promise<number> {
	const directory = join(root, '.svelte-kit/cloudflare/media');
	const keep = await retainedMediaVersions(directory);
	const entries = await readdir(directory, { withFileTypes: true });
	const obsolete = entries.filter(entry => entry.isDirectory() && versionPattern.test(entry.name) && !keep.has(entry.name));
	for (const entry of obsolete) await rm(join(directory, entry.name), { recursive: true });
	return obsolete.length;
}

/** Bound Vite's asset inventory before it enumerates and copies local rollback archives. */
export async function stageBuildAssets(root: string): Promise<string> {
	const source = join(root, 'static');
	const directory = join(root, '.cache/build-assets');
	const keep = await retainedMediaVersions(join(source, 'media'));
	await rm(directory, { recursive: true, force: true });
	await cp(source, directory, {
		recursive: true,
		mode: constants.COPYFILE_FICLONE,
		filter(file) {
			const [section, version] = relative(source, file).split(sep);
			return section !== 'media' || !version || !versionPattern.test(version) || keep.has(version);
		}
	});
	return directory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	console.log(`[assets] Omitted ${await packageMediaAssets(process.cwd())} archived media versions from the deployment package; local rollback archives preserved`);
}
