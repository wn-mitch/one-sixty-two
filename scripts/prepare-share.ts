import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = process.cwd();
const outputDirectory = join(root, 'static', 'share');
const outputPath = join(outputDirectory, 'current.json');
const sourceRoots = [
	'src/lib/cards/Card.svelte',
	'src/lib/cards/CompactPlate.svelte',
	'src/lib/cards/Material.svelte',
	'src/lib/cards/fit.ts',
	'src/lib/cards/finish.ts',
	'src/lib/cards/fonts.css',
	'src/lib/cards/motion-runtime.ts',
	'src/lib/cards/motion.ts',
	'src/lib/cards/tokens.ts',
	'src/lib/cards/view-model.ts',
	'src/lib/cards/backs',
	'src/lib/cards/fronts',
	'src/lib/cards/parts',
	'src/lib/share',
	'src/routes/+layout.svelte',
	'src/routes/__share/[model]/[format]/+page.svelte',
	'src/routes/layout.css',
	'static/fonts'
] as const;
const sourceExtensions: Record<string, true> = {
	'.css': true,
	'.otf': true,
	'.svelte': true,
	'.ts': true,
	'.ttf': true,
	'.woff': true,
	'.woff2': true
};

function extension(path: string): string {
	const dot = path.lastIndexOf('.');
	return dot < 0 ? '' : path.slice(dot);
}

async function collect(path: string): Promise<string[]> {
	const absolute = resolve(root, path);
	const entries = await readdir(absolute, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOTDIR') return null;
		throw error;
	});
	if (entries === null) return [absolute];
	const files: string[] = [];
	for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
		if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) continue;
		const child = join(absolute, entry.name);
		if (entry.isDirectory()) files.push(...await collect(child));
		else if (entry.isFile() && sourceExtensions[extension(entry.name)]) files.push(child);
	}
	return files;
}

const files = (await Promise.all(sourceRoots.map(collect))).flat()
	.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const hash = createHash('sha256');
for (const filename of files) {
	const portablePath = relative(root, filename).split(sep).join('/');
	if (portablePath === 'static/share/current.json') continue;
	hash.update(portablePath).update('\0').update(await readFile(filename)).update('\0');
}
const rendererVersion = hash.digest('hex');
const body = `${JSON.stringify({ schemaVersion: 1, rendererVersion })}\n`;
await mkdir(outputDirectory, { recursive: true });
const temporaryPath = join(outputDirectory, `.current-${randomUUID()}.json`);
await writeFile(temporaryPath, body);
await rename(temporaryPath, outputPath);
console.log(`[share] Prepared renderer ${rendererVersion} from ${files.length} source files`);
