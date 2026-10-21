import type { CardViewModel } from '#lib/cards/view-model.ts';
import type { LitCard } from '#lib/cards/surface/light-renderer.ts';
import type { Scene } from './scene.ts';
import { LIGHT_SWING } from '#lib/cards/tilt-math.ts';

export const LAB_VIDEO = { width: 1080, height: 1080, fps: 60, seconds: 6, frames: 360 } as const;
const CARD_WIDTH = 600;
const CARD_HEIGHT = 840;
const PREPARE_TIMEOUT = 30_000;

export interface VideoProgress {
	stage: 'preparing' | 'rendering' | 'finalizing';
	/** Frames submitted to the encoder, not a wall-clock estimate. */
	frames: number;
	total: number;
}

export interface VideoOptions {
	scene: Scene;
	/** The real selected era front. Required for front print, ignored for blank prints. */
	front: CardViewModel | null;
	signal?: AbortSignal;
	onProgress?: (progress: VideoProgress) => void;
}

export interface VideoResult {
	blob: Blob;
	/** Verified byte-for-byte on independently rendered raw RGBA endpoints, before lossy encoding. */
	endpointPixelsEqual: true;
	frames: 360;
	fps: 60;
	seconds: 6;
	width: 1080;
	height: 1080;
}

/** One closed figure eight. The clock travels smoothly forward and back, so every film closes too. */
export function videoPose(frame: number) {
	if (!Number.isInteger(frame) || frame < 0 || frame >= LAB_VIDEO.frames) throw new RangeError('Video frame must be between 0 and 359.');
	// Use the very same floating-point inputs at both ends, rather than sin(2π)'s small residual.
	const phase = frame === LAB_VIDEO.frames - 1 ? 0 : frame / (LAB_VIDEO.frames - 1);
	const angle = phase * Math.PI * 2;
	const rx = Math.sin(angle * 2) * Math.PI / 15;
	const ry = Math.sin(angle) * Math.PI / 10;
	return {
		rx, ry,
		filmTime: 3 * (1 - Math.cos(angle)),
		viewX: Math.sin(ry),
		viewY: -Math.sin(rx),
		lightX: 0.68 - ry * 180 / Math.PI / LIGHT_SWING,
		lightY: 0.24 + rx * 180 / Math.PI / LIGHT_SWING,
		// Orthographic projection of rotateY(ry) rotateX(rx), shared by ink and light.
		a: Math.cos(ry), b: 0, c: Math.sin(ry) * Math.sin(rx), d: Math.cos(rx)
	};
}

export function assertMatchingVideoEndpoints(first: Uint8ClampedArray, last: Uint8ClampedArray): void {
	if (first.length !== last.length) throw new Error('The video loop endpoints have different pixel dimensions.');
	for (let index = 0; index < first.length; index++) {
		if (first[index] !== last[index]) throw new Error(`The video loop did not close: raw pixel channel ${index} differs. No MP4 was saved.`);
	}
}

function pause(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, 16);
	return promise;
}

/** Bounds asset/font waits and lets Cancel release the mounted card without waiting for the network. */
function preparing<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	signal?.throwIfAborted();
	const { promise, resolve, reject } = Promise.withResolvers<T>();
	const timeout = setTimeout(() => finish(() => reject(new Error('Preparing the card video timed out. Check that its artwork and fonts loaded, then retry.'))), PREPARE_TIMEOUT);
	const abort = () => finish(() => reject(signal!.reason));
	const finish = (settle: () => void) => {
		clearTimeout(timeout);
		signal?.removeEventListener('abort', abort);
		settle();
	};
	signal?.addEventListener('abort', abort, { once: true });
	work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
	return promise;
}

/**
 * Offline export, never a screen recording. A private, fixed-size LabCard supplies the canonical
 * laid-out surfaces and actual ink once; every video frame then renders a chosen shader time and tilt.
 * Requires WebGL2 and a browser WebCodecs H.264 encoder at 1080 square / 60 fps. No audio track.
 */
