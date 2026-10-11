import { readFileSync } from 'node:fs';
import { initSync } from './pkg/engine.js';

/** Node entry: instantiates the wasm engine synchronously on import. */
initSync({ module: readFileSync(new URL('./pkg/engine_bg.wasm', import.meta.url)) });

export * from './core.ts';
export * from './prep.ts';
