import { readFileSync } from 'node:fs';
import { basename, dirname, posix, resolve } from 'node:path';
import type { Plugin } from 'vite';

const MARK = 'worker-wasm:';

/**
 * Lets server code import a wasm file as a compiled `WebAssembly.Module` with `import mod from './x.wasm?module'`.
 * Workers cannot compile wasm at runtime, so the server build emits the file beside its chunks and keeps a
 * relative import to it, which wrangler bundles as a compiled module. Build only: development runs the
 * server in Node, which loads the engine through `src/lib/engine/node.ts` instead.
 */
export function workerWasm(): Plugin {
	const assets = new Map<string, string>();
	return {
		name: 'worker-wasm',
		apply: 'build',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!source.endsWith('.wasm?module') || !importer) return null;
			const file = resolve(dirname(importer), source.slice(0, -'?module'.length));
			if (!assets.has(file)) assets.set(file, this.emitFile({ type: 'asset', name: basename(file), source: readFileSync(file) }));
			return { id: `${MARK}${file}`, external: true };
		},
		renderChunk(code, chunk) {
			if (!code.includes(MARK)) return null;
			let rendered = code;
			for (const [file, reference] of assets) {
				const target = posix.relative(posix.dirname(chunk.fileName), this.getFileName(reference));
				rendered = rendered.replaceAll(`${MARK}${file}`, target.startsWith('.') ? target : `./${target}`);
			}
			return { code: rendered, map: null };
		}
	};
}