export async function exportLabVideo({ scene: inputScene, front, signal, onProgress }: VideoOptions): Promise<VideoResult> {
	signal?.throwIfAborted();
	if (typeof document === 'undefined' || typeof VideoEncoder === 'undefined') {
		throw new Error('MP4 export requires a browser with WebCodecs H.264 encoding. Try current Chrome or Edge.');
	}
	if (inputScene.print === 'front' && !front) throw new Error('Wait for the era card artwork to load before exporting.');
	// Scene is plain serializable data, but its gradient may still be a Svelte state proxy.
	// Snapshot it now so later control edits cannot change a video already rendering.
	const scene = JSON.parse(JSON.stringify(inputScene)) as Scene;
	onProgress?.({ stage: 'preparing', frames: 0, total: LAB_VIDEO.frames });
	const [{ Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality, canEncodeVideo }, { LightRenderer }, { buildSurfaceMap }, { stableUnit }, { mount, unmount, tick }, { default: LabCard }, screenshot] = await Promise.all([
		import('mediabunny'), import('#lib/cards/surface/light-renderer.ts'), import('#lib/cards/surface/surface-map.ts'),
		import('#lib/cards/stable-unit.ts'), import('svelte'), import('./LabCard.svelte'), import('modern-screenshot')
	]);
	const quality = new Quality('high');
	if (!await canEncodeVideo('avc', { width: LAB_VIDEO.width, height: LAB_VIDEO.height, frameRate: LAB_VIDEO.fps, quality, latencyMode: 'quality' })) {
		throw new Error('This browser cannot encode H.264 at 1080 × 1080 and 60 fps. Try current Chrome or Edge on a device with H.264 encoding.');
	}
	signal?.throwIfAborted();
	const lightCanvas = document.createElement('canvas');
	const renderer = LightRenderer.create(lightCanvas);
	if (!renderer) throw new Error('MP4 export requires WebGL2 to render the selected card finish.');
	const host = document.createElement('div');
	host.inert = true;
	host.setAttribute('aria-hidden', 'true');
	host.style.cssText = `position:fixed;left:-${CARD_WIDTH * 4}px;top:0;width:${CARD_WIDTH}px;--lab-card-width:${CARD_WIDTH}px;container-type:inline-size;pointer-events:none;contain:layout paint;`;
	const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
	let component: Record<string, unknown> | undefined;
	let finalized = false;
	try {
		document.body.append(host);
		component = mount(LabCard, { target: host, props: { scene, front, drift: false } });
		await tick();
		const root = host.querySelector<HTMLElement>('.card');
		if (!root) throw new Error('The selected card did not render for export.');
		root.style.setProperty('transform', 'none', 'important');
		root.style.setProperty('box-shadow', 'none', 'important');
		for (const image of root.querySelectorAll('img')) image.loading = 'eager';
		await preparing(Promise.all([
			document.fonts.ready,
			...Array.from(root.querySelectorAll('img'), async image => {
				await image.decode();
				if (!image.naturalWidth) throw new Error('A card artwork image could not be decoded.');
			})
		]), signal);
		const fitDeadline = performance.now() + PREPARE_TIMEOUT;
		while (scene.print === 'front' && root.dataset.fitState !== 'settled') {
			signal?.throwIfAborted();
			if (root.dataset.fitState === 'failed' || performance.now() > fitDeadline) throw new Error('The era card text could not finish fitting for export.');
			await pause();
		}
		const map = buildSurfaceMap(root, scene.tier, scene.era, CARD_WIDTH / root.offsetWidth, scene.map);
		if (!renderer.add('video', map)) throw new Error('The card surface map does not fit this device’s graphics memory.');
		renderer.resize(CARD_WIDTH, CARD_HEIGHT, 1);
		await preparing(renderer.ready(), signal);
		const ink = await preparing(screenshot.domToCanvas(root, {
			width: CARD_WIDTH, height: CARD_HEIGHT, scale: 1, backgroundColor: null, timeout: PREPARE_TIMEOUT,
			style: { transform: 'none', boxShadow: 'none' },
			filter: node => !(node instanceof HTMLCanvasElement),
			fetch: { placeholderImage: () => { throw new Error('A card artwork asset could not be embedded in the video.'); } },
			onCloneEachNode: node => {
				if (node instanceof HTMLElement || node instanceof SVGElement) {
					node.style.animation = 'none';
					node.style.transition = 'none';
				}
			}
		}), signal);
		const canvas = document.createElement('canvas');
		canvas.width = LAB_VIDEO.width;
		canvas.height = LAB_VIDEO.height;
		const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
		if (!context) throw new Error('This browser could not create the video drawing surface.');
		const background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
		if (!background) throw new Error('The lab background colour is unavailable.');
		const card: LitCard = {
			key: 'video', originX: 0, originY: 0, axisXx: CARD_WIDTH, axisXy: 0, axisYx: 0, axisYy: CARD_HEIGHT,
			lightX: 0.68, lightY: 0.24, spotlight: 0.35,
			tier: scene.tier, era: scene.era, film: scene.film, plate: scene.plate, plateTuning: scene.plateTuning,
			pattern: stableUnit(root.dataset.identity ?? '', 41)
		};
		const source = new CanvasSource(canvas, { codec: 'avc', quality, latencyMode: 'quality', keyFrameInterval: 2 });
		output.addVideoTrack(source, { frameRate: LAB_VIDEO.fps });
		await output.start();
		let firstPixels: Uint8ClampedArray | undefined;
		for (let frame = 0; frame < LAB_VIDEO.frames; frame++) {
			signal?.throwIfAborted();
			const pose = videoPose(frame);
			Object.assign(card, { lightX: pose.lightX, lightY: pose.lightY, viewX: pose.viewX, viewY: pose.viewY });
			const options = { ...scene.light, time: pose.filmTime };
			const compileDeadline = performance.now() + PREPARE_TIMEOUT;
			while (!renderer.draw([card], options)) {
				signal?.throwIfAborted();
				if (performance.now() > compileDeadline) throw new Error('The selected finish shader could not compile for video export.');
				await pause();
			}
			if (lightCanvas.getContext('webgl2')!.isContextLost()) throw new Error('The graphics context was lost during video export. Please retry.');
			// Copy in the same task as the draw: WebGL may clear its drawing buffer after yielding.
			context.fillStyle = background;
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.save();
			context.translate(canvas.width / 2, canvas.height / 2);
			context.transform(pose.a, pose.b, pose.c, pose.d, 0, 0);
			context.translate(-CARD_WIDTH / 2, -CARD_HEIGHT / 2);
			context.beginPath();
			context.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_WIDTH * 0.018);
			context.clip();
			context.drawImage(ink, 0, 0, CARD_WIDTH, CARD_HEIGHT);
			context.drawImage(lightCanvas, 0, 0);
			context.restore();
			if (frame === 0) firstPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
			if (frame === LAB_VIDEO.frames - 1) assertMatchingVideoEndpoints(firstPixels!, context.getImageData(0, 0, canvas.width, canvas.height).data);
			await source.add(frame / LAB_VIDEO.fps, 1 / LAB_VIDEO.fps, { keyFrame: frame === 0 || frame === LAB_VIDEO.frames - 1 });
			onProgress?.({ stage: 'rendering', frames: frame + 1, total: LAB_VIDEO.frames });
			// Encoder backpressure need not yield a task on fast devices; keep Cancel responsive too.
			if (frame % 6 === 0) await pause();
		}
		signal?.throwIfAborted();
		source.close();
		onProgress?.({ stage: 'finalizing', frames: LAB_VIDEO.frames, total: LAB_VIDEO.frames });
		await output.finalize();
		finalized = true;
		signal?.throwIfAborted();
		if (!output.target.buffer) throw new Error('The encoder produced no MP4 data.');
		return { blob: new Blob([output.target.buffer], { type: 'video/mp4' }), endpointPixelsEqual: true, ...LAB_VIDEO };
	} finally {
		try {
			if (!finalized) await output.cancel();
		} finally {
			renderer.destroy();
			try {
				if (component) await unmount(component);
			} finally {
				host.remove();
			}
		}
	}
}
