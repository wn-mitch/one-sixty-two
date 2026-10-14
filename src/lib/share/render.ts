import { mount, unmount } from 'svelte';
import { holdFilmMotion } from '../cards/surface/card-light.ts';
import { waitForShareCapture } from './capture.ts';
import ShareArtwork from './ShareArtwork.svelte';
import ShareOpenGraph from './ShareOpenGraph.svelte';
import { SHARE_DIMENSIONS, type PublishedFormat, type ShareRenderModel } from './types.ts';

/**
 * Drawings by model content and format. The session's publication and the Results panel's preview build
 * separate but identical models, so they share one drawing. Only the latest few seasons are kept.
 */
const drawn = new Map<string, Map<PublishedFormat, Promise<Blob>>>();
const DRAWN_SEASONS = 3;
const contentKeys = new WeakMap<ShareRenderModel, string>();

function contentKey(model: ShareRenderModel): string {
	let key = contentKeys.get(model);
	if (key === undefined) contentKeys.set(model, key = JSON.stringify(model));
	return key;
}

/**
 * Renders the share artwork off screen at its published pixel size and rasterizes it in this
 * browser. The published PNG is exactly what this device draws; nothing is recomputed elsewhere.
 * Each model content is drawn once per format; a failed drawing is forgotten so a retry draws again.
 */
export function renderSharePng(model: ShareRenderModel, format: PublishedFormat): Promise<Blob> {
	const key = contentKey(model);
	let formats = drawn.get(key);
	if (!formats) {
		drawn.set(key, formats = new Map());
		for (const stale of [...drawn.keys()].slice(0, -DRAWN_SEASONS)) drawn.delete(stale);
	}
	const cached = formats.get(format);
	if (cached) return cached;
	const drawing = draw(model, format);
	formats.set(format, drawing);
	drawing.catch(() => { if (formats.get(format) === drawing) formats.delete(format); });
	return drawing;
}

/**
 * Redraws Safari and Firefox get after the first draw, for embedded images that decode late.
 * Measured in WebKit: with three the PNG is pixel-identical to the library's full redraw sequence (38s
 * there), while none leaves late images out.
 */
const REDRAW_LIMIT = 3;

/** Main-thread work the clone may do before it lets the browser draw a frame. */
const SLICE_MS = 8;

