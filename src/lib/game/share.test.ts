import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from './types.ts';
import type { SeasonResult } from '../sim/types.ts';
import type { SharePublication } from '../share/types.ts';
import {
	ShareCapabilityError,
	beginCopyPublishedImage,
	copyShareLink,
	downloadPublishedImage,
	isShareIncompatibility,
	prepareSharePublication,
	requestNativeShare,
	storeReplay,
	validateSharePublication
} from './share.ts';
import { Session } from './session.svelte.ts';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const replayId = 'abcdefghijklmnopqrstuv';
const origin = 'https://play.example';
const record = {
	wins: 118,
	losses: 44,
	firstLoss: 3,
	longestWinningStreak: 12,
	runsFor: 811,
	runsAgainst: 622
};

function publication(): SharePublication {
	return {
		schemaVersion: 1,
		replayId,
		replayUrl: `${origin}/r/${replayId}`,
		modelDigest: 'a'.repeat(64),
		record,
		images: {
			scorecard: { url: `${origin}/api/replays/${replayId}/share/scorecard.png`, width: 1080, height: 1350, sha256: 'b'.repeat(64) },
			diamond: { url: `${origin}/api/replays/${replayId}/share/diamond.png`, width: 1080, height: 1350, sha256: 'c'.repeat(64) },
			wide: { url: `${origin}/api/replays/${replayId}/share/wide.png`, width: 1200, height: 630, sha256: 'd'.repeat(64) }
		}
	};
}

function draft(): Draft {
	return {
		schemaVersion: 5,
		dataVersion: 'data-version',
		modelVersion: 'contact-v1',
		rulesVersion: 'classic-v1',
		seed: 162,
		homeStadium: { id: 'F00-2025', version: 'synthetic-F00' },
		picks: [],
		battingOrder: [],
		starterOrder: [],
		actions: [],
		currentRoll: null
	};
}

function sessionWithResult(): Session {
	const session = new Session();
	session.draft = draft();
	session.result = {} as SeasonResult;
	session.loading = false;
	return session;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('explicit replay publication', () => {
	it('stores a replay without starting paid capture, then prepares only on the explicit publication request', async () => {
		const requests: string[] = [];
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			requests.push(url);
			if (url.endsWith('/api/replays')) return Response.json({ id: replayId }, { status: 201 });
			return Response.json(publication());
		});

		const stored = await storeReplay(draft(), origin, fetcher);
		expect(stored).toEqual({ id: replayId, replayUrl: `${origin}/r/${replayId}` });
		expect(requests).toEqual([`${origin}/api/replays`]);

		await expect(prepareSharePublication(stored.id, origin, fetcher)).resolves.toEqual(publication());
		expect(requests).toEqual([
			`${origin}/api/replays`,
			`${origin}/api/replays/${replayId}/share`
		]);
	});

	it('preserves the stored replay across a failed preparation retry', async () => {
		let prepareAttempts = 0;
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/api/replays')) return Response.json({ id: replayId }, { status: 201 });
			prepareAttempts++;
			return prepareAttempts === 1
				? Response.json({ message: 'Capture unavailable.' }, { status: 503 })
				: Response.json(publication());
		});

		const stored = await storeReplay(draft(), origin, fetcher);
		await expect(prepareSharePublication(stored.id, origin, fetcher)).rejects.toThrow('Capture unavailable.');
		await expect(prepareSharePublication(stored.id, origin, fetcher)).resolves.toEqual(publication());
		expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/api/replays'))).toHaveLength(1);
		expect(prepareAttempts).toBe(2);
	});

	it('classifies current-model incompatibility and rejects forged publication metadata', async () => {
		const incompatible = vi.fn(async () => Response.json({ message: 'Replay is incompatible with this dataset.' }, { status: 409 }));
		const error = await prepareSharePublication(replayId, origin, incompatible).catch(value => value);
		expect(isShareIncompatibility(error)).toBe(true);

		const forged = publication();
		forged.images.wide.width = 1080;
		expect(() => validateSharePublication(forged, replayId, origin)).toThrow('invalid publication');
	});
});

