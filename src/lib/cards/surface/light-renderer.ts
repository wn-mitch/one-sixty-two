import type { Finish } from '../finish.ts';
import type { CardEra } from '../era.ts';
import { ERA_FOIL, ERA_PLATE_TUNING, FOIL_PLATES, type FoilPlate, type PlateTuning } from './foil-plates.ts';
import { CIRCUIT_CELLS, CIRCUIT_TEXELS_PER_CELL, growWires, rasterizeWires } from './circuit-tile.ts';
import { ERA_HOLO, filmsFor, HOLO_PATTERNS, underOf, type HoloPattern } from './holo-films.ts';
import type { ProgramSpec } from './light-shader.ts';
import { LightPrograms, programKey, type Uniforms } from './light-programs.ts';
import { TUNE_SLOTS, type ModuleTune } from './films/film.ts';
import { gradientUniforms } from './palettes/custom.ts';

/**
 * Draws the light on many cards in one WebGL2 pass over their DOM fronts. The DOM supplies colour;
 * this pass adds relief shading, specular light, foil reflection and iridescence from each card's
 * surface map. Output is premultiplied, so dark relief reads as a multiply and highlights as light.
 */

/** A card's surface map: RGBA rows of relief (R, 0.5 is the stock plane), metal (G), gloss (B) and iridescence (A, holo above 0.5, silver below), plus its printed ink. */
export interface SurfaceMap {
	width: number;
	height: number;
	data: Uint8Array;
	/** The printed ink under each pixel as RGBA, so foil can replace, tint or keep the contrast of what it covers; A is ink coverage. */
	ink: Uint8Array;
}

/** One card to light: its border box on the canvas, its surface map, and its light. */
export interface LitCard {
	key: string;
	/** Canvas CSS pixels of the card's top-left corner and its width and height edge vectors. */
	originX: number;
	originY: number;
	axisXx: number;
	axisXy: number;
	axisYx: number;
	axisYy: number;
	/** Where the light sits over the card, in card fractions (0..1 across, 0..1 down). */
	lightX: number;
	lightY: number;
	/** 0 is ambient light; 1 is a full spotlight. */
	spotlight: number;
	/** Where the viewer sits relative to the card's face, from its tilt: the sine of the lean toward each axis. */
	viewX?: number;
	viewY?: number;
	tier: Finish;
	/** The card's era, which picks its holo pattern unless the options force one. */
	era?: CardEra;
	/** A stable 0..1 seed per card that shifts its holo film, so two cards of one era never print the same cut. */
	pattern?: number;
	/** Prints this holo film instead of the era's, as the holo gallery does. */
	film?: HoloPattern;
	/** Presses this foil plate instead of the era's, as the foil gallery does. */
	plate?: FoilPlate;
	/** Tunes the plate instead of its era's settings, as the finish workshop does. */
	plateTuning?: PlateTuning;
}

