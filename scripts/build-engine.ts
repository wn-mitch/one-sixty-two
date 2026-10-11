import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { glob, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Builds the Rust engine's web wasm package into the ignored `src/lib/engine/pkg/` when its
 * sources changed. A content hash of the Rust sources, manifests, lock file, and toolchain pin is
 * stored beside the package, so every prepare hook can call this cheaply. FORCE_ENGINE=1 rebuilds.
 */
const root = process.cwd();
const output = join(root, 'src/lib/engine/pkg');
const stampPath = join(output, '.source-hash');
const patterns = ['engine/**/*.rs', 'engine-wasm/**/*.rs', 'engine/Cargo.toml', 'engine-wasm/Cargo.toml', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'];

/** Hash of the inputs that determine the wasm package. */
export async function engineSourceHash(): Promise<string> {
	const files: string[] = [];
	for await (const path of glob(patterns, { cwd: root })) files.push(path);
	files.sort();
	const hash = createHash('sha256');
	for (const path of files) hash.update(path).update('\0').update(await readFile(join(root, path))).update('\0');
	return hash.digest('hex');
}

async function main(): Promise<void> {
	const current = await engineSourceHash();
	const built = existsSync(join(output, 'engine_bg.wasm')) && existsSync(join(output, 'engine.js'));
	const previous = existsSync(stampPath) ? (await readFile(stampPath, 'utf8')).trim() : null;
	if (process.env.FORCE_ENGINE !== '1' && built && previous === current) return;
	// An interrupted build must never be vouched for by an older stamp.
	await rm(stampPath, { force: true });
	console.log('[engine] Building the Rust engine for wasm');
	execFileSync('wasm-pack', ['build', 'engine-wasm', '--release', '--target', 'web', '--out-dir', '../src/lib/engine/pkg', '--out-name', 'engine', '--no-pack'], { cwd: root, stdio: 'inherit' });
	// Callers type against the generated `engine.d.ts`; the glue itself is not ours to type-check.
	const glue = join(output, 'engine.js');
	await writeFile(glue, `// @ts-nocheck\n${await readFile(glue, 'utf8')}`);
	await writeFile(stampPath, `${current}\n`);
}

if (import.meta.main) await main();
