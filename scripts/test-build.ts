import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { glob, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Builds the application for the browser suite only when a build input changed since the last
 * suite build. Inputs are hashed by content: application source and build scripts (tests and test infrastructure excluded),
 * hand-authored static files, the generated-asset pointers, and the root build configuration.
 * Content-addressed generated versions are covered by their pointers. Set FORCE_BUILD=1 to rebuild.
 */
const root = process.cwd();
const stampPath = join(root, '.cache/test-build-fingerprint');
const versioned = /(?:^|\/)[a-f0-9]{64}(?:\/|$)/;
const testOnly = /\.(?:test|spec|e2e)\.[jt]s$|\.stories\.(?:svelte|[jt]s)$|^scripts\/test-/;
const patterns = ['src/**/*', 'scripts/**/*', 'static/**/*', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'wrangler.jsonc'];

async function fingerprint(): Promise<string> {
	const files: string[] = [];
	for await (const entry of glob(patterns, { cwd: root, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const path = join(entry.parentPath, entry.name).slice(root.length + 1);
		if (testOnly.test(path) || (path.startsWith('static/') && versioned.test(path))) continue;
		files.push(path);
	}
	files.sort();
	const hash = createHash('sha256');
	for (const path of files) hash.update(path).update('\0').update(await readFile(join(root, path))).update('\0');
	return hash.digest('hex');
}

/** `npm run build` without its prebuild hook; the prepare steps already ran above. */
function build(): void {
	execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });
	execFileSync('node', ['scripts/package-assets.ts'], { cwd: root, stdio: 'inherit' });
}

const built = existsSync(join(root, '.svelte-kit/cloudflare/_worker.js'));
const previous = existsSync(stampPath) ? (await readFile(stampPath, 'utf8')).trim() : null;
// Prepare steps can move generated pointers, so they run before the inputs are compared.
for (const step of ['data:prepare', 'rankings:prepare', 'media:prepare', 'share:prepare']) {
	execFileSync('npm', ['run', '-s', step], { cwd: root, stdio: 'inherit' });
}
const current = await fingerprint();
if (process.env.FORCE_BUILD !== '1' && built && previous === current) {
	console.log('[test-build] Build inputs unchanged; reusing .svelte-kit/cloudflare');
} else {
	// An interrupted build must never be vouched for by an older stamp.
	await rm(stampPath, { force: true });
	build();
	await mkdir(join(root, '.cache'), { recursive: true });
	await writeFile(stampPath, `${current}\n`);
}
