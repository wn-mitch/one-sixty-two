import type { Finish } from '../finish.ts';
import type { CardEra } from '../view-model.ts';
import { elementToRoot } from './geometry.ts';
import { inkImpression, isSurfaceKind, RELIEF_RANGE, stockFor, surfaceFor, type ReliefProfile, type Surface } from './surfaces.ts';

/**
 * A card's surface map: RGBA rows of relief (R, 0.5 is the stock plane), metal (G), gloss (B) and
 * iridescence (A). It is painted with Canvas2D from the card's laid-out DOM, so names, fitted text,
 * marks and stickers come out exactly where the card shows them.
 */
export interface SurfaceMap {
	width: number;
	height: number;
	data: Uint8Array;
}

export interface SurfaceMapOptions {
	/** How raised names are shaped; pillow when unset. */
	nameProfile?: ReliefProfile;
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Channel = 'height' | 'metal' | 'gloss' | 'iridescence';
const CHANNELS: readonly Channel[] = ['height', 'metal', 'gloss', 'iridescence'];

function canvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
	const element = document.createElement('canvas');
	element.width = width;
	element.height = height;
	return element;
}

function context(target: HTMLCanvasElement | OffscreenCanvas): Context {
	const result = target.getContext('2d', { willReadFrequently: true }) as Context | null;
	if (!result) throw new Error('Canvas2D is unavailable.');
	return result;
}

function encode(channel: Channel, surface: Surface): number {
	const value = channel === 'height' ? 0.5 + surface.height / (2 * RELIEF_RANGE) : surface[channel];
	return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function gray(value: number): string {
	return `rgb(${value},${value},${value})`;
}

function visibleBackground(style: CSSStyleDeclaration): boolean {
	if (style.backgroundImage && style.backgroundImage !== 'none') return true;
	const match = /rgba?\(([^)]+)\)/.exec(style.backgroundColor);
	if (!match) return false;
	const parts = match[1]!.split(/[\s,/]+/).filter(Boolean);
	return parts.length < 4 || Number(parts[3]) > 0;
}

/** A zero-offset, unblurred box shadow is a solid ring around the box, as on a die-cut sticker. */
function ringSpread(style: CSSStyleDeclaration): number {
	if (!style.boxShadow || style.boxShadow === 'none') return 0;
	let spread = 0;
	for (const shadow of style.boxShadow.split(/,(?![^(]*\))/)) {
		if (shadow.includes('inset')) continue;
		const lengths = shadow.replace(/(rgba?|oklch|hsla?|color)\([^)]*\)/g, '').trim().split(/\s+/).map(Number.parseFloat).filter(Number.isFinite);
		const [x = 0, y = 0, blur = 0, size = 0] = lengths;
		if (x === 0 && y === 0 && blur === 0 && size > spread) spread = size;
	}
	return spread;
}

/** Splits on a separator that is not inside parentheses, so `calc()` terms stay whole. */
function topLevel(value: string, separator: ',' | ' '): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const character of value) {
		if (character === '(') depth += 1;
		if (character === ')') depth -= 1;
		if (depth === 0 && (separator === ' ' ? /\s/.test(character) : character === separator)) {
			if (current.trim()) parts.push(current.trim());
			current = '';
		} else current += character;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

/** A computed length: pixels, a percentage of `basis`, or a `calc()` sum of those. */
export function resolveLength(value: string, basis: number): number {
	const calc = /^calc\((.*)\)$/.exec(value.trim());
	const terms = calc ? calc[1]!.replace(/\s([+-])\s/g, ' $1').split(/\s+/) : [value.trim()];
	return terms.reduce((total, term) => {
		const number = Number.parseFloat(term);
		if (!Number.isFinite(number)) return total;
		return total + (term.endsWith('%') ? number / 100 * basis : number);
	}, 0);
}

/**
 * The painted outline of a tagged box. `data-surface-shape="frame"` keeps only the border and padding
 * ring, as on a masked foil border or a printed rule.
 */
function boxPath(element: HTMLElement, style: CSSStyleDeclaration, width: number, height: number): Path2D {
	const path = new Path2D();
	const shape = element.dataset.surfaceShape;
	const clip = /^polygon\((.*)\)$/.exec(style.clipPath ?? '');
	if (clip) {
		topLevel(clip[1]!, ',').forEach((point, index) => {
			const [px = '0', py = '0'] = topLevel(point.trim(), ' ');
			const x = resolveLength(px, width);
			const y = resolveLength(py, height);
			if (index === 0) path.moveTo(x, y);
			else path.lineTo(x, y);
		});
		path.closePath();
		return path;
	}
	const spread = ringSpread(style);
	const radius = (value: string, basis: number) => value.endsWith('%') ? Number.parseFloat(value) / 100 * basis : Number.parseFloat(value) || 0;
	const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
		.map(value => Math.min(radius(value.split(' ')[0] ?? '0', width), width / 2, height / 2) + (spread > 0 ? spread : 0));
	path.roundRect(-spread, -spread, width + spread * 2, height + spread * 2, corners);
	if (shape === 'frame') {
		// The ring is whatever border and padding surround the content: a masked foil border uses padding, a rule uses its border.
		const left = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth);
		const top = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.borderTopWidth);
		const right = Number.parseFloat(style.paddingRight) + Number.parseFloat(style.borderRightWidth);
		const bottom = Number.parseFloat(style.paddingBottom) + Number.parseFloat(style.borderBottomWidth);
		path.rect(left, top, width - left - right, height - top - bottom);
	}
	return path;
}

