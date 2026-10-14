import type { Finish } from '../finish.ts';
import type { CardEra } from '../era.ts';
import { elementToRoot } from './geometry.ts';
import type { SurfaceMap } from './light-renderer.ts';
import { DEFAULT_TUNING, inkImpression, isSurfaceKind, RELIEF_RANGE, STOCKS, stockFor, surfaceFor, type ReliefProfile, type Stock, type Surface, type SurfaceTuning } from './surfaces.ts';

// Builds a card's surface map (the format is `SurfaceMap` in light-renderer.ts). It is painted with Canvas2D
// from the card's laid-out DOM, so names, fitted text, marks and stickers come out exactly where the card shows them.

export interface SurfaceMapOptions {
	/** How raised names are shaped; pillow when unset. */
	nameProfile?: ReliefProfile;
	/** Treatment strengths; the shipped defaults when unset. */
	tuning?: Partial<SurfaceTuning>;
	/** Prints every card on this stock instead of its era's, for comparing stocks in a workshop. */
	stock?: Stock;
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

/**
 * The iridescence channel is signed around 0.5: above it holo, below it silver foil, so either one
 * fades linearly into plain stock at antialiased edges.
 */
function encode(channel: Channel, surface: Surface): number {
	const value = channel === 'height' ? 0.5 + surface.height / (2 * RELIEF_RANGE)
		: channel === 'iridescence' ? 0.5 + surface.iridescence * 0.5 - (surface.silver ?? 0) * 0.5
		: surface[channel];
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
function boxPath(element: HTMLElement, style: CSSStyleDeclaration, width: number, height: number, withRing = true): Path2D {
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
	const spread = withRing ? ringSpread(style) : 0;
	const radius = (value: string, basis: number) => value.endsWith('%') ? Number.parseFloat(value) / 100 * basis : Number.parseFloat(value) || 0;
	// Each corner keeps both its radii, so elliptical arches such as the 1970s photo window map on the curve the browser draws.
	const grow = spread > 0 ? spread : 0;
	const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
		.map(value => {
			const [rx = '0', ry = rx] = value.split(' ');
			return { x: Math.min(radius(rx, width), width) + grow, y: Math.min(radius(ry, height), height) + grow };
		});
	path.roundRect(-spread, -spread, width + spread * 2, height + spread * 2, corners);
	if (shape === 'frame' || shape === 'border') {
		// The ring is whatever border and padding surround the content: a masked foil border uses padding, a rule uses
		// its border. `border` keeps the border lines alone, as on ruled boxes whose padding is plain print.
		const pad = (side: number) => shape === 'border' ? 0 : side;
		const left = pad(Number.parseFloat(style.paddingLeft)) + Number.parseFloat(style.borderLeftWidth);
		const top = pad(Number.parseFloat(style.paddingTop)) + Number.parseFloat(style.borderTopWidth);
		const right = pad(Number.parseFloat(style.paddingRight)) + Number.parseFloat(style.borderRightWidth);
		const bottom = pad(Number.parseFloat(style.paddingBottom)) + Number.parseFloat(style.borderBottomWidth);
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
	/** Centre of the glyph's advance and its baseline, in the element's border-box pixels; for vertical text, the centre of its box. */
	x: number;
	baseline: number;
	/** Set sideways down a vertical line, turned a quarter clockwise. */
	vertical?: boolean;
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
	const vertical = style.writingMode.startsWith('vertical') || style.writingMode.startsWith('sideways');
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
					result.push(vertical
						? { text, vertical, x: rect.left - origin.left + rect.width / 2, baseline: rect.top - origin.top + (rect.height - spacing) / 2 }
						: { text, x: rect.left - origin.left + (rect.width - spacing) / 2, baseline: rect.top - origin.top + (rect.height - ascent - descent) / 2 + ascent });
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
	/** The printed ink in colour. */
	ink: Context;
	/** Holds one shaped mask while it is filled for each channel. */
	tint: { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Context };
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

/**
 * Paints SVG lettering, such as a team name set on an arc, glyph by glyph where the browser placed
 * each one along its path. The SVG must be positioned in an HTML parent by `left` and `top`.
 */
function paintSvgText(painter: Painter, text: SVGTextContentElement, surface: Surface): void {
	const svg = text.ownerSVGElement;
	const parent = svg?.parentElement;
	const local = text.getCTM();
	if (!svg || !parent || !local) return;
	const parentMatrix = elementToRoot(parent, painter.root);
	if (!parentMatrix) return;
	const box = getComputedStyle(svg);
	const matrix = parentMatrix.translate(Number.parseFloat(box.left) || 0, Number.parseFloat(box.top) || 0).multiply(DOMMatrix.fromMatrix(local));
	const style = getComputedStyle(text);
	if (style.visibility === 'hidden' || Number(style.opacity) === 0) return;
	const content = text.textContent ?? '';
	const count = text.getNumberOfChars();
	const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	const draw = (ctx: Context) => {
		ctx.font = font;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		for (let index = 0; index < count; index += 1) {
			const glyph = content[index];
			if (!glyph?.trim()) continue;
			const start = text.getStartPositionOfChar(index);
			ctx.save();
			ctx.translate(start.x, start.y);
			ctx.rotate(text.getRotationOfChar(index) * Math.PI / 180);
			ctx.fillText(glyph, 0, 0);
			ctx.restore();
		}
	};
	withTransform(painter, matrix, (ctx, channel) => {
		ctx.fillStyle = gray(encode(channel, surface));
		draw(ctx);
	});
	const { a, b, c, d, e, f } = matrix;
	painter.ink.setTransform(a * painter.scale, b * painter.scale, c * painter.scale, d * painter.scale, e * painter.scale, f * painter.scale);
	painter.ink.fillStyle = style.fill;
	draw(painter.ink);
}

function paintText(painter: Painter, element: HTMLElement, surface: Surface, profile: ReliefProfile = 'pillow', softness = 0): void {
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
	const draw = (ctx: Context) => {
		for (const glyph of placed) {
			if (!glyph.vertical) {
				ctx.fillText(glyph.text, glyph.x, glyph.baseline);
				continue;
			}
			ctx.save();
			ctx.translate(glyph.x, glyph.baseline);
			ctx.rotate(Math.PI / 2);
			ctx.fillText(glyph.text, 0, (ascent - descent) / 2);
			ctx.restore();
		}
	};
	const raised = surface.height > 0 && profile !== 'pillow';
	const faceHeight = !raised ? surface.height : profile === 'groove' ? -surface.height : surface.height * 0.55;
	withTransform(painter, matrix, (ctx, channel) => {
		typeset(ctx);
		ctx.fillStyle = gray(encode(channel, channel === 'height' ? { ...surface, height: faceHeight } : surface));
		// Soft shoulders: the raised height spreads past the letter edges instead of stepping.
		const soften = channel === 'height' && softness > 0 && surface.height > 0;
		if (soften) ctx.filter = `blur(${softness * painter.scale}px)`;
		draw(ctx);
		if (soften) ctx.filter = 'none';
	});
	const { a: ma, b: mb, c: mc, d: md, e: me, f: mf } = matrix;
	painter.ink.setTransform(ma * painter.scale, mb * painter.scale, mc * painter.scale, md * painter.scale, me * painter.scale, mf * painter.scale);
	typeset(painter.ink);
	painter.ink.fillStyle = style.color;
	draw(painter.ink);
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
	{
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

/** Cuts the artwork's outline as a die (RGBA, coverage in alpha), so foil and emboss sit in register with the print. */
function artworkDie(pixels: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
	const result = new Uint8ClampedArray(new ArrayBuffer(pixels.length));
	for (let index = 0; index < pixels.length; index += 4) {
		result[index] = result[index + 1] = result[index + 2] = 255;
		result[index + 3] = pixels[index + 3]!;
	}
	return result;
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
	const pixelWidth = Math.max(1, Math.ceil(drawWidth * painter.scale));
	const pixelHeight = Math.max(1, Math.ceil(drawHeight * painter.scale));
	const { canvas: target, ctx: silhouette } = painter.silhouette;
	const { canvas: tintCanvas, ctx: tint } = painter.tint;
	for (const layer of [target, tintCanvas]) {
		if (layer.width < pixelWidth || layer.height < pixelHeight) {
			layer.width = Math.max(layer.width, pixelWidth);
			layer.height = Math.max(layer.height, pixelHeight);
		}
	}
	silhouette.setTransform(1, 0, 0, 1, 0, 0);
	silhouette.globalCompositeOperation = 'source-over';
	silhouette.clearRect(0, 0, target.width, target.height);
	silhouette.drawImage(image, 0, 0, pixelWidth, pixelHeight);
	const artwork = silhouette.getImageData(0, 0, pixelWidth, pixelHeight);
	const left = (width - drawWidth) / 2;
	const top = (height - drawHeight) / 2;
	// The artwork prints as ink; its die carries the foil and the emboss in register.
	const { a, b, c, d, e, f } = matrix;
	painter.ink.setTransform(a * painter.scale, b * painter.scale, c * painter.scale, d * painter.scale, e * painter.scale, f * painter.scale);
	painter.ink.drawImage(image, left, top, drawWidth, drawHeight);
	silhouette.putImageData(new ImageData(artworkDie(artwork.data), pixelWidth, pixelHeight), 0, 0);
	withTransform(painter, matrix, (ctx, channel) => {
		tint.setTransform(1, 0, 0, 1, 0, 0);
		tint.globalCompositeOperation = 'source-over';
		tint.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
		tint.drawImage(target, 0, 0, pixelWidth, pixelHeight, 0, 0, pixelWidth, pixelHeight);
		tint.globalCompositeOperation = 'source-in';
		tint.fillStyle = gray(encode(channel, surface));
		tint.fillRect(0, 0, pixelWidth, pixelHeight);
		ctx.drawImage(tintCanvas, 0, 0, pixelWidth, pixelHeight, left, top, drawWidth, drawHeight);
	});
}

/** How far a sticker's vinyl side shows below it, as a fraction of its width. */
const STICKER_SIDE = 0.06;

/**
 * Under a sticker: its vinyl side, a step lower and darker, showing below it so the sticker reads as thick, and
 * the white die-cut border round its face. The face paints over both.
 */
function paintStickerBacking(painter: Painter, matrix: DOMMatrix, border: Path2D, face: Path2D, width: number, surface: Surface): void {
	const { a, b, c, d, e, f } = matrix;
	const side = new Path2D();
	side.addPath(border, new DOMMatrix().translate(0, width * STICKER_SIDE));
	const vinyl = { height: surface.height, metal: 0, gloss: 1, iridescence: 0 };
	withTransform(painter, matrix, (ctx, channel) => {
		ctx.fillStyle = gray(encode(channel, { ...vinyl, height: surface.height * 0.45, gloss: 0.5 }));
		ctx.fill(side);
		ctx.fillStyle = gray(encode(channel, vinyl));
		ctx.fill(border);
	});
	painter.ink.setTransform(a * painter.scale, b * painter.scale, c * painter.scale, d * painter.scale, e * painter.scale, f * painter.scale);
	painter.ink.fillStyle = '#8d949e';
	painter.ink.fill(side);
	painter.ink.fillStyle = '#f7f6f2';
	painter.ink.fill(border);
	// The face keeps its own print: cleared here, so a gradient face still shows its DOM colour.
	painter.ink.globalCompositeOperation = 'destination-out';
	painter.ink.fillStyle = '#000';
	painter.ink.fill(face);
	painter.ink.globalCompositeOperation = 'source-over';
}

/** A sticker's ribbons (`data-ribbon`): bands of solid colour across its face, clipped to the die cut, printed matte like its lettering. */
function paintRibbons(painter: Painter, sticker: HTMLElement, style: CSSStyleDeclaration, surface: Surface): void {
	const stickerMatrix = elementToRoot(sticker, painter.root);
	if (!stickerMatrix) return;
	const face = boxPath(sticker, style, sticker.offsetWidth, sticker.offsetHeight, false);
	const scaled = (matrix: DOMMatrix): [number, number, number, number, number, number] =>
		[matrix.a * painter.scale, matrix.b * painter.scale, matrix.c * painter.scale, matrix.d * painter.scale, matrix.e * painter.scale, matrix.f * painter.scale];
	for (const ribbon of sticker.querySelectorAll<HTMLElement>('[data-ribbon]')) {
		const matrix = elementToRoot(ribbon, painter.root);
		const colour = getComputedStyle(ribbon).backgroundColor;
		if (!matrix) continue;
		const band = (ctx: Context, fill: string) => {
			ctx.save();
			ctx.setTransform(...scaled(stickerMatrix));
			ctx.clip(face);
			ctx.setTransform(...scaled(matrix));
			ctx.fillStyle = fill;
			ctx.fillRect(0, 0, ribbon.offsetWidth, ribbon.offsetHeight);
			ctx.restore();
		};
		for (const channel of CHANNELS) band(painter.contexts[channel], gray(encode(channel, surface)));
		band(painter.ink, colour);
	}
}

function paintBox(painter: Painter, element: HTMLElement, style: CSSStyleDeclaration, surface: Surface, face?: Surface): void {
	const matrix = elementToRoot(element, painter.root);
	if (!matrix) return;
	// A solid shadow ring is part of a die-cut sticker, but on a printed device it is an ink outline the foil stops inside.
	const printedRing = face !== undefined && element.dataset.surface !== 'sticker' && ringSpread(style) > 0;
	if (printedRing) {
		const outline = boxPath(element, style, element.offsetWidth, element.offsetHeight);
		withTransform(painter, matrix, (ctx, channel) => {
			ctx.fillStyle = gray(encode(channel, face));
			ctx.fill(outline, 'evenodd');
		});
	}
	const ringed = boxPath(element, style, element.offsetWidth, element.offsetHeight, !printedRing);
	// A sticker's ring is its white die-cut border; its face is the box inside it.
	const sticker = element.dataset.surface === 'sticker';
	const path = sticker ? boxPath(element, style, element.offsetWidth, element.offsetHeight, false) : ringed;
	if (sticker) paintStickerBacking(painter, matrix, ringed, path, element.offsetWidth, surface);
	withTransform(painter, matrix, (ctx, channel) => {
		ctx.fillStyle = gray(encode(channel, surface));
		ctx.fill(path, 'evenodd');
	});
	const { a, b, c, d, e, f } = matrix;
	// Border rules print in their own colour, which colour-over foil takes up.
	if (element.dataset.surfaceShape === 'border') {
		painter.ink.setTransform(a * painter.scale, b * painter.scale, c * painter.scale, d * painter.scale, e * painter.scale, f * painter.scale);
		painter.ink.fillStyle = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor].find(color => !/rgba\(.*,\s*0\)$/.test(color) && color !== 'transparent') ?? 'transparent';
		painter.ink.fill(path, 'evenodd');
		return;
	}
	painter.ink.setTransform(a * painter.scale, b * painter.scale, c * painter.scale, d * painter.scale, e * painter.scale, f * painter.scale);
	// A box can name the colour its foil prints in, as bronze and gold stickers do over their CSS gradients.
	if (element.dataset.surfaceInk) {
		painter.ink.fillStyle = element.dataset.surfaceInk;
		painter.ink.fill(path, 'evenodd');
		return;
	}
	// Solid fills print as ink; gradients and images keep their DOM rendering and stay unmapped here.
	if (!visibleBackground(style) || (style.backgroundImage && style.backgroundImage !== 'none')) {
		// Foil with no colour of its own, such as the card's rim, is bare metal: the print under it does not tint it.
		if (surface.metal >= 0.9) {
			painter.ink.globalCompositeOperation = 'destination-out';
			painter.ink.fillStyle = '#000';
			painter.ink.fill(path, 'evenodd');
			painter.ink.globalCompositeOperation = 'source-over';
		}
		return;
	}
	painter.ink.fillStyle = style.backgroundColor;
	painter.ink.fill(path, 'evenodd');
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

function paintElement(painter: Painter, element: HTMLElement, surface: Surface, stock: Surface, tuning: Readonly<SurfaceTuning>, profile?: ReliefProfile, softness = 0): void {
	const style = getComputedStyle(element);
	if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
	if (element instanceof HTMLImageElement) {
		paintImage(painter, element, surface);
		return;
	}
	if (visibleBackground(style) || ringSpread(style) > 0 || element.dataset.surfaceShape) {
		paintBox(painter, element, style, surface, { ...stock, height: inkImpression(stock) * tuning.inkDepth });
		// Lettering printed on a box is ink pressed into the box; on a sticker it is matte ink on the vinyl, so glare never washes it out.
		const lettering = element.dataset.surface === 'sticker'
			? { height: surface.height, metal: 0, gloss: 0.2, iridescence: 0 }
			: { ...stock, height: surface.height + inkImpression(stock) * tuning.inkDepth };
		if (element.dataset.surface === 'sticker') paintRibbons(painter, element, style, lettering);
		for (const leaf of textLeaves(element)) paintText(painter, leaf, lettering);
		return;
	}
	for (const leaf of textLeaves(element)) paintText(painter, leaf, surface, profile, softness);
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
	const inkCanvas = canvas(width, height);
	const tintCanvas = canvas(64, 64);
	const painter: Painter = { contexts, ink: context(inkCanvas), tint: { canvas: tintCanvas, ctx: context(tintCanvas) }, silhouette: { canvas: silhouetteCanvas, ctx: context(silhouetteCanvas) }, scratch: { canvas: scratchCanvas, ctx: context(scratchCanvas) }, scale, root };
	const stock = options.stock ? { ...STOCKS[options.stock] } : stockFor(era);
	for (const channel of CHANNELS) {
		const ctx = contexts[channel];
		ctx.fillStyle = gray(encode(channel, stock));
		ctx.fillRect(0, 0, width, height);
	}
	// All other lettering is printed ink, pressed slightly into the stock; tagged surfaces paint over it.
	const tuning = { ...DEFAULT_TUNING, ...options.tuning };
	const ink = surfaceFor('ink', tier, stock, tuning);
	for (const leaf of textLeaves(root)) if (!leaf.closest('[data-surface]')) paintText(painter, leaf, ink);
	// The card's edge (ring and keylines) is stamped over the print, except bands a template marks
	// `data-over-edge`, such as a rail along the card's side, which print over the edge with everything in them.
	const tagged = [...root.querySelectorAll<HTMLElement | SVGElement>('[data-surface]')];
	const edge = (element: Element) => element.closest('[data-layer="material"]') !== null;
	const overEdge = (element: Element) => element.closest('[data-over-edge]') !== null;
	const print = tagged.filter(element => !edge(element));
	for (const element of [...print.filter(element => !overEdge(element)), ...tagged.filter(edge), ...print.filter(overEdge)]) {
		const kind = element.dataset.surface;
		if (!isSurfaceKind(kind)) continue;
		const surface = surfaceFor(kind, tier, stock, tuning);
		if (element instanceof SVGTextContentElement) {
			paintSvgText(painter, element, surface);
			continue;
		}
		if (!(element instanceof HTMLElement)) continue;
		// Foil stickers are cut from metallic vinyl.
		if (kind === 'sticker' && element.dataset.foil) Object.assign(surface, { metal: 1, iridescence: element.dataset.foil === 'gem' ? 1 : 0, silver: element.dataset.foil === 'silver' ? 1 : 0 });
		paintElement(painter, element, surface, stock, tuning, kind === 'name' ? options.nameProfile : undefined, kind === 'name' ? tuning.nameSoftness : 0);
	}
	const data = new Uint8Array(width * height * 4);
	CHANNELS.forEach((channel, offset) => {
		const pixels = contexts[channel].getImageData(0, 0, width, height).data;
		for (let index = 0; index < width * height; index += 1) data[index * 4 + offset] = pixels[index * 4]!;
	});
	bevelEdge(data, width, height, CARD_RADIUS * root.offsetWidth * scale, BEVEL_WIDTH * root.offsetWidth * scale);
	const printed = new Uint8Array(painter.ink.getImageData(0, 0, width, height).data.buffer);
	return { width, height, data, ink: printed };
}

/** The card's corner radius and edge bevel, as fractions of its width (1.8cqw and 1.5cqw). */
const CARD_RADIUS = 0.018;
const BEVEL_WIDTH = 0.015;
/** How far the very edge falls below whatever is printed there, in relief units. */
const BEVEL_DEPTH = 0.6;

/**
 * Rounds the cut edge of the card down over the last `bevel` pixels, so the edge catches the light
 * on one side and falls into shade on the other. It lowers whatever was printed there, ring foil
 * included. `data` is RGBA with height in the red channel.
 */
export function bevelEdge(data: Uint8Array, width: number, height: number, radius: number, bevel: number): void {
	if (bevel <= 0) return;
	const drop = BEVEL_DEPTH / (2 * RELIEF_RANGE) * 255;
	const halfX = width / 2;
	const halfY = height / 2;
	const r = Math.min(radius, halfX, halfY);
	for (let y = 0; y < height; y += 1) {
		const qy = Math.abs(y + 0.5 - halfY) - (halfY - r);
		for (let x = 0; x < width; x += 1) {
			const qx = Math.abs(x + 0.5 - halfX) - (halfX - r);
			// Distance inside the rounded card outline.
			const inside = r - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0);
			if (inside >= bevel) continue;
			const fall = (1 - Math.max(inside, 0) / bevel) ** 2;
			const index = (y * width + x) * 4;
			data[index] = Math.max(0, Math.round(data[index]! - drop * fall));
		}
	}
}
