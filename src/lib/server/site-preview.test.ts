import { describe, expect, it, vi } from 'vitest';
import type { ReplayPutOptions } from './replays.ts';
import { dailyPreviewKey, dailySitePreview, type BrowserRun } from './site-preview.ts';

/** A PNG header carrying only the signature and IHDR dimensions, which is all the check reads. */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

const STATIC = new TextEncoder().encode('static og.png');
// 03:30 UTC on the 21st is still the evening of Oct 20 in New York.
const NOW = new Date('2026-10-21T03:30:00Z');

function bindings(stored: Map<string, Uint8Array> = new Map(), browser?: BrowserRun) {
	const puts: { key: string; options?: ReplayPutOptions }[] = [];
	const assets = vi.fn(async (input: RequestInfo | URL) => new URL(String(input)).pathname === '/og.png' ? new Response(STATIC) : new Response(null, { status: 404 }));
	return {
		puts,
		assets,
		env: {
			PUBLIC_ORIGIN: 'https://162-0.dev',
			ASSETS: { fetch: assets },
			BROWSER: browser,
			REPLAYS: {
				get: async (key: string) => stored.has(key) ? { body: stored.get(key)! } : null,
				put: async (key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions) => {
					puts.push({ key, options });
					stored.set(key, value as Uint8Array);
					return {};
				}
			}
		}
	};
}

describe('daily site preview', () => {
	it('serves the stored capture for the New York date without capturing again', async () => {
		const browser = { quickAction: vi.fn() };
		const stored = png(1200, 630);
		const { env } = bindings(new Map([[dailyPreviewKey('2026-10-20'), stored]]), browser);
		const preview = await dailySitePreview(env, NOW);
		expect(preview).toEqual({ bytes: stored, dated: true });
		expect(browser.quickAction).not.toHaveBeenCalled();
	});

	it('captures the stamped capture page on the day\'s first request and stores it once', async () => {
		const image = png(1200, 630);
		const browser = { quickAction: vi.fn(async () => new Response(image)) };
		const { env, puts } = bindings(new Map(), browser);
		const preview = await dailySitePreview(env, NOW);
		expect(preview).toEqual({ bytes: image, dated: true });
		expect(browser.quickAction).toHaveBeenCalledWith('screenshot', expect.objectContaining({
			url: 'https://162-0.dev/og-image?date=2026-10-20',
			selector: '[data-site-og]',
			viewport: { width: 1200, height: 630 }
		}));
		expect(puts).toEqual([{ key: 'shares/site/daily/2026-10-20.png', options: { httpMetadata: { contentType: 'image/png' }, onlyIf: { etagDoesNotMatch: '*' } } }]);
	});

	it('falls back to the static preview without storing when a capture fails or is the wrong size', async () => {
		for (const response of [new Response('rate limited', { status: 429 }), new Response(png(1200, 1600)), new Response('not a png')]) {
			const { env, puts } = bindings(new Map(), { quickAction: async () => response });
			const preview = await dailySitePreview(env, NOW);
			expect(preview.dated).toBe(false);
			expect(new TextDecoder().decode(preview.bytes)).toBe('static og.png');
			expect(puts).toEqual([]);
		}
	});

	it('serves the static preview where Browser Run is not bound', async () => {
		const { env, assets } = bindings();
		const preview = await dailySitePreview(env, NOW);
		expect(preview.dated).toBe(false);
		expect(assets).toHaveBeenCalledOnce();
	});
});