describe('browser action boundaries', () => {
	it('starts the PNG clipboard write in the original gesture and resolves it with published bytes', async () => {
		let resolvePublication!: (value: SharePublication) => void;
		const pending = new Promise<SharePublication>(resolve => { resolvePublication = resolve; });
		let copied: Blob | undefined;
		class FakeClipboardItem {
			constructor(readonly items: Record<string, Promise<Blob>>) {}
		}
		const write = vi.fn(async (items: FakeClipboardItem[]) => {
			copied = await items[0].items['image/png'];
		});
		const fetcher = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), {
			headers: { 'content-type': 'image/png' }
		}));

		const copying = beginCopyPublishedImage(pending, 'scorecard', {
			fetch: fetcher,
			clipboard: { write } as unknown as Pick<Clipboard, 'write'>,
			ClipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem
		});
		expect(write).toHaveBeenCalledTimes(1);
		expect(fetcher).not.toHaveBeenCalled();
		resolvePublication(publication());
		await copying;
		expect(fetcher).toHaveBeenCalledWith(publication().images.scorecard.url, { headers: { accept: 'image/png' } });
		expect(copied?.type).toBe('image/png');
	});

	it('offers honest capability failures instead of substituting image copy with link copy', async () => {
		expect(() => beginCopyPublishedImage(Promise.resolve(publication()), 'diamond', {
			fetch: vi.fn(),
			clipboard: undefined,
			ClipboardItem: undefined
		})).toThrow(ShareCapabilityError);
		await expect(copyShareLink(publication().replayUrl, undefined)).rejects.toMatchObject({ capability: 'text-clipboard' });
	});

	it('downloads the exact stored PNG bytes with a deterministic filename', async () => {
		const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
		const saved = vi.fn();
		await downloadPublishedImage(publication(), 'wide', {
			fetch: vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png' } })),
			save: saved
		});
		expect(saved).toHaveBeenCalledTimes(1);
		expect(saved.mock.calls[0][0]).toBeInstanceOf(Blob);
		expect(saved.mock.calls[0][1]).toBe('162-0-118-44-wide.png');
		expect(new Uint8Array(await saved.mock.calls[0][0].arrayBuffer())).toEqual(bytes);
	});

	it('invokes native share synchronously and preserves AbortError as cancellation', async () => {
		let invoked = false;
		const canceled = new DOMException('Canceled', 'AbortError');
		const sharing = requestNativeShare(publication(), data => {
			invoked = true;
			expect(data.url).toBe(publication().replayUrl);
			return Promise.reject(canceled);
		});
		expect(invoked).toBe(true);
		await expect(sharing).rejects.toBe(canceled);
	});
});