/** Tuning a scene can change between draws. */
export interface LightOptions {
	/** How steeply relief slopes read; higher makes lettering look deeper. */
	relief?: number;
	/** Light height above the card, in sevenths of the card's height; lower rakes across relief and lengthens its shade. */
	lightHeight?: number;
	/** Strength of the soft glare a lifted card catches. */
	glare?: number;
	/** Scales coat and foil highlights. */
	shine?: number;
	/** How strongly foil areas take the reflected environment as their colour. */
	foil?: number;
	/** How brightly unfoiled coat shines relative to foil, so foil stands out from the card around it. */
	coat?: number;
	/** How holo foil's grooves are laid out: 0 smooth refractor, 1 prizm facets, 2 cracked ice, 3 spun grooves. */
	holoPattern?: number;
	/** Facet or shard density of the holo pattern, per card unit. */
	holoScale?: number;
	/** How many times the foil's reflection repeats across the card; 1 is a few broad sweeps. */
	waves?: number;
	/** Brushed grain across silver and gold foil: fine streaks that break up the reflection. */
	brush?: number;
	/** How foil treats the ink it covers: 0 replaces it, 1 lets it tint the metal, 2 keeps its lightness so printed contrast survives. */
	foilMode?: number;
	/** Exaggerates how far tilting a card moves its reflections; 1 is physical. */
	shift?: number;
	/** How strongly uncoated stock shows paper: fiber in its relief and mottling in its tone. 0 prints it smooth. */
	paper?: number;
	/** How far a tier's finish reaches past its dies: Gem's holo wash and the metal sheen over the whole face. 0 keeps it to the foiled parts. */
	wash?: number;
	/** Forces one foil plate on every card by its index in FOIL_PLATES; -1 lets each card's era choose. */
	foilPlate?: number;
	/** Scales how deeply foil plates are pressed; 0 leaves the foil flat. */
	plateDepth?: number;
	/** Multiplies every card's plate scale: above 1 packs the patterns finer. */
	plateScale?: number;
	/** Multiplies every card's plate tone: Damascus's dark layers, carbon's black tows and the stain's tint. */
	plateTone?: number;
	/** Multiplies every card's stain coverage. */
	stain?: number;
	/** Live dials for one film, by its index in FILMS; the workshop's. Null prints every film as shipped. */
	filmTune?: ModuleTune | null;
	/** Live dials for one finish, by its index in FILM_FINISHES. */
	finishTune?: ModuleTune | null;
	/** Live dials for one plate, by its index in PLATES. */
	plateTune?: ModuleTune | null;
	/** Presses every film with one finish, by its index in FILM_FINISHES; -1 keeps each film's own. */
	finish?: number;
	/** Prints every film in one colourway, by its index in PALETTES; -1 keeps each film's own. */
	palette?: number;
	/** Two to five RGB hex stops for the custom colourway; null keeps its shipped gradient. */
	customGradient?: readonly string[] | null;
	/** How far foil plates press through holo film too; 0 keeps the film smooth over the plate. */
	plateUnderFilm?: number;
	/** A second film, by its index in HOLO_PATTERNS, printed under every film and showing through its ground; -1 keeps each film's own, -2 prints none. */
	underFilm?: number;
	/** How strongly the under film shows through the top film's ground, from 0 to 1. */
	underMix?: number;
	/** The shader's clock in seconds, for drawing a chosen moment of the films that move; the page clock when unset. */
	time?: number;
}

/** The shipped light, used for every option a scene leaves unset; the finish gallery opens on it. */
export const DEFAULT_LIGHT: Readonly<Required<Omit<LightOptions, 'time'>>> = {
	relief: 6, lightHeight: 7.6, glare: 0.13, shine: 2.2, foil: 1, coat: 0.35,
	// -1 lets each card's era choose its film.
	holoPattern: -1, holoScale: 8, waves: 3, brush: 0.6,
	// 1 is colour-over: foil takes the tint of the ink it covers.
	foilMode: 1, shift: 8.5, paper: 1, wash: 1,
	foilPlate: -1, plateDepth: 1, plateScale: 1, plateTone: 1, stain: 1,
	filmTune: null, finishTune: null, plateTune: null, finish: -1, palette: -1, customGradient: null,
	plateUnderFilm: 0, underFilm: -1, underMix: 1
};
type LightCanvas = HTMLCanvasElement | OffscreenCanvas;
/**
 * The program a card needs: its film (or the scene's forced one) with what that film draws through, and its plate
 * (or the scene's). Remixing scenes carry every finish and colourway.
 */
export function programSpec(film: number, plate: number, options: LightOptions): ProgramSpec {
	const forcedFilm = options.holoPattern ?? DEFAULT_LIGHT.holoPattern;
	const forcedPlate = options.foilPlate ?? DEFAULT_LIGHT.foilPlate;
	const sceneUnder = options.underFilm ?? DEFAULT_LIGHT.underFilm;
	const shown = forcedFilm >= 0 ? forcedFilm : film;
	const films = filmsFor(shown, sceneUnder);
	return {
		films,
		plates: new Set([forcedPlate >= 0 ? forcedPlate : plate]),
		remix: (options.finish ?? DEFAULT_LIGHT.finish) >= 0 || (options.palette ?? DEFAULT_LIGHT.palette) >= 0,
		// The fading film's films may carry their own under films too.
		under: [...films].some(index => underOf(index, sceneUnder) >= 0)
	};
}

let circuitTile: Uint8Array<ArrayBuffer> | null = null;
let circuitPending: Promise<Uint8Array<ArrayBuffer>> | null = null;
/**
 * The circuit film's wires, grown once per page in idle time so building them never stalls the first cards
 * on screen, and reused when a context is restored.
 */
