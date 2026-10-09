import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Browser } from '@playwright/test';
import {
	TEST_CAPTURE_BRIDGE_PATH,
	TEST_CAPTURE_BRIDGE_TOKEN
} from './test-capture-contract.ts';

interface ScreenshotOptions {
	url: string;
	setExtraHTTPHeaders: Record<string, string>;
	selector: string;
	viewport: { width: number; height: number; deviceScaleFactor: 1 };
	screenshotOptions: { type: 'png' };
	gotoOptions: { waitUntil: 'networkidle0'; timeout: number };
	waitForSelector: { selector: string; visible: true; timeout: number };
	actionTimeout: number;
}

export interface CaptureBridge {
	origin: string;
	close(): Promise<void>;
}

function boundedTimeout(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 120_000;
}

function screenshotOptions(value: unknown, allowedOrigin: string): ScreenshotOptions {
	if (!value || typeof value !== 'object') throw new Error('Capture options are required');
	const options = value as Partial<ScreenshotOptions>;
	const viewport = options.viewport;
	const gotoOptions = options.gotoOptions;
	const waitForSelector = options.waitForSelector;
	const url = typeof options.url === 'string' ? new URL(options.url) : null;
	if (!url || url.origin !== allowedOrigin) throw new Error('Capture URL must use the test Worker origin');
	if (!viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) ||
		viewport.width < 1 || viewport.height < 1 || viewport.width > 2000 || viewport.height > 2000 ||
		viewport.deviceScaleFactor !== 1) throw new Error('Invalid capture viewport');
	if (!options.setExtraHTTPHeaders || typeof options.setExtraHTTPHeaders !== 'object' ||
		typeof options.selector !== 'string' || !options.selector ||
		options.screenshotOptions?.type !== 'png' || gotoOptions?.waitUntil !== 'networkidle0' ||
		!boundedTimeout(gotoOptions.timeout) || waitForSelector?.selector !== options.selector ||
		waitForSelector.visible !== true || !boundedTimeout(waitForSelector.timeout) ||
		!boundedTimeout(options.actionTimeout)) throw new Error('Invalid screenshot request');
	return options as ScreenshotOptions;
}

async function body(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let length = 0;
	for await (const chunk of request) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		length += bytes.byteLength;
		if (length > 64 * 1024) throw new Error('Capture request is too large');
		chunks.push(bytes);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

async function capture(browser: Browser, options: ScreenshotOptions): Promise<Buffer> {
	const context = await browser.newContext({
		viewport: { width: options.viewport.width, height: options.viewport.height },
		deviceScaleFactor: options.viewport.deviceScaleFactor,
		extraHTTPHeaders: options.setExtraHTTPHeaders
	});
	try {
		const page = await context.newPage();
		page.setDefaultTimeout(options.actionTimeout);
		await page.goto(options.url, { waitUntil: 'networkidle', timeout: options.gotoOptions.timeout });
		await page.waitForSelector(options.waitForSelector.selector, {
			state: 'visible',
			timeout: options.waitForSelector.timeout
		});
		return await page.locator(options.selector).screenshot({
			type: options.screenshotOptions.type,
			timeout: options.actionTimeout
		});
	} finally {
		await context.close();
	}
}

export async function startCaptureBridge(browser: Browser, allowedOrigin: string): Promise<CaptureBridge> {
	const server = createServer((request, response) => {
		void (async () => {
			if (request.method !== 'POST' || request.url !== TEST_CAPTURE_BRIDGE_PATH ||
				request.headers['x-test-capture-bridge-token'] !== TEST_CAPTURE_BRIDGE_TOKEN) {
				response.writeHead(404).end();
				return;
			}
			const png = await capture(browser, screenshotOptions(await body(request), allowedOrigin));
			response.writeHead(200, {
				'content-type': 'image/png',
				'content-length': String(png.byteLength),
				'cache-control': 'no-store'
			}).end(png);
		})().catch(error => {
			if (!response.headersSent) response.writeHead(503, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
			response.end(error instanceof Error ? error.message : 'Capture failed');
		});
	});
	const listening = Promise.withResolvers<void>();
	server.once('error', listening.reject);
	server.listen(0, '127.0.0.1', () => {
		server.off('error', listening.reject);
		listening.resolve();
	});
	await listening.promise;
	const address = server.address() as AddressInfo;
	return {
		origin: `http://127.0.0.1:${address.port}`,
		close() {
			const closed = Promise.withResolvers<void>();
			server.close(error => error ? closed.reject(error) : closed.resolve());
			return closed.promise;
		}
	};
}