function transformText(text: string, transform: string): string {
	if (transform === 'uppercase') return text.toUpperCase();
	if (transform === 'lowercase') return text.toLowerCase();
	if (transform === 'capitalize') return text.replace(/\b\p{L}/gu, letter => letter.toUpperCase());
	return text;
}

interface Glyph {
	text: string;
	/** Centre of the glyph's advance and its baseline, in the element's border-box pixels. */
	x: number;
	baseline: number;
}

const OVERRIDES = 'position:absolute;left:0;top:0;margin:0;transform:none;translate:none;rotate:none;scale:none;animation:none;transition:none;';

/** Copies every computed property, so the copy lays text out like the original without its ancestors' selectors. */
function copyStyle(source: Element, target: HTMLElement): void {
	const style = getComputedStyle(source);
	let text = '';
	for (let index = 0; index < style.length; index += 1) {
		const name = style.item(index);
		text += `${name}:${style.getPropertyValue(name)};`;
	}
	target.style.cssText = text;
}

/**
 * Where the browser set each of `element`'s own characters. Canvas text cannot reproduce every
 * layout feature (tabular numerals, kerning, wrapping, balancing), so the element is copied into an
 * untransformed host and each character's box is read back; a tilted card would skew live rects.
 */
function glyphs(element: HTMLElement, style: CSSStyleDeclaration, ascent: number, descent: number): Glyph[] {
	const host = element.ownerDocument.createElement('div');
	host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;';
	const copy = element.cloneNode(true) as HTMLElement;
	copyStyle(element, copy);
	copy.style.cssText += OVERRIDES;
	const sources = [element, ...element.querySelectorAll('*')];
	const copies = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
	for (let index = 1; index < copies.length; index += 1) copyStyle(sources[index]!, copies[index]!);
	host.append(copy);
	element.ownerDocument.body.append(host);
	const origin = copy.getBoundingClientRect();
	const spacing = Number.parseFloat(style.letterSpacing) || 0;
	const range = element.ownerDocument.createRange();
	const result: Glyph[] = [];
	for (const node of copy.childNodes) {
		if (node.nodeType !== Node.TEXT_NODE) continue;
		const source = node.textContent ?? '';
		let offset = 0;
		for (const character of source) {
			const end = offset + character.length;
			if (character.trim()) {
				range.setStart(node, offset);
				range.setEnd(node, end);
				const rect = range.getClientRects()[0];
				if (rect && rect.width > 0) {
					const startsWord = offset === 0 || !source[offset - 1]!.trim();
					const text = style.textTransform === 'capitalize' ? (startsWord ? character.toUpperCase() : character) : transformText(character, style.textTransform);
					result.push({
						text,
						x: rect.left - origin.left + (rect.width - spacing) / 2,
						baseline: rect.top - origin.top + (rect.height - ascent - descent) / 2 + ascent
					});
				}
			}
			offset = end;
		}
	}
	host.remove();
	return result;
}

interface Painter {
	contexts: Record<Channel, Context>;
	silhouette: { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Context };
	/** A map-sized layer for shaping one element's relief before it joins the height channel. */
	scratch: { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Context };
	scale: number;
	root: HTMLElement;
}

function withTransform(painter: Painter, matrix: DOMMatrix, draw: (ctx: Context, channel: Channel) => void): void {
	const { a, b, c, d, e, f } = matrix;
	for (const channel of CHANNELS) {
		const ctx = painter.contexts[channel];
		ctx.setTransform(a * painter.scale, b * painter.scale, c * painter.scale, d * painter.scale, e * painter.scale, f * painter.scale);
		draw(ctx, channel);
	}
}