function circuitWires(): Promise<Uint8Array<ArrayBuffer>> {
	if (circuitTile) return Promise.resolve(circuitTile);
	if (circuitPending) return circuitPending;
	const { promise, resolve, reject } = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
	circuitPending = promise;
	const build = () => {
		try {
			resolve(circuitTile = rasterizeWires(growWires()));
		} catch (error) {
			circuitPending = null;
			reject(error);
		}
	};
	if (typeof requestIdleCallback === 'function') requestIdleCallback(build, { timeout: 1000 });
	else setTimeout(build, 0);
	return promise;
}

const TIER_CODE: Record<Finish, number> = { base: 0, foil: 1, emboss: 2, gem: 3 };
/** The atlas starts small for phones and doubles, up to the GPU's limit, when the cards on screen outgrow it. */
const ATLAS_SIZE = 2048;
const ATLAS_LIMIT = 4096;
const FLOATS = 22;
/** How far, in card units, a card's seed can shift its holo film. */
const FILM_SHIFT = 2.5;

interface Tile {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Resources {
	programs: LightPrograms;
	vao: WebGLVertexArrayObject;
	instances: WebGLBuffer;
	atlas: WebGLTexture;
	/** The printed ink, packed at the same tile positions as the surface maps. */
	inkAtlas: WebGLTexture;
	/** The circuit film's wire tile. */
	circuit: WebGLTexture;
}

export class LightRenderer {
	readonly #canvas: LightCanvas;
	readonly #gl: WebGL2RenderingContext;
	#resources: Resources | null = null;
	readonly #maps = new Map<string, SurfaceMap>();
	readonly #tiles = new Map<string, Tile>();
	#atlasSize = ATLAS_SIZE;
	#shelfX = 0;
	#shelfY = 0;
	#shelfHeight = 0;
	#data = new Float32Array(FLOATS * 64);
	#width = 0;
	#height = 0;
	#lost = false;
	#circuitReady: Promise<void> = Promise.resolve();

