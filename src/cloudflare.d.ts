/**
 * `cloudflare:workers` is a Workers builtin module. adapter-cloudflare rewrites
 * application imports of it to the runtime module, which is how server code
 * reaches the bindings declared in wrangler.jsonc. `event.platform` is not
 * populated by the deployed adapter, so bindings are read from here instead.
 */
declare module 'cloudflare:workers' {
	export const env: import('./lib/server/share-images.ts').ShareServerBindings & {
		ASSETS: import('./lib/server/replays.ts').ReplayAssets;
		UPLOAD_LIMIT?: import('./lib/server/rate-limit.ts').RateLimiter;
		BROWSER?: import('./lib/server/site-preview.ts').BrowserRun;
		DAILY?: import('./lib/server/daily-standings.ts').DailyDatabase;
	};
	/** Keeps the invocation alive for background work after the response; a no-op in development. */
	export function waitUntil(promise: Promise<unknown>): void;
}

/** A wasm file compiled at deploy time, imported by server code through `scripts/worker-wasm-plugin.ts`. */
declare module '*.wasm?module' {
	const module: WebAssembly.Module;
	export default module;
}
