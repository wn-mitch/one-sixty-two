/**
 * `cloudflare:workers` is a Workers builtin module. adapter-cloudflare rewrites
 * application imports of it to the runtime module, which is how server code
 * reaches the bindings declared in wrangler.jsonc. `event.platform` is not
 * populated by the deployed adapter, so bindings are read from here instead.
 */
declare module 'cloudflare:workers' {
	export const env: {
		ASSETS: import('./lib/server/replays.ts').ReplayAssets;
		REPLAYS: import('./lib/server/replays.ts').ReplayBucket;
	};
}