function paintText(painter: Painter, element: HTMLElement, surface: Surface, profile: ReliefProfile = 'pillow'): void {
	const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? '').join('').trim();
	if (!text) return;
	const matrix = elementToRoot(element, painter.root);
	if (!matrix) return;
	const style = getComputedStyle(element);
	if (style.visibility === 'hidden' || Number(style.opacity) === 0) return;
	const fontSize = Number.parseFloat(style.fontSize);
	const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	const probe = painter.contexts.height;
	probe.font = font;
	const metrics = probe.measureText(text);
	const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.8;
	const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.2;
	const placed = glyphs(element, style, ascent, descent);
	if (!placed.length) return;
	const typeset = (ctx: Context) => {
		ctx.font = font;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = '0px';
	};
	const draw = (ctx: Context, stroke = false) => {
		for (const glyph of placed) {
			if (stroke) ctx.strokeText(glyph.text, glyph.x, glyph.baseline);
			else ctx.fillText(glyph.text, glyph.x, glyph.baseline);
		}
	};
	const raised = surface.height > 0 && profile !== 'pillow';
	const faceHeight = !raised ? surface.height : profile === 'groove' ? -surface.height : profile === 'ridge' ? surface.height * 0.3 : surface.height * 0.55;
	withTransform(painter, matrix, (ctx, channel) => {
		typeset(ctx);
		ctx.fillStyle = gray(encode(channel, channel === 'height' ? { ...surface, height: profile === 'ridge' ? surface.height : faceHeight } : surface));
		draw(ctx);
	});
	if (!raised || profile === 'groove') return;
	// Shape the letter face on a scratch layer, then lay it over the height channel.
	const { canvas: target, ctx: scratch } = painter.scratch;
	scratch.setTransform(1, 0, 0, 1, 0, 0);
	scratch.globalCompositeOperation = 'source-over';
	scratch.clearRect(0, 0, target.width, target.height);
	const { a, b, c, d, e, f } = matrix;
	scratch.setTransform(a * painter.scale, b * painter.scale, c * painter.scale, d * painter.scale, e * painter.scale, f * painter.scale);
	typeset(scratch);
	scratch.fillStyle = '#fff';
	draw(scratch);
	if (profile === 'ridge') {
		// Erode each letter by its rim, leaving the lower face inside.
		scratch.globalCompositeOperation = 'destination-out';
		scratch.lineJoin = 'round';
		scratch.lineWidth = Math.max(0.5, fontSize * 0.07) * 2;
		scratch.strokeStyle = '#fff';
		draw(scratch, true);
		scratch.globalCompositeOperation = 'source-in';
		scratch.setTransform(1, 0, 0, 1, 0, 0);
		scratch.fillStyle = gray(encode('height', { ...surface, height: faceHeight }));
		scratch.fillRect(0, 0, target.width, target.height);
	} else {
		// Fine diagonal lines across the face, spaced in card pixels so they stay crisp at any size.
		scratch.globalCompositeOperation = 'source-in';
		scratch.setTransform(1, 0, 0, 1, 0, 0);
		const period = Math.max(4, Math.round(painter.scale * 3));
		const high = gray(encode('height', surface));
		const low = gray(encode('height', { ...surface, height: faceHeight }));
		scratch.fillStyle = low;
		scratch.fillRect(0, 0, target.width, target.height);
		// Each stripe lands only on the letters and keeps the face around it.
		scratch.globalCompositeOperation = 'source-atop';
		scratch.fillStyle = high;
		for (let offset = -target.height; offset < target.width; offset += period) {
			scratch.beginPath();
			scratch.moveTo(offset, 0);
			scratch.lineTo(offset + period / 2, 0);
			scratch.lineTo(offset + period / 2 + target.height, target.height);
			scratch.lineTo(offset + target.height, target.height);
			scratch.fill();
		}
	}
	const heightContext = painter.contexts.height;
	heightContext.setTransform(1, 0, 0, 1, 0, 0);
	heightContext.drawImage(target, 0, 0);
}

function paintImage(painter: Painter, image: HTMLImageElement, surface: Surface): void {
	if (!image.complete || !image.naturalWidth) return;
	const matrix = elementToRoot(image, painter.root);
	if (!matrix) return;
	const width = image.offsetWidth;
	const height = image.offsetHeight;
	// object-fit: contain keeps the mark's aspect inside its box.
	const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight);
	const drawWidth = image.naturalWidth * fit;
	const drawHeight = image.naturalHeight * fit;
	const { canvas: target, ctx: silhouette } = painter.silhouette;
	const pixelWidth = Math.max(1, Math.ceil(drawWidth * painter.scale));
	const pixelHeight = Math.max(1, Math.ceil(drawHeight * painter.scale));
	if (target.width < pixelWidth || target.height < pixelHeight) {
		target.width = Math.max(target.width, pixelWidth);
		target.height = Math.max(target.height, pixelHeight);
	}
	withTransform(painter, matrix, (ctx, channel) => {
		silhouette.setTransform(1, 0, 0, 1, 0, 0);
		silhouette.globalCompositeOperation = 'source-over';
		silhouette.clearRect(0, 0, target.width, target.height);
		silhouette.drawImage(image, 0, 0, pixelWidth, pixelHeight);
		silhouette.globalCompositeOperation = 'source-in';
		silhouette.fillStyle = gray(encode(channel, surface));
		silhouette.fillRect(0, 0, pixelWidth, pixelHeight);
		ctx.drawImage(target, 0, 0, pixelWidth, pixelHeight, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
	});
}

