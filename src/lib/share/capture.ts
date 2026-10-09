import { SHARE_DIMENSIONS, type ShareFormat } from './types.ts';

export interface ShareCaptureOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DIMENSION_TOLERANCE = 0.5;

function nextFrame(signal?: AbortSignal): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	if (signal?.aborted) {
		reject(signal.reason ?? new DOMException('Capture readiness aborted', 'AbortError'));
		return promise;
	}
	const frame = requestAnimationFrame(() => {
		signal?.removeEventListener('abort', abort);
		resolve();
	});
	function abort(): void {
		cancelAnimationFrame(frame);
		reject(signal?.reason ?? new DOMException('Capture readiness aborted', 'AbortError'));
	}
	signal?.addEventListener('abort', abort, { once: true });
	return promise;
}

async function beforeDeadline<T>(source: Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
	const remaining = deadline - performance.now();
	if (remaining <= 0) throw new Error('Capture readiness timed out');
	if (signal?.aborted) throw signal.reason ?? new DOMException('Capture readiness aborted', 'AbortError');
	const { promise, resolve, reject } = Promise.withResolvers<T>();
	const timer = window.setTimeout(() => {
		signal?.removeEventListener('abort', abort);
		reject(new Error('Capture readiness timed out'));
	}, remaining);
	function abort(): void {
		window.clearTimeout(timer);
		reject(signal?.reason ?? new DOMException('Capture readiness aborted', 'AbortError'));
	}
	signal?.addEventListener('abort', abort, { once: true });
	source.then(
		value => {
			window.clearTimeout(timer);
			signal?.removeEventListener('abort', abort);
			resolve(value);
		},
		error => {
			window.clearTimeout(timer);
			signal?.removeEventListener('abort', abort);
			reject(error);
		}
	);
	return await promise;
}

async function waitUntil(predicate: () => boolean, deadline: number, signal?: AbortSignal): Promise<void> {
	while (!predicate()) {
		if (performance.now() >= deadline) throw new Error('Capture readiness timed out');
		await beforeDeadline(nextFrame(signal), deadline, signal);
	}
}

async function decodeImages(root: HTMLElement, deadline: number, signal?: AbortSignal): Promise<void> {
	const images = [...root.querySelectorAll<HTMLImageElement>('img')];
	await beforeDeadline(Promise.all(images.map(async image => {
		try {
			// `complete` only means the resource finished loading. Always await
			// decode so capture cannot race the browser's asynchronous image
			// decode/upload work when a resource came from cache.
			await image.decode();
		} catch {
			throw new Error('A required share image failed to decode');
		}
		if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new Error('A required share image failed to load');
	})).then(() => undefined), deadline, signal);
}

function assertDimensions(root: HTMLElement, format: ShareFormat): void {
	const expected = SHARE_DIMENSIONS[format];
	const bounds = root.getBoundingClientRect();
	if (Math.abs(bounds.width - expected.width) > DIMENSION_TOLERANCE ||
		Math.abs(bounds.height - expected.height) > DIMENSION_TOLERANCE) {
		throw new Error(`Share artwork must render at ${expected.width} by ${expected.height} pixels`);
	}
	if (root.scrollWidth > Math.ceil(bounds.width) || root.scrollHeight > Math.ceil(bounds.height)) {
		throw new Error('Share artwork exceeds its capture bounds');
	}
}

function fittingIsSettled(root: HTMLElement, format: ShareFormat): boolean {
	const expectedCards = format === 'wide' ? 9 : 14;
	const captureCards = root.querySelectorAll<HTMLElement>('[data-card][data-capture=\"true\"]');
	const fittedRoots = [...root.querySelectorAll<HTMLElement>('[data-card]')];
	return captureCards.length === expectedCards && fittedRoots.length >= captureCards.length &&
		fittedRoots.every(card => card.dataset.fitState === 'settled');
}

function assertNoFitOverflow(root: HTMLElement): void {
	if (root.querySelector('[data-fit-state="failed"]')) throw new Error('Share card fitting failed');
	if (root.querySelector('[data-overflow="1"]')) throw new Error('Share card text exceeds its fitted bounds');
}

function assertCaptureCardsAreFlat(root: HTMLElement): void {
	const cards = root.querySelectorAll<HTMLElement>('[data-card][data-capture="true"]');
	for (const card of cards) {
		const nodes = [card, ...card.querySelectorAll<HTMLElement>('*')];
		for (const node of nodes) {
			const style = getComputedStyle(node);
			if (style.transformStyle === 'preserve-3d' || style.transform.startsWith('matrix3d(')) {
				throw new Error('Share card capture must use a flat compositing tree');
			}
		}
	}
}

function failureMessage(error: unknown): string {
	if (error instanceof DOMException && error.name === 'AbortError') return 'Capture readiness aborted';
	return error instanceof Error && error.message ? error.message : 'Share capture readiness failed';
}

/**
 * Resolve only when the hydrated artwork is safe for an immutable screenshot.
 * The authenticated capture route calls this after binding the artwork root.
 */
export async function waitForShareCapture(
	root: HTMLElement,
	format: ShareFormat,
	options: ShareCaptureOptions = {}
): Promise<void> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid capture readiness timeout');
	root.dataset.shareReady = 'false';
	root.dataset.shareState = 'waiting';
	delete root.dataset.shareFailure;
	const deadline = performance.now() + timeoutMs;
	try {
		if (!root.matches('[data-share-artwork]') || root.dataset.shareFormat !== format) {
			throw new Error('Capture root does not match the requested share format');
		}
		await waitUntil(() => root.dataset.shareHydrated === 'true', deadline, options.signal);
		if (document.fonts) {
			await beforeDeadline(document.fonts.ready.then(() => undefined), deadline, options.signal);
			for (const font of document.fonts) {
				if (font.status === 'error') throw new Error('A required share font failed to load');
			}
		}
		await decodeImages(root, deadline, options.signal);
		await waitUntil(() => fittingIsSettled(root, format), deadline, options.signal);
		assertNoFitOverflow(root);
		assertDimensions(root, format);
		await beforeDeadline(nextFrame(options.signal), deadline, options.signal);
		await beforeDeadline(nextFrame(options.signal), deadline, options.signal);
		assertNoFitOverflow(root);
		assertDimensions(root, format);
		if (!fittingIsSettled(root, format)) throw new Error('Share card fitting changed before capture');
		assertCaptureCardsAreFlat(root);
		root.dataset.shareState = 'ready';
		root.dataset.shareReady = 'true';
	} catch (error) {
		root.dataset.shareState = 'failed';
		root.dataset.shareReady = 'false';
		root.dataset.shareFailure = failureMessage(error);
		throw error;
	}
}
