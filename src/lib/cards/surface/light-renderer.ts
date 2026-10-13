import type { Finish } from '../finish.ts';
import { RELIEF_RANGE } from './surfaces.ts';
import type { SurfaceMap } from './surface-map.ts';

/**
 * Draws the light on many cards in one WebGL2 pass over their DOM fronts. The DOM supplies colour;
 * this pass adds relief shading, specular light, foil reflection and iridescence from each card's
 * surface map. Output is premultiplied, so dark relief reads as a multiply and highlights as light.
 */

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
	tier: Finish;
}

/** Tuning a scene can change between draws. */
export interface LightOptions {
	/** How steeply relief slopes read; higher makes lettering look deeper. */
	relief?: number;
	/** Light height above the card, in sevenths of the card's height; lower rakes across relief and lengthens its shade. */
	lightHeight?: number;
}

const DEFAULT_RELIEF = 6;
const DEFAULT_LIGHT_HEIGHT = 3.2;
type LightCanvas = HTMLCanvasElement | OffscreenCanvas;

const TIER_CODE: Record<Finish, number> = { base: 0, foil: 1, emboss: 2, gem: 3 };
const ATLAS_SIZE = 2048;
const FLOATS = 16;

const VERTEX = `#version 300 es
layout(location = 0) in vec2 a_origin;
layout(location = 1) in vec4 a_axes;
layout(location = 2) in vec4 a_tile;
layout(location = 3) in vec4 a_light;
uniform vec2 u_resolution;
out vec2 v_card;
out vec2 v_atlas;
flat out vec4 v_tile;
flat out vec4 v_light;
void main() {
	vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
	vec2 position = a_origin + corner.x * a_axes.xy + corner.y * a_axes.zw;
	v_card = corner;
	v_atlas = a_tile.xy + corner * a_tile.zw;
	v_tile = a_tile;
	v_light = a_light;
	vec2 clip = position / u_resolution * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_card;
in vec2 v_atlas;
flat in vec4 v_tile;
flat in vec4 v_light;
uniform sampler2D u_map;
uniform float u_texel;
uniform float u_relief;
uniform float u_lightHeight;
out vec4 o_color;

const vec2 CARD = vec2(5.0, 7.0);

vec4 surface(vec2 offset) {
	vec2 lo = v_tile.xy + 0.5 * u_texel;
	vec2 hi = v_tile.xy + v_tile.zw - 0.5 * u_texel;
	return texture(u_map, clamp(v_atlas + offset * u_texel, lo, hi));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 rainbow(float t) { return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }

void over(inout vec4 target, vec3 color, float alpha) {
	alpha = clamp(alpha, 0.0, 1.0);
	target = vec4(color * alpha + target.rgb * (1.0 - alpha), alpha + target.a * (1.0 - alpha));
}

void main() {
	// Rounded card corners, 1.8% of the width.
	vec2 p = v_card * CARD;
	vec2 inner = clamp(p, vec2(0.09), CARD - 0.09);
	if (length(p - inner) > 0.09) discard;

	vec4 here = surface(vec2(0.0));
	float metal = here.g;
	float gloss = here.b;
	float iridescence = here.a;
	float height = (here.r - 0.5) * 2.0 * ${RELIEF_RANGE.toFixed(1)};

	// Relief slopes from two sampling radii: the near pair keeps edges crisp, the far pair rounds them.
	float dx = (surface(vec2(1.25, 0.0)).r - surface(vec2(-1.25, 0.0)).r) * 0.6 + (surface(vec2(2.5, 0.0)).r - surface(vec2(-2.5, 0.0)).r) * 0.4;
	float dy = (surface(vec2(0.0, 1.25)).r - surface(vec2(0.0, -1.25)).r) * 0.6 + (surface(vec2(0.0, 2.5)).r - surface(vec2(0.0, -2.5)).r) * 0.4;
	vec3 normal = normalize(vec3(-dx * u_relief, -dy * u_relief, 1.0));
	// Uncoated stock shows its fiber; a coat fills it in.
	float fiber = (1.0 - gloss) * 0.18;
	normal = normalize(normal + vec3(noise(p * 46.0) - 0.5, noise(p * 46.0 + 17.0) - 0.5, 0.0) * fiber);

	vec3 lightPosition = vec3(v_light.xy * CARD, u_lightHeight);
	vec3 toLight = normalize(lightPosition - vec3(p, height * 0.05));
	vec3 view = vec3(0.0, 0.0, 1.0);
	float intensity = 0.55 + 0.45 * v_light.z;

	vec4 result = vec4(0.0);
	float tier = v_light.w;
	vec3 tint = tier > 2.5 ? vec3(0.96, 0.93, 1.0) : tier > 1.5 ? vec3(1.0, 0.8, 0.42) : vec3(0.9, 0.93, 0.97);

	// Foil reflects a soft environment that slides as the light moves.
	vec3 reflected = reflect(-view, normal);
	float band = 0.5 + 0.5 * sin(reflected.x * 5.0 + reflected.y * 3.0 + (p.x * 0.55 + p.y * 0.3) - v_light.x * 6.0 - v_light.y * 2.0);
	vec3 foil = tint * (0.45 + 0.65 * band);
	vec3 holo = rainbow(band * 0.7 + p.x * 0.06 + p.y * 0.04 + dot(normal.xy, vec2(1.6, 1.1)));
	foil = mix(foil, holo, iridescence * 0.85);
	// Foil areas take the reflection as their colour; a chrome coat only catches highlights.
	over(result, foil, smoothstep(0.45, 0.9, metal) * 0.55);

	// Relief light and shade, relative to the flat stock so unrelieved print keeps its colour.
	float lambert = dot(normal, toLight) - toLight.z;
	over(result, vec3(0.0), max(-lambert, 0.0) * 0.8);
	over(result, mix(vec3(1.0), tint, metal), max(lambert, 0.0) * 0.5 * intensity);

	// Coat and foil highlights: tight and bright on mirror coats, broad and faint on matte stock.
	vec3 halfway = normalize(toLight + view);
	float shininess = mix(6.0, 140.0, gloss);
	float specular = pow(max(dot(normal, halfway), 0.0), shininess) * mix(0.04, 0.85, gloss) * intensity;
	vec3 shine = mix(vec3(1.0), mix(tint, holo, iridescence), metal * 0.7);
	over(result, shine, specular);

	// A spotlight lifts a soft glare over the whole card.
	float glare = exp(-dot(p - lightPosition.xy, p - lightPosition.xy) / 6.0) * v_light.z * 0.12;
	over(result, vec3(1.0), glare);

	o_color = result;
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('WebGL could not create a shader.');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed.');
	return shader;
}

interface Tile {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Resources {
	program: WebGLProgram;
	vao: WebGLVertexArrayObject;
	instances: WebGLBuffer;
	atlas: WebGLTexture;
	uniforms: { resolution: WebGLUniformLocation | null; texel: WebGLUniformLocation | null; relief: WebGLUniformLocation | null; lightHeight: WebGLUniformLocation | null };
}

export class LightRenderer {
	readonly #canvas: LightCanvas;
	readonly #gl: WebGL2RenderingContext;
	#resources: Resources | null = null;
	readonly #maps = new Map<string, SurfaceMap>();
	readonly #tiles = new Map<string, Tile>();
	#shelfX = 0;
	#shelfY = 0;
	#shelfHeight = 0;
	#data = new Float32Array(FLOATS * 64);
	#width = 0;
	#height = 0;
	#lost = false;

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
		const program = gl.createProgram();
		if (!program) throw new Error('WebGL could not create a program.');
		gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
		gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link failed.');
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
		gl.bindVertexArray(null);
		const atlas = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, atlas);
		gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, ATLAS_SIZE, ATLAS_SIZE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.useProgram(program);
		gl.uniform1i(gl.getUniformLocation(program, 'u_map'), 0);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		return {
			program,
			vao,
			instances,
			atlas,
			uniforms: {
				resolution: gl.getUniformLocation(program, 'u_resolution'),
				texel: gl.getUniformLocation(program, 'u_texel'),
				relief: gl.getUniformLocation(program, 'u_relief'),
				lightHeight: gl.getUniformLocation(program, 'u_lightHeight')
			}
		};
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
		if (this.#shelfX + map.width > ATLAS_SIZE) {
			this.#shelfX = 0;
			this.#shelfY += this.#shelfHeight + 2;
			this.#shelfHeight = 0;
		}
		if (this.#shelfY + map.height > ATLAS_SIZE) return false;
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

	/** Lights every card that has a surface map; cards without one keep their static finish. */
	draw(cards: readonly LitCard[], options: LightOptions = {}): void {
		const resources = this.#resources;
		if (!resources || this.#lost || !this.#width || !this.#height) return;
		if (this.#data.length < cards.length * FLOATS) this.#data = new Float32Array(cards.length * FLOATS * 2);
		const data = this.#data;
		let count = 0;
		for (const card of cards) {
			const tile = this.#tiles.get(card.key);
			if (!tile) continue;
			const offset = count * FLOATS;
			data[offset] = card.originX;
			data[offset + 1] = card.originY;
			data[offset + 2] = card.axisXx;
			data[offset + 3] = card.axisXy;
			data[offset + 4] = card.axisYx;
			data[offset + 5] = card.axisYy;
			data[offset + 6] = tile.x / ATLAS_SIZE;
			data[offset + 7] = tile.y / ATLAS_SIZE;
			data[offset + 8] = tile.width / ATLAS_SIZE;
			data[offset + 9] = tile.height / ATLAS_SIZE;
			data[offset + 10] = card.lightX;
			data[offset + 11] = card.lightY;
			data[offset + 12] = card.spotlight;
			data[offset + 13] = TIER_CODE[card.tier];
			count += 1;
		}
		const gl = this.#gl;
		gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (!count) return;
		gl.useProgram(resources.program);
		gl.uniform2f(resources.uniforms.resolution, this.#width, this.#height);
		gl.uniform1f(resources.uniforms.texel, 1 / ATLAS_SIZE);
		gl.uniform1f(resources.uniforms.relief, options.relief ?? DEFAULT_RELIEF);
		gl.uniform1f(resources.uniforms.lightHeight, options.lightHeight ?? DEFAULT_LIGHT_HEIGHT);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, resources.atlas);
		gl.bindVertexArray(resources.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, resources.instances);
		gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * FLOATS), gl.DYNAMIC_DRAW);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
		gl.bindVertexArray(null);
	}

	destroy(): void {
		this.#canvas.removeEventListener('webglcontextlost', this.#onLost as EventListener);
		this.#canvas.removeEventListener('webglcontextrestored', this.#onRestored as EventListener);
		const resources = this.#resources;
		if (resources && !this.#lost) {
			const gl = this.#gl;
			gl.deleteTexture(resources.atlas);
			gl.deleteBuffer(resources.instances);
			gl.deleteVertexArray(resources.vao);
			gl.deleteProgram(resources.program);
		}
		this.#resources = null;
		this.#maps.clear();
		this.#tiles.clear();
	}
}