function paintBox(painter: Painter, element: HTMLElement, style: CSSStyleDeclaration, surface: Surface): void {
	const matrix = elementToRoot(element, painter.root);
	if (!matrix) return;
	const path = boxPath(element, style, element.offsetWidth, element.offsetHeight);
	withTransform(painter, matrix, (ctx, channel) => {
		ctx.fillStyle = gray(encode(channel, surface));
		ctx.fill(path, 'evenodd');
	});
}

function textLeaves(element: HTMLElement): HTMLElement[] {
	const leaves: HTMLElement[] = [];
	const visit = (node: HTMLElement) => {
		if (node.hasAttribute('data-surface') && node !== element) return;
		if ([...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) leaves.push(node);
		for (const child of node.children) if (child instanceof HTMLElement) visit(child);
	};
	visit(element);
	return leaves;
}

function paintElement(painter: Painter, element: HTMLElement, surface: Surface, stock: Surface, profile?: ReliefProfile): void {
	const style = getComputedStyle(element);
	if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
	if (element instanceof HTMLImageElement) {
		paintImage(painter, element, surface);
		return;
	}
	if (visibleBackground(style) || ringSpread(style) > 0 || element.dataset.surfaceShape) {
		paintBox(painter, element, style, surface);
		// Lettering printed on a box is ink pressed into the box.
		for (const leaf of textLeaves(element)) paintText(painter, leaf, { ...stock, height: surface.height + inkImpression(stock) });
		return;
	}
	for (const leaf of textLeaves(element)) paintText(painter, leaf, surface, profile);
	// Images tagged themselves, or inside another tagged element, paint with their own surface.
	for (const image of element.querySelectorAll('img')) if (image.closest('[data-surface]') === element) paintImage(painter, image, surface);
}

/**
 * Paints the surface map for a laid-out card. `root` is the card element whose border box spans the
 * map; `scale` is map pixels per CSS pixel. Elements paint in document order, so later layers win.
 */
export function buildSurfaceMap(root: HTMLElement, tier: Finish, era: CardEra, scale: number, options: SurfaceMapOptions = {}): SurfaceMap {
	const width = Math.max(1, Math.round(root.offsetWidth * scale));
	const height = Math.max(1, Math.round(root.offsetHeight * scale));
	const targets = Object.fromEntries(CHANNELS.map(channel => [channel, canvas(width, height)])) as Record<Channel, HTMLCanvasElement | OffscreenCanvas>;
	const contexts = Object.fromEntries(CHANNELS.map(channel => [channel, context(targets[channel])])) as Record<Channel, Context>;
	const silhouetteCanvas = canvas(64, 64);
	const scratchCanvas = canvas(width, height);
	const painter: Painter = { contexts, silhouette: { canvas: silhouetteCanvas, ctx: context(silhouetteCanvas) }, scratch: { canvas: scratchCanvas, ctx: context(scratchCanvas) }, scale, root };
	const stock = stockFor(era);
	for (const channel of CHANNELS) {
		const ctx = contexts[channel];
		ctx.fillStyle = gray(encode(channel, stock));
		ctx.fillRect(0, 0, width, height);
	}
	// All other lettering is printed ink, pressed slightly into the stock; tagged surfaces paint over it.
	const ink = surfaceFor('ink', tier, stock);
	for (const leaf of textLeaves(root)) if (!leaf.closest('[data-surface]')) paintText(painter, leaf, ink);
	for (const element of root.querySelectorAll<HTMLElement>('[data-surface]')) {
		const kind = element.dataset.surface;
		if (!isSurfaceKind(kind)) continue;
		const surface = surfaceFor(kind, tier, stock);
		// Foil stickers are cut from metallic vinyl.
		if (kind === 'sticker' && element.dataset.foil) Object.assign(surface, { metal: 1, iridescence: element.dataset.foil === 'gem' ? 1 : 0 });
		paintElement(painter, element, surface, stock, kind === 'name' ? options.nameProfile : undefined);
	}
	const data = new Uint8Array(width * height * 4);
	CHANNELS.forEach((channel, offset) => {
		const pixels = contexts[channel].getImageData(0, 0, width, height).data;
		for (let index = 0; index < width * height; index += 1) data[index * 4 + offset] = pixels[index * 4]!;
	});
	return { width, height, data };
}
