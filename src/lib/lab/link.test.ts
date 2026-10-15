import { describe, expect, it } from 'vitest';
import { START } from './controls.ts';
import { decodeLink, encodeLink, labUrl, saveLabLink, type LinkState } from './link.ts';

const STATE: LinkState = { setup: structuredClone(START), stagger: null, zoom: 1 };

describe('semantic foil lab links', () => {
	it('rejects an explicitly incompatible link version', () => {
		const encoded = encodeLink(STATE);
		const decoded = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))) as Record<string, unknown>;
		decoded.v = 2;
		const bytes = new TextEncoder().encode(JSON.stringify(decoded));
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		const incompatible = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
		expect(decodeLink(incompatible)).toBeNull();
	});

	it('returns a short link and keeps a deterministic full-link fallback', async () => {
		const fallback = labUrl(STATE, 'https://162-0.dev');
		const saved = await saveLabLink(STATE, {
			origin: 'https://162-0.dev',
			fetcher: async () => new Response(JSON.stringify({ url: '/lab/s/Ab12Cd34' }), { status: 201 })
		});
		expect(saved).toEqual({ url: 'https://162-0.dev/lab/s/Ab12Cd34', fallback, short: true });
	});

	it('exposes the full link when short-link storage fails', async () => {
		const fallback = labUrl(STATE, 'https://162-0.dev');
		await expect(saveLabLink(STATE, {
			origin: 'https://162-0.dev',
			fetcher: async () => new Response(JSON.stringify({ message: 'Lab link storage is unavailable. Please retry.' }), { status: 503 })
		})).rejects.toMatchObject({ status: 503, fallback });
	});
});