	/** Returns null when this browser has no WebGL2; the caller keeps the static finish. */
	static create(canvas: LightCanvas): LightRenderer | null {
		try {
			const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false }) as WebGL2RenderingContext | null;
			return gl ? new LightRenderer(canvas, gl) : null;
		} catch {
			return null;
		}
	}

	get canvas(): LightCanvas {
		return this.#canvas;
	}

	/** Waits until deferred renderer resources are uploaded for deterministic offscreen draws. */
	async ready(): Promise<void> {
		await this.#circuitReady;
	}

	private constructor(canvas: LightCanvas, gl: WebGL2RenderingContext) {
		this.#canvas = canvas;
		this.#gl = gl;
		canvas.addEventListener('webglcontextlost', this.#onLost as EventListener);
		canvas.addEventListener('webglcontextrestored', this.#onRestored as EventListener);
		this.#resources = this.#setup();
	}

	#onLost = (event: Event) => {
		event.preventDefault();
		this.#lost = true;
		this.#resources = null;
	};

	#onRestored = () => {
		this.#lost = false;
		this.#resources = this.#setup();
		this.#repack();
	};

	#setup(): Resources {
		const gl = this.#gl;
		const programs = new LightPrograms(gl);
		const vao = gl.createVertexArray()!;
		const instances = gl.createBuffer()!;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, instances);
		const stride = FLOATS * 4;
		const attribute = (location: number, size: number, offset: number) => {
			gl.enableVertexAttribArray(location);
			gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
			gl.vertexAttribDivisor(location, 1);
		};
		attribute(0, 2, 0);
		attribute(1, 4, 2);
		attribute(2, 4, 6);
		attribute(3, 4, 10);
		attribute(4, 4, 14);
		attribute(5, 4, 18);
		gl.bindVertexArray(null);
		const atlas = this.#atlasTexture();
		const inkAtlas = this.#atlasTexture();
		const circuit = gl.createTexture()!;
		const circuitSide = CIRCUIT_CELLS * CIRCUIT_TEXELS_PER_CELL;
		gl.bindTexture(gl.TEXTURE_2D, circuit);
		// Blank until the wires are grown; circuit film then shows its mask alone for those first frames.
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, circuitSide, circuitSide, 0, gl.RGBA, gl.UNSIGNED_BYTE, circuitTile);
		if (circuitTile) {
			this.#circuitReady = Promise.resolve();
		} else {
			this.#circuitReady = circuitWires().then(tile => {
				if (this.#lost || this.#resources?.circuit !== circuit) return;
				gl.bindTexture(gl.TEXTURE_2D, circuit);
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, circuitSide, circuitSide, gl.RGBA, gl.UNSIGNED_BYTE, tile);
			});
		}
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		return { programs, vao, instances, atlas, inkAtlas, circuit };
	}

	#atlasTexture(): WebGLTexture {
		const gl = this.#gl;
		const texture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.#atlasSize, this.#atlasSize);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return texture;
	}

	/**
	 * Doubles the atlas and repacks every map into it. Called once evicting off-screen maps has not
	 * made room, so a screen of large cards still gets a map each; returns false at the GPU's limit.
	 */
	grow(): boolean {
		const resources = this.#resources;
		const limit = Math.min(ATLAS_LIMIT, this.#gl.getParameter(this.#gl.MAX_TEXTURE_SIZE) as number);
		if (!resources || this.#lost || this.#atlasSize * 2 > limit) return false;
		this.#atlasSize *= 2;
		this.#gl.deleteTexture(resources.atlas);
		this.#gl.deleteTexture(resources.inkAtlas);
		resources.atlas = this.#atlasTexture();
		resources.inkAtlas = this.#atlasTexture();
		this.#repack();
		return true;
	}

	has(key: string): boolean {
		return this.#maps.has(key);
	}

	/** Stores a card's surface map, repacking the atlas when it fills; returns false when the map cannot fit at all. */
	add(key: string, map: SurfaceMap): boolean {
		if (this.#maps.has(key)) return true;
		if (!this.#upload(key, map)) {
			this.#repack();
			if (!this.#upload(key, map)) return false;
		}
		this.#maps.set(key, map);
		return true;
	}

	/** Drops a card's map, for instance after its text refits. */
	forget(key: string): void {
		this.#maps.delete(key);
		this.#tiles.delete(key);
	}

	/** Packs the live maps from the top, reclaiming space that forgotten maps left behind. */
	#repack(): void {
		this.#tiles.clear();
		this.#shelfX = this.#shelfY = this.#shelfHeight = 0;
		for (const [key, map] of this.#maps) this.#upload(key, map);
	}

	#upload(key: string, map: SurfaceMap): boolean {
		if (this.#shelfX + map.width > this.#atlasSize) {
			this.#shelfX = 0;
			this.#shelfY += this.#shelfHeight + 2;
			this.#shelfHeight = 0;
		}
		if (this.#shelfY + map.height > this.#atlasSize) return false;
		const tile = { x: this.#shelfX, y: this.#shelfY, width: map.width, height: map.height };
		this.#shelfX += map.width + 2;
		this.#shelfHeight = Math.max(this.#shelfHeight, map.height);
		this.#tiles.set(key, tile);
		const resources = this.#resources;
		if (!resources || this.#lost) return true;
		const gl = this.#gl;
		gl.bindTexture(gl.TEXTURE_2D, resources.atlas);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, tile.x, tile.y, tile.width, tile.height, gl.RGBA, gl.UNSIGNED_BYTE, map.data);
		gl.bindTexture(gl.TEXTURE_2D, resources.inkAtlas);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, tile.x, tile.y, tile.width, tile.height, gl.RGBA, gl.UNSIGNED_BYTE, map.ink);
		return true;
	}

	/** Sizes the drawing buffer to the canvas's CSS box at `pixelRatio`. */
	resize(width: number, height: number, pixelRatio: number): void {
		this.#width = width;
		this.#height = height;
		const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
		const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
		if (this.#canvas.width !== pixelWidth) this.#canvas.width = pixelWidth;
		if (this.#canvas.height !== pixelHeight) this.#canvas.height = pixelHeight;
	}

	/** Starts compiling the programs for cards of these eras, under these options, before any of them is drawn. */
	warm(eras: readonly CardEra[], options: LightOptions = {}): void {
		const resources = this.#resources;
		if (!resources || this.#lost) return;
		for (const era of eras) resources.programs.warm(programSpec(HOLO_PATTERNS.indexOf(ERA_HOLO[era]), FOIL_PLATES.indexOf(ERA_FOIL[era]), options));
	}

	/**
	 * Lights every card that has a surface map; cards without one keep their static finish. Returns false when a card
	 * was skipped because its program is still compiling, so the caller can draw again next frame.
	 */
	draw(cards: readonly LitCard[], options: LightOptions = {}): boolean {
		const resources = this.#resources;
		if (!resources || this.#lost || !this.#width || !this.#height) return true;
		// Cards that show the same films and plate share a program and one instanced draw.
		const groups = new Map<string, { spec: ProgramSpec; cards: { card: LitCard; tile: Tile; film: number; plate: number }[] }>();
		for (const card of cards) {
			const tile = this.#tiles.get(card.key);
			if (!tile) continue;
			const film = HOLO_PATTERNS.indexOf(card.film ?? (card.era ? ERA_HOLO[card.era] : 'refractor'));
			const plate = FOIL_PLATES.indexOf(card.plate ?? (card.era ? ERA_FOIL[card.era] : 'brushed'));
			const spec = programSpec(film, plate, options);
			const key = programKey(spec);
			let group = groups.get(key);
			if (!group) groups.set(key, group = { spec, cards: [] });
			group.cards.push({ card, tile, film, plate });
		}
		const gl = this.#gl;
		gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		let complete = true;
		for (const group of groups.values()) {
			const program = resources.programs.get(group.spec);
			if (!program) {
				complete = false;
				continue;
			}
			if (this.#data.length < group.cards.length * FLOATS) this.#data = new Float32Array(group.cards.length * FLOATS * 2);
			const data = this.#data;
			group.cards.forEach(({ card, tile, film, plate }, index) => this.#pack(data, index * FLOATS, card, tile, film, plate));
			gl.useProgram(program.program);
			this.#setUniforms(program.uniforms, options);
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, resources.circuit);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, resources.inkAtlas);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, resources.atlas);
			gl.bindVertexArray(resources.vao);
			gl.bindBuffer(gl.ARRAY_BUFFER, resources.instances);
			gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, group.cards.length * FLOATS), gl.DYNAMIC_DRAW);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, group.cards.length);
			gl.bindVertexArray(null);
		}
		return complete;
	}

	/** Writes one card's instance attributes at `offset`. */
	#pack(data: Float32Array, offset: number, card: LitCard, tile: Tile, film: number, plate: number): void {
		data[offset] = card.originX;
		data[offset + 1] = card.originY;
		data[offset + 2] = card.axisXx;
		data[offset + 3] = card.axisXy;
		data[offset + 4] = card.axisYx;
		data[offset + 5] = card.axisYy;
		data[offset + 6] = tile.x / this.#atlasSize;
		data[offset + 7] = tile.y / this.#atlasSize;
		data[offset + 8] = tile.width / this.#atlasSize;
		data[offset + 9] = tile.height / this.#atlasSize;
		data[offset + 10] = card.lightX;
		data[offset + 11] = card.lightY;
		data[offset + 12] = card.spotlight;
		data[offset + 13] = TIER_CODE[card.tier] + 4 * film + 128 * plate;
		data[offset + 14] = card.viewX ?? 0;
		data[offset + 15] = card.viewY ?? 0;
		// The film's shift samples two sines of the card's seed, a pattern index the way a printed skin has one.
		const seed = (card.pattern ?? 0) * Math.PI * 2;
		data[offset + 16] = Math.sin(seed * 7.0) * FILM_SHIFT;
		data[offset + 17] = Math.sin(seed * 11.0 + 1.3) * FILM_SHIFT;
		const tuning = card.plateTuning ?? (card.era ? ERA_PLATE_TUNING[card.era] : ERA_PLATE_TUNING['1960s']);
		data[offset + 18] = tuning.scale;
		data[offset + 19] = tuning.tone;
		data[offset + 20] = tuning.stain;
		data[offset + 21] = tuning.vivid ?? 1;
	}

	#setUniforms(uniforms: Uniforms, options: LightOptions): void {
		const gl = this.#gl;
		gl.uniform2f(uniforms.resolution, this.#width, this.#height);
		gl.uniform1f(uniforms.texel, 1 / this.#atlasSize);
		gl.uniform1f(uniforms.relief, options.relief ?? DEFAULT_LIGHT.relief);
		gl.uniform1f(uniforms.lightHeight, options.lightHeight ?? DEFAULT_LIGHT.lightHeight);
		gl.uniform1f(uniforms.glare, options.glare ?? DEFAULT_LIGHT.glare);
		gl.uniform1f(uniforms.shine, options.shine ?? DEFAULT_LIGHT.shine);
		gl.uniform1f(uniforms.foil, options.foil ?? DEFAULT_LIGHT.foil);
		gl.uniform1f(uniforms.coat, options.coat ?? DEFAULT_LIGHT.coat);
		gl.uniform1f(uniforms.holoPattern, options.holoPattern ?? DEFAULT_LIGHT.holoPattern);
		gl.uniform1f(uniforms.holoScale, options.holoScale ?? DEFAULT_LIGHT.holoScale);
		gl.uniform1f(uniforms.waves, options.waves ?? DEFAULT_LIGHT.waves);
		gl.uniform1f(uniforms.brush, options.brush ?? DEFAULT_LIGHT.brush);
		gl.uniform1f(uniforms.foilMode, options.foilMode ?? DEFAULT_LIGHT.foilMode);
		gl.uniform1f(uniforms.shift, options.shift ?? DEFAULT_LIGHT.shift);
		gl.uniform1f(uniforms.time, options.time ?? performance.now() / 1000 % 3600);
		gl.uniform1f(uniforms.paper, options.paper ?? DEFAULT_LIGHT.paper);
		gl.uniform1f(uniforms.wash, options.wash ?? DEFAULT_LIGHT.wash);
		gl.uniform1f(uniforms.foilPlate, options.foilPlate ?? DEFAULT_LIGHT.foilPlate);
		gl.uniform1f(uniforms.plateDepth, options.plateDepth ?? DEFAULT_LIGHT.plateDepth);
		gl.uniform1f(uniforms.plateScale, options.plateScale ?? DEFAULT_LIGHT.plateScale);
		gl.uniform1f(uniforms.plateTone, options.plateTone ?? DEFAULT_LIGHT.plateTone);
		gl.uniform1f(uniforms.stain, options.stain ?? DEFAULT_LIGHT.stain);
		const tune = (which: WebGLUniformLocation | null, values: WebGLUniformLocation | null, module: ModuleTune | null | undefined) => {
			gl.uniform1i(which, module ? module.index : -1);
			const slots = new Float32Array(TUNE_SLOTS);
			if (module) slots.set(module.values.slice(0, TUNE_SLOTS));
			gl.uniform1fv(values, slots);
		};
		tune(uniforms.tuneFilm, uniforms.filmTune, options.filmTune);
		tune(uniforms.tuneFinish, uniforms.finishTune, options.finishTune);
		tune(uniforms.tunePlate, uniforms.plateTune, options.plateTune);
		gl.uniform1i(uniforms.finish, options.finish ?? DEFAULT_LIGHT.finish);
		gl.uniform1i(uniforms.palette, options.palette ?? DEFAULT_LIGHT.palette);
		const gradient = gradientUniforms(options.customGradient ?? DEFAULT_LIGHT.customGradient);
		gl.uniform1i(uniforms.customGradientCount, gradient.count);
		gl.uniform3fv(uniforms.customGradient, gradient.colors);
		gl.uniform1f(uniforms.plateUnderFilm, options.plateUnderFilm ?? DEFAULT_LIGHT.plateUnderFilm);
		gl.uniform1i(uniforms.underFilm, options.underFilm ?? DEFAULT_LIGHT.underFilm);
		gl.uniform1f(uniforms.underMix, options.underMix ?? DEFAULT_LIGHT.underMix);
	}

	destroy(): void {
		this.#canvas.removeEventListener('webglcontextlost', this.#onLost as EventListener);
		this.#canvas.removeEventListener('webglcontextrestored', this.#onRestored as EventListener);
		const resources = this.#resources;
		if (resources && !this.#lost) {
			const gl = this.#gl;
			gl.deleteTexture(resources.atlas);
			gl.deleteTexture(resources.inkAtlas);
			gl.deleteTexture(resources.circuit);
			gl.deleteBuffer(resources.instances);
			gl.deleteVertexArray(resources.vao);
			resources.programs.destroy();
		}
		this.#resources = null;
		this.#maps.clear();
		this.#tiles.clear();
	}
}
