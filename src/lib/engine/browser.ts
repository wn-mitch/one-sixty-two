import init from './pkg/engine.js';
import wasmUrl from './pkg/engine_bg.wasm?url';

let ready: Promise<unknown> | null = null;

/** Browser entry: fetches and instantiates the wasm engine once; await before simulating. */
export function loadEngine(): Promise<unknown> {
 ready ??= init({ module_or_path: wasmUrl }).catch(error => {
  ready = null;
  throw error;
 });
 return ready;
}

export * from './core.ts';
