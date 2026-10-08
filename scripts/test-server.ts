import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { unstable_startWorker } from 'wrangler';
import { startCaptureBridge } from './test-capture-bridge.ts';
import type { CaptureBridge } from './test-capture-bridge.ts';
import { TEST_SHARE_CAPTURE_TOKEN } from './test-capture-contract.ts';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4162);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PLAYWRIGHT_PORT');

interface TestWorker {
	ready: Promise<void>;
	url: Promise<URL>;
	dispose(): Promise<void>;
}

const root = process.cwd();
const configPath = resolve(root, `.wrangler.browser-suite-${process.pid}.json`);
let browser: Browser | null = null;
let bridge: CaptureBridge | null = null;
let worker: TestWorker | null = null;
let stopPromise: Promise<void> | null = null;

function stop(): Promise<void> {
	if (stopPromise) return stopPromise;
	stopPromise = (async () => {
		const results = await Promise.allSettled([
			worker?.dispose(),
			bridge?.close(),
			browser?.close(),
			rm(configPath, { force: true })
		]);
		const failure = results.find(result => result.status === 'rejected');
		if (failure?.status === 'rejected') throw failure.reason;
	})();
	return stopPromise;
}

function terminate(reason: unknown, exitCode: number): void {
	if (reason) console.error(reason);
	void stop().then(
		() => process.exit(exitCode),
		error => { console.error(error); process.exit(1); }
	);
}

for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'] as const) process.once(signal, () => terminate(null, 0));
process.once('uncaughtException', error => terminate(error, 1));
process.once('unhandledRejection', error => terminate(error, 1));

try {
	const origin = `http://127.0.0.1:${port}`;
	browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
	bridge = await startCaptureBridge(browser, origin);
	await writeFile(configPath, JSON.stringify({
		$schema: 'node_modules/wrangler/config-schema.json',
		name: `162-zero-browser-suite-${process.pid}`,
		main: 'scripts/test-browser-worker.ts',
		compatibility_date: '2026-10-05',
		compatibility_flags: ['nodejs_als'],
		assets: { binding: 'ASSETS', directory: '.svelte-kit/cloudflare' },
		vars: {
			PUBLIC_ORIGIN: origin,
			SHARE_CAPTURE_TOKEN: TEST_SHARE_CAPTURE_TOKEN,
			TEST_CAPTURE_BRIDGE_ORIGIN: bridge.origin,
			BROWSER: {}
		},
		r2_buckets: [{ binding: 'REPLAYS', bucket_name: `browser-suite-${process.pid}` }]
	}));
	// Tests consume an immutable build. Watching thousands of image assets can
	// exhaust macOS file handles before workerd starts; persistence is isolated too.
	worker = await unstable_startWorker({
		config: configPath,
		envFiles: [],
		dev: {
			remote: false,
			watch: false,
			persist: false,
			server: { hostname: '127.0.0.1', port }
		}
	});
	await worker.ready;
	console.log(`[test-server] Ready at ${await worker.url}`);
} catch (error) {
	await stop();
	throw error;
}