/** Yields to the event loop so rendering and input run; `scheduler.yield` keeps this task's priority where supported. */
function yieldToBrowser(): Promise<void> {
	const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
	if (scheduler?.yield) return scheduler.yield();
	return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * A per-node clone hook that splits the clone, the longest step of a capture, into frame-sized slices,
 * so a capture running during season playback does not freeze it.
 */
function cloneInSlices(): () => Promise<void> | void {
	let sliceStart = performance.now();
	return () => {
		if (performance.now() - sliceStart < SLICE_MS) return;
		return yieldToBrowser().then(() => { sliceStart = performance.now(); });
	};
}

let styleProperties: string[] | undefined;
/**
 * The standard CSS properties the clone copies. Custom properties are already resolved into these, so
 * skipping them leaves the PNG pixel-identical while cutting the per-node style diff roughly in half.
 */
function standardStyleProperties(): string[] {
	return styleProperties ??= [...getComputedStyle(document.body)].filter(name => !name.startsWith('--'));
}

/**
 * Loads what every capture needs before a season result exists: the rasterizer module, the copied
 * style list, the card fonts, and the given images decoded. Failures are ignored; capture waits for
 * and reports them itself.
 */
export async function warmShareCapture(imageUrls: Iterable<string>): Promise<void> {
	standardStyleProperties();
	const fonts = document.fonts ? [...document.fonts].filter(face => face.status === 'unloaded').map(face => face.load().catch(() => undefined)) : [];
	const images = [...new Set(imageUrls)].map(url => {
		const image = new Image();
		image.src = url;
		return image.decode().catch(() => undefined);
	});
	await Promise.all([import('modern-screenshot'), ...fonts, ...images]);
}

/**
 * Probe time above which preparing captures during playback would drop frames. Calibrated in headless
 * Chromium on a fast laptop: 6–11ms at full speed, 11ms at 2× and 23ms at 4× CPU throttling.
 */
const SLOW_PROBE_MS = 16;
let slowDevice: boolean | undefined;

/**
 * Whether this device should leave all capture work until season playback ends: few cores or little
 * memory where the browser reports them, or a slow result on a small style-resolution probe shaped
 * like the clone's per-node work. Measured once and kept.
 */
export function slowCaptureDevice(): boolean {
	if (slowDevice !== undefined) return slowDevice;
	const { hardwareConcurrency, deviceMemory } = navigator as Navigator & { deviceMemory?: number };
	if ((hardwareConcurrency && hardwareConcurrency <= 4) || (deviceMemory && deviceMemory <= 4)) return slowDevice = true;
	return slowDevice = styleProbeMs() > SLOW_PROBE_MS;
}

function styleProbeMs(): number {
	const host = document.createElement('div');
	host.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;contain:layout paint;';
	for (let index = 0; index < 200; index++) {
		const node = host.appendChild(document.createElement('div'));
		node.style.cssText = `display:flex;padding:${index % 7}px;font:${600 + (index % 3) * 100} ${10 + (index % 5)}px sans-serif;transform:rotate(${index}deg)`;
		node.appendChild(document.createElement('span')).textContent = String(index);
	}
	const started = performance.now();
	document.body.append(host);
	const properties = standardStyleProperties().slice(0, 60);
	let sink = 0;
	for (const node of host.querySelectorAll('*')) {
		const style = getComputedStyle(node);
		for (const property of properties) sink += style.getPropertyValue(property).length;
	}
	const elapsed = performance.now() - started;
	host.remove();
	performance.mark('share:probe', { detail: { ms: elapsed, sink } });
	return elapsed;
}

/** Hidden preloads that only make capture wait for every image; the clone leaves them out. */
function capturedNode(node: Node): boolean {
	return !(node instanceof HTMLElement && node.classList.contains('expected-images'));
}

/** The longest any one capture stage may take before the capture fails. */
const STAGE_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('The share image took too long to draw.')), ms);
	});
	return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/** Resolves when the browser is idle (or after a second at most), so each capture stage starts between frames. */
function idleMoment(): Promise<void> {
	return new Promise(resolve => {
		if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 1000 });
		else setTimeout(resolve, 0);
	});
}

let stageQueue: Promise<unknown> = Promise.resolve();
/**
 * Runs one capture stage at a time across every drawing, each starting at an idle moment with animated
 * holo films held still, so concurrent drawings never stack their main-thread work.
 */
function stage<T>(work: () => Promise<T>): Promise<T> {
	const run = stageQueue.then(async () => {
		await idleMoment();
		const releaseFilms = holdFilmMotion();
		try { return await withTimeout(work(), STAGE_TIMEOUT_MS); } finally { releaseFilms(); }
	});
	stageQueue = run.catch(() => undefined);
	return run;
}

let rasterHolds = 0;
let rasterOpen: PromiseWithResolvers<void> | null = null;
/**
 * Defers rasterizing, the one capture step that cannot be split into frame-sized slices, until every hold
 * is released. Season playback holds it, so captures prepare during playback and draw once it ends.
 */
export function holdRasterization(): () => void {
	rasterHolds++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (--rasterHolds === 0) {
			rasterOpen?.resolve();
			rasterOpen = null;
		}
	};
}

/** Resolves once no `holdRasterization` hold is active. */
export function untilRasterAllowed(): Promise<void> {
	return rasterAllowed();
}

function rasterAllowed(): Promise<void> {
	if (!rasterHolds) return Promise.resolve();
	rasterOpen ??= Promise.withResolvers<void>();
	return rasterOpen.promise;
}

