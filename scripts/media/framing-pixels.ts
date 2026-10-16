import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import type { Page } from 'playwright';

type Rect = { x: number; y: number; width: number; height: number };
export interface PixelGeometry {
	mask: Rect;
	shape: string;
	labels: Array<{ layer: string; rect: Rect; shape: string }>;
	ignoredInk: string[];
}
export interface PixelEvidence {
	version: 2 | 3;
	pixels: string;
	geometry: PixelGeometry;
	jpegChecksum: string;
	baselineIdentical: boolean;
}
export const checksum = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** Exact decoded pixels, including frame artwork inside the photo's bounding rectangle. */
export function photoPixelHash(rgba: Buffer, sheetWidth: number, tile: Rect, geometry: PixelGeometry): string {
	const left = Math.floor(tile.x + geometry.mask.x), top = Math.floor(tile.y + geometry.mask.y);
	const right = Math.ceil(tile.x + geometry.mask.x + geometry.mask.width);
	const bottom = Math.ceil(tile.y + geometry.mask.y + geometry.mask.height);
	if (left < 0 || top < 0 || right > sheetWidth || bottom * sheetWidth * 4 > rgba.length) throw new Error('Photo mask outside screenshot');
	const digest = createHash('sha256').update(JSON.stringify(geometry));
	for (let y = top; y < bottom; y++) digest.update(rgba.subarray((y * sheetWidth + left) * 4, (y * sheetWidth + right) * 4));
	return digest.digest('hex');
}

/** Hide only season ink with a fully opaque containing background. Layout is unchanged.
 * The original screenshot is saved before this call; this second render is comparison evidence.
 */
export async function capturePhotoPixels(page: Page, width: number, path?: string): Promise<Array<{ pixels: string; geometry: PixelGeometry }>> {
	const boxes = await page.locator('[data-audit-grid] .tile').evaluateAll(tiles => tiles.map(tile => {
		const outer = tile.getBoundingClientRect();
		const rect = (element: Element) => {
			const r = element.getBoundingClientRect();
			return { x: Math.round((r.x - outer.x) * 1024) / 1024, y: Math.round((r.y - outer.y) * 1024) / 1024,
				width: r.width, height: r.height };
		};
		const shape = (element: Element) => {
			const s = getComputedStyle(element);
			return JSON.stringify([s.borderRadius, s.clipPath, s.transform, s.backgroundColor, s.backgroundImage, s.borderWidth]);
		};
		const mask = tile.querySelector('[data-layer="photo.mask"]');
		if (!mask) throw new Error('Missing production photo mask');
		const labels: PixelGeometry['labels'] = [];
		const ignoredInk: string[] = [];
		for (const ink of tile.querySelectorAll<HTMLElement>('[data-layer="season.year"], [data-layer="season.position"]')) {
			const inkRect = ink.getBoundingClientRect();
			let background = ink.parentElement;
			while (background && background !== tile) {
				const s = getComputedStyle(background), r = background.getBoundingClientRect();
				const opaque = /^rgb\([^/]+\)$/.test(s.backgroundColor) && !s.backgroundColor.startsWith('rgba');
				if (opaque && s.opacity === '1' && inkRect.left >= r.left && inkRect.right <= r.right && inkRect.top >= r.top && inkRect.bottom <= r.bottom) break;
				background = background.parentElement;
			}
			if (!background || background === tile || !background.getAttribute('data-layer')?.startsWith('season.')) continue;
			// Browser hit testing honors the production label's rounded corners, polygon and skew.
			// Every label used here is convex; all four ink-box corners must hit its opaque surface.
			const previous = background.style.getPropertyValue('pointer-events');
			const priority = background.style.getPropertyPriority('pointer-events');
			background.style.setProperty('pointer-events', 'auto', 'important');
			const inside = [[inkRect.left + .05, inkRect.top + .05], [inkRect.right - .05, inkRect.top + .05],
				[inkRect.left + .05, inkRect.bottom - .05], [inkRect.right - .05, inkRect.bottom - .05]].every(([x, y]) => {
					const hit = document.elementFromPoint(x, y);
					return !!hit && background!.contains(hit);
				});
			if (previous) background.style.setProperty('pointer-events', previous, priority); else background.style.removeProperty('pointer-events');
			if (!inside) continue;
			labels.push({ layer: background.getAttribute('data-layer') ?? '', rect: rect(background), shape: shape(background) });
			ignoredInk.push(ink.getAttribute('data-layer')!);
			ink.setAttribute('data-audit-ignore-ink', '');
		}
		return { mask: rect(mask), shape: shape(mask), labels, ignoredInk };
	}));
	const style = await page.addStyleTag({ content: '[data-audit-grid] .tile { transform:translateZ(0); } [data-audit-ignore-ink] { visibility: hidden !important; } [data-layer="material.glare"] { visibility: hidden !important; }' });
	try {
		const png = await page.locator('[data-audit-grid]').screenshot({ path, animations: 'disabled' });
		const child = execFile('magick', ['png:-', '-depth', '8', 'rgba:-'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
		const raw = await new Promise<Buffer>((resolve, reject) => {
			const chunks: Buffer[] = [];
			child.stdout!.on('data', chunk => chunks.push(chunk));
			child.on('error', reject);
			child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`Pixel decoder exited ${code}`)));
			child.stdin!.end(png);
		});
		return boxes.map((geometry, index) => ({ geometry,
			pixels: photoPixelHash(raw, width * 8, { x: index % 8 * width, y: Math.floor(index / 8) * width * 1.4, width, height: width * 1.4 }, geometry) }));
	} finally {
		await style.evaluate(element => { element.parentNode?.removeChild(element); });
		await page.locator('[data-audit-ignore-ink]').evaluateAll(elements => elements.forEach(element => element.removeAttribute('data-audit-ignore-ink')));
	}
}
