import module from '../engine/pkg/engine_bg.wasm?module';
import { initSync } from '../engine/pkg/engine.js';

/** Worker entry for the engine: the wasm module is compiled at deploy time, since Workers cannot compile it at runtime. */
initSync({ module });

export { simulateSeason } from '../engine/core.ts';