/**
 * Captures in two stages. Preparing mounts the artwork off screen, waits until it is safe to capture,
 * and clones it into a self-contained SVG in frame-sized slices. Rasterizing serializes that SVG and draws
 * and encodes it in one long step, so it waits for `holdRasterization` holds to clear.
 */
async function draw(model: ShareRenderModel, format: PublishedFormat): Promise<Blob> {
	// Phase marks (start → hydrated → fonts → images → fitted → ready → prepared → drawn) time captures in a profiler.
	const mark = (phase: string) => { performance.mark(`share:${format}:${phase}`); };
	mark('start');
	const prepared = await stage(() => prepare(model, format, mark));
	mark('prepared');
	await untilRasterAllowed();
	const blob = await stage(() => rasterize(prepared, format));
	mark('drawn');
	return blob;
}

interface PreparedCapture {
	svg: SVGElement;
	/** Late-image redraws Safari and Firefox need for this SVG. */
	redraws: number;
}

async function prepare(model: ShareRenderModel, format: PublishedFormat, mark: (phase: string) => void): Promise<PreparedCapture> {
	const { width, height } = SHARE_DIMENSIONS[format];
	const host = document.createElement('div');
	host.setAttribute('aria-hidden', 'true');
	host.inert = true;
	// The host is the artwork's query container, so its cqw lengths resolve against the frame, not this device's viewport.
	host.style.cssText = `position:fixed;left:-${width * 4}px;top:0;width:${width}px;container-type:inline-size;pointer-events:none;contain:layout paint;`;
	document.body.append(host);
	// Lazy images never load outside the viewport, so every image in the capture host loads eagerly.
	const eager = (node: ParentNode) => node.querySelectorAll('img[loading="lazy"]').forEach(image => { (image as HTMLImageElement).loading = 'eager'; });
	const observer = new MutationObserver(() => eager(host));
	observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['loading'] });
	const component = format === 'og'
		? mount(ShareOpenGraph, { target: host, props: { model } })
		: mount(ShareArtwork, { target: host, props: { model, format } });
	eager(host);
	try {
		const root = host.querySelector<HTMLElement>('[data-share-artwork]');
		if (!root) throw new Error('The share artwork did not render.');
		await waitForShareCapture(root, format);
		mark('ready');
		const { createContext, domToForeignObjectSvg } = await import('modern-screenshot');
		const context = await createContext(root, {
			width, height, scale: 1, type: 'image/png', backgroundColor: null, timeout: 15_000, autoDestruct: true,
			filter: capturedNode,
			includeStyleProperties: standardStyleProperties(),
			onCloneEachNode: cloneInSlices()
		});
		const svg = await domToForeignObjectSvg(context);
		// Safari and Firefox redraw the SVG once per embedded image, 100ms+ apart, so late-decoded images
		// appear; with every card's photo and mark that is hundreds of redraws. A few are enough.
		return { svg, redraws: Math.min(context.drawImageCount, REDRAW_LIMIT) };
	} finally {
		observer.disconnect();
		await unmount(component);
		host.remove();
	}
}

/** Serializes, draws and encodes a prepared SVG through the library's own canvas path. */
async function rasterize({ svg, redraws }: PreparedCapture, format: PublishedFormat): Promise<Blob> {
	const { width, height } = SHARE_DIMENSIONS[format];
	const { createContext, domToBlob } = await import('modern-screenshot');
	const context = await createContext(svg, {
		width, height, scale: 1, type: 'image/png', backgroundColor: null, timeout: 15_000, autoDestruct: true,
		// A self-contained SVG is drawn as is; the library cloning it again would mean an external reference slipped in.
		onCloneNode: () => { throw new Error('The share image referenced an external resource.'); }
	});
	context.drawImageCount = redraws;
	const blob = await domToBlob(context);
	if (!blob || blob.type !== 'image/png') throw new Error('This browser could not draw the share image.');
	return blob;
}
