import application from '../.svelte-kit/cloudflare/_worker.js';
import { env as moduleEnv } from 'cloudflare:workers';
import {
	TEST_CAPTURE_BRIDGE_PATH,
	TEST_CAPTURE_BRIDGE_TOKEN
} from './test-capture-contract.ts';

interface TestWorkerEnv {
	ASSETS: Fetcher;
	REPLAYS: R2Bucket;
	PUBLIC_ORIGIN: string;
	SHARE_CAPTURE_TOKEN: string;
	TEST_CAPTURE_BRIDGE_ORIGIN: string;
	BROWSER?: unknown;
}

function captureBinding(origin: string) {
	const bridge = new URL(TEST_CAPTURE_BRIDGE_PATH, origin);
	if (bridge.protocol !== 'http:' || bridge.hostname !== '127.0.0.1') {
		throw new Error('The browser test capture bridge must be loopback-only');
	}
	return {
		async quickAction(action: string, options: unknown): Promise<Response> {
			if (action !== 'screenshot') return new Response('Unsupported capture action', { status: 400 });
			return fetch(bridge, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-test-capture-bridge-token': TEST_CAPTURE_BRIDGE_TOKEN
				},
				body: JSON.stringify(options)
			});
		}
	};
}

export default {
	fetch(request: Request, env: TestWorkerEnv): Promise<Response> {
		const BROWSER = captureBinding(env.TEST_CAPTURE_BRIDGE_ORIGIN);
		const forwarded = { ...env, BROWSER };
		// SvelteKit server modules use cloudflare:workers env while the generated
		// Worker also accepts an explicit environment. Keep both views identical.
		if (!Reflect.set(moduleEnv, 'BROWSER', BROWSER)) {
			throw new Error('Could not install the browser test capture binding');
		}
		return application.fetch(request, forwarded);
	}
};