describe('Session share orchestration', () => {
	it('prepares once, publishes the link only after wide artwork exists, and reuses the immutable publication', async () => {
		const writeText = vi.fn(async () => undefined);
		const requests: string[] = [];
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			requests.push(url);
			return url.endsWith('/api/replays')
				? Response.json({ id: replayId }, { status: 201 })
				: Response.json(publication());
		}));
		const session = sessionWithResult();

		const first = session.share('copy-link');
		expect(session.shareLink).toBe('');
		await first;
		expect(session.shareLink).toBe(publication().replayUrl);
		expect(session.publication).toEqual(publication());
		await session.share('copy-link');

		expect(requests).toEqual([
			`${origin}/api/replays`,
			`${origin}/api/replays/${replayId}/share`
		]);
		expect(writeText).toHaveBeenCalledTimes(2);
	});

	it('coalesces rapid repeat gestures into one local preparation request', async () => {
		let releaseStore!: (response: Response) => void;
		const stored = new Promise<Response>(resolve => { releaseStore = resolve; });
		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).endsWith('/api/replays')) return stored;
			return Response.json(publication());
		});
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } });
		vi.stubGlobal('fetch', fetcher);
		const session = sessionWithResult();

		const first = session.share('copy-link');
		const duplicate = session.share('copy-link');
		await duplicate;
		expect(fetcher).toHaveBeenCalledTimes(1);
		releaseStore(Response.json({ id: replayId }, { status: 201 }));
		await first;
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(session.publication).toEqual(publication());
	});

	it('retries failed capture with the already stored replay', async () => {
		let preparations = 0;
		const requests: string[] = [];
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } });
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			requests.push(url);
			if (url.endsWith('/api/replays')) return Response.json({ id: replayId }, { status: 201 });
			preparations++;
			return preparations === 1
				? Response.json({ message: 'Capture unavailable.' }, { status: 503 })
				: Response.json(publication());
		}));
		const session = sessionWithResult();

		await session.share('copy-link');
		expect(session.publication).toBeNull();
		expect(session.shareStatus).toContain('Capture unavailable.');
		await session.share('copy-link');
		expect(session.publication).toEqual(publication());
		expect(requests.filter(url => url.endsWith('/api/replays'))).toHaveLength(1);
		expect(preparations).toBe(2);
	});

	it('requires a second native-share gesture after preparation and treats cancellation honestly', async () => {
		const canceled = new DOMException('Canceled', 'AbortError');
		const nativeShare = vi.fn(async () => { throw canceled; });
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() }, share: nativeShare });
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/api/replays')
			? Response.json({ id: replayId }, { status: 201 })
			: Response.json(publication())));
		const session = sessionWithResult();

		await session.share('challenge');
		expect(nativeShare).not.toHaveBeenCalled();
		expect(session.nativeShareReady).toBe(true);
		expect(session.shareStatus).toContain('Tap Challenge a friend again');

		await session.share('challenge');
		expect(nativeShare).toHaveBeenCalledTimes(1);
		expect(session.shareStatus).toBe('Share canceled.');
	});

	it('falls back from unsupported native sharing to copying the published link', async () => {
		const writeText = vi.fn(async () => undefined);
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/api/replays')
			? Response.json({ id: replayId }, { status: 201 })
			: Response.json(publication())));
		const session = sessionWithResult();

		await session.share('challenge');
		expect(writeText).toHaveBeenCalledWith(publication().replayUrl);
		expect(session.shareStatus).toContain('Replay link copied instead');
	});

	it('exposes a selected-link fallback when clipboard permission is denied', async () => {
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new DOMException('Denied', 'NotAllowedError'); }) } });
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/api/replays')
			? Response.json({ id: replayId }, { status: 201 })
			: Response.json(publication())));
		const session = sessionWithResult();

		await session.share('copy-link');
		expect(session.textCopyFallback).toBe(true);
		expect(session.shareLink).toBe(publication().replayUrl);
		expect(session.shareStatus).toContain('Select and copy');
	});

	it('prepares an unsupported image-copy request and directs the user to the cached download instead', async () => {
		const requests: string[] = [];
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
		vi.stubGlobal('ClipboardItem', undefined);
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			requests.push(url);
			return url.endsWith('/api/replays')
				? Response.json({ id: replayId }, { status: 201 })
				: Response.json(publication());
		}));
		const session = sessionWithResult();

		await session.share('copy-image', 'diamond');
		expect(session.publication).toEqual(publication());
		expect(session.imageDownloadFallback).toBe(true);
		expect(session.shareStatus).toContain('Download PNG');
		expect(requests).toEqual([
			`${origin}/api/replays`,
			`${origin}/api/replays/${replayId}/share`
		]);
	});

	it('turns a publication 409 into the same incompatible new-draft state', async () => {
		vi.stubGlobal('location', { origin });
		vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/api/replays')
			? Response.json({ id: replayId }, { status: 201 })
			: Response.json({ message: 'Replay is incompatible with this dataset.' }, { status: 409 })));
		const session = sessionWithResult();

		await session.share('copy-link');
		expect(session.incompatible).toBe(true);
		expect(session.error).toBe('Replay is incompatible with this dataset.');
		expect(session.shareLink).toBe('');
		expect(session.shareStatus).toContain('Start a new draft');
	});
});
