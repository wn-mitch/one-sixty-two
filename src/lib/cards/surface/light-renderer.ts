import type { Finish } from '../finish.ts';
import type { CardEra } from '../view-model.ts';
import { HGH_SEQUENCE } from '../hgh.ts';
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
	/** Where the viewer sits relative to the card's face, from its tilt: the sine of the lean toward each axis. */
	viewX?: number;
	viewY?: number;
	tier: Finish;
	/** The card's era, which picks its holo pattern unless the options force one. */
	era?: CardEra;
	/** A stable 0..1 seed per card that shifts its holo film, so two cards of one era never print the same cut. */
	pattern?: number;
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
}

/** Holo film patterns, in the order the shader numbers them. */
export const HOLO_PATTERNS = ['refractor', 'prizm', 'cracked-ice', 'spun', 'brilliant', 'shimmer', 'atomic', 'xfractor', 'mojo', 'geodesic', 'carpet', 'circuit', 'dollar', 'hgh', 'hgh-sequence'] as const;
export type HoloPattern = (typeof HOLO_PATTERNS)[number];
/**
 * Each era's holo film: Atomic Age bubbles for the 1950s, a geodesic dome for the 1960s, a psychedelic
 * mojo swirl for the 1970s, Xfractor grids for the 1980s, a circuit board for the 1990s, the
 * skeletal formula of human growth hormone for the 2000s, Prizm facets for the 2010s, and dollar signs for the 2020s.
 */
export const ERA_HOLO: Readonly<Record<CardEra, HoloPattern>> = {
	'1950s': 'atomic', '1960s': 'geodesic', '1970s': 'mojo', '1980s': 'xfractor',
	'1990s': 'circuit', '2000s': 'hgh', '2010s': 'prizm', '2020s': 'dollar'
};
/** The shipped light, used for every option a scene leaves unset; the finish gallery opens on it. */
export const DEFAULT_LIGHT: Readonly<Required<LightOptions>> = {
	relief: 6, lightHeight: 7.6, glare: 0.13, shine: 2.2, foil: 1, coat: 0.35,
	// -1 lets each card's era choose its film.
	holoPattern: -1, holoScale: 8, waves: 3, brush: 0.6,
	// 1 is colour-over: foil takes the tint of the ink it covers.
	foilMode: 1, shift: 8.5, paper: 1
};
type LightCanvas = HTMLCanvasElement | OffscreenCanvas;

const TIER_CODE: Record<Finish, number> = { base: 0, foil: 1, emboss: 2, gem: 3 };
/** The atlas starts small for phones and doubles, up to the GPU's limit, when the cards on screen outgrow it. */
const ATLAS_SIZE = 2048;
const ATLAS_LIMIT = 4096;
const FLOATS = 18;
/** How far, in card units, a card's seed can shift its holo film. */
const FILM_SHIFT = 2.5;

const VERTEX = `#version 300 es
layout(location = 0) in vec2 a_origin;
layout(location = 1) in vec4 a_axes;
layout(location = 2) in vec4 a_tile;
layout(location = 3) in vec4 a_light;
layout(location = 4) in vec4 a_view;
uniform vec2 u_resolution;
out vec2 v_card;
out vec2 v_atlas;
flat out vec4 v_tile;
flat out vec4 v_light;
flat out vec4 v_view;
void main() {
	vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
	vec2 position = a_origin + corner.x * a_axes.xy + corner.y * a_axes.zw;
	v_card = corner;
	v_atlas = a_tile.xy + corner * a_tile.zw;
	v_tile = a_tile;
	v_light = a_light;
	v_view = a_view;
	vec2 clip = position / u_resolution * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

// The HGH film draws a ring wherever a residue is aromatic.
const HGH_AROMATIC = Array.from({ length: Math.ceil(HGH_SEQUENCE.length / 32) }, (_, word) =>
	[...HGH_SEQUENCE.slice(word * 32, word * 32 + 32)].reduce((bits, residue, bit) => 'FYWH'.includes(residue) ? (bits | (1 << bit)) >>> 0 : bits, 0));

/** A 5×6 dot-matrix face for the twenty amino-acid letters, rows top to bottom, for the HGH sequence film. */
const MICROTYPE: Readonly<Record<string, string>> = {
	A: '.###. #...# #...# ##### #...# #...#', C: '.#### #.... #.... #.... #.... .####', D: '####. #...# #...# #...# #...# ####.',
	E: '##### #.... ####. #.... #.... #####', F: '##### #.... ####. #.... #.... #....', G: '.#### #.... #.### #...# #...# .###.',
	H: '#...# #...# ##### #...# #...# #...#', I: '##### ..#.. ..#.. ..#.. ..#.. #####', K: '#...# #..#. ###.. #..#. #...# #...#',
	L: '#.... #.... #.... #.... #.... #####', M: '#...# ##.## #.#.# #...# #...# #...#', N: '#...# ##..# #.#.# #..## #...# #...#',
	P: '####. #...# ####. #.... #.... #....', Q: '.###. #...# #...# #.#.# #..#. .##.#', R: '####. #...# ####. #.#.. #..#. #...#',
	S: '.#### #.... .###. ....# ....# ####.', T: '##### ..#.. ..#.. ..#.. ..#.. ..#..', V: '#...# #...# #...# #...# .#.#. ..#..',
	W: '#...# #...# #.#.# #.#.# ##.## #...#', Y: '#...# .#.#. ..#.. ..#.. ..#.. ..#..'
};
const MICROTYPE_LETTERS = Object.keys(MICROTYPE);
const MICROTYPE_GLYPHS = MICROTYPE_LETTERS.map(letter => [...MICROTYPE[letter]!.replaceAll(' ', '')].reduce((bits, dot, index) => dot === '#' ? (bits | (1 << index)) >>> 0 : bits, 0));
/** The sequence as glyph indices, six 5-bit indices to a word. */
const HGH_GLYPHS = Array.from({ length: Math.ceil(HGH_SEQUENCE.length / 6) }, (_, word) =>
	[...HGH_SEQUENCE.slice(word * 6, word * 6 + 6)].reduce((bits, residue, slot) => (bits | (MICROTYPE_LETTERS.indexOf(residue) << (slot * 5))) >>> 0, 0));

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_card;
in vec2 v_atlas;
flat in vec4 v_tile;
flat in vec4 v_light;
flat in vec4 v_view;
uniform sampler2D u_map;
uniform sampler2D u_ink;
uniform float u_foilMode;
uniform float u_shift;
uniform float u_time;
uniform float u_paper;
uniform float u_texel;
uniform float u_relief;
uniform float u_lightHeight;
uniform float u_glare;
uniform float u_shine;
uniform float u_foil;
uniform float u_coat;
uniform float u_holoPattern;
uniform float u_holoScale;
uniform float u_waves;
uniform float u_brush;
out vec4 o_color;

const vec2 CARD = vec2(5.0, 7.0);

vec4 surface(vec2 offset) {
	vec2 lo = v_tile.xy + 0.5 * u_texel;
	vec2 hi = v_tile.xy + v_tile.zw - 0.5 * u_texel;
	return texture(u_map, clamp(v_atlas + offset * u_texel, lo, hi));
}

vec4 printed() {
	vec2 lo = v_tile.xy + 0.5 * u_texel;
	vec2 hi = v_tile.xy + v_tile.zw - 0.5 * u_texel;
	return texture(u_ink, clamp(v_atlas, lo, hi));
}

float lightness(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 rainbow(float t) { return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 19.19)); }
const uint HGH_AROMATIC[${HGH_AROMATIC.length}] = uint[](${HGH_AROMATIC.map(word => `${word}u`).join(', ')});
const float HGH_LENGTH = ${HGH_SEQUENCE.length}.0;
const uint MICROTYPE[${MICROTYPE_GLYPHS.length}] = uint[](${MICROTYPE_GLYPHS.map(word => `${word}u`).join(', ')});
const uint HGH_GLYPHS[${HGH_GLYPHS.length}] = uint[](${HGH_GLYPHS.map(word => `${word}u`).join(', ')});
bool microDot(float residue, int x, int y) {
	int r = int(mod(residue, HGH_LENGTH));
	uint glyph = MICROTYPE[(HGH_GLYPHS[r / 6] >> uint((r % 6) * 5)) & 31u];
	return ((glyph >> uint(y * 5 + x)) & 1u) == 1u;
}
bool aromatic(float residue) { int r = int(mod(residue, HGH_LENGTH)); return ((HGH_AROMATIC[r / 32] >> uint(r % 32)) & 1u) == 1u; }
float hexagon(vec2 p, float r) { p = abs(p); return max(dot(p, vec2(0.5, 0.86603)), p.x) - r; }
float segment(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0)); }

// Holo foil gets its colour from fine grooves that split light by wavelength, so the hue follows how
// the light-to-eye direction crosses the grooves. Patterned foils run the grooves a different way in
// each facet or shard, so neighbouring pieces flash different colours. The flash output is how squarely a
// piece's grooves face the light.
// Card units one screen pixel spans, set in main before any branch so its derivatives are defined.
float footprint = 1.0;
vec3 holoFoil(vec2 p, vec3 normal, vec3 halfway, float band, float pattern, out float flash) {
	flash = 0.0;
	int film = int(pattern + 0.5);
	if (film == 0) return rainbow(band * 0.7 + p.x * 0.06 + p.y * 0.04 + dot(normal.xy, vec2(1.6, 1.1)));
	vec2 groove = vec2(1.0, 0.0);
	float seed = 0.0;
	// Films whose grooves run continuously show their full colour; faceted films are mostly silver between flashes.
	float vivid = 0.0;
	float copper = 0.0;
	float copperPad = 0.0;
	// The film's repeat, in card units; a patterned film fades to a smooth sweep once it shrinks to a few pixels.
	float cellSize = 100.0;
	if (film == 1) {
		cellSize = 1.0 / (u_holoScale * 0.55);
		// Prizm: a lattice of triangular facets, large enough to read one by one.
		vec2 q = p * u_holoScale * 0.55;
		vec2 skew = vec2(q.x + q.y * 0.57735, q.y * 1.1547);
		vec2 cell = floor(skew);
		vec2 f = fract(skew);
		cell = vec2(cell.x * 2.0 + step(1.0, f.x + f.y), cell.y);
		float angle = hash(cell) * 6.28318;
		groove = vec2(cos(angle), sin(angle));
		seed = hash(cell + 7.0);
	} else if (film == 2) {
		cellSize = 1.0 / (u_holoScale * 0.6);
		// Cracked ice: irregular shards.
		vec2 q = p * u_holoScale * 0.48;
		vec2 i = floor(q);
		vec2 f = fract(q);
		float best = 8.0;
		vec2 id = vec2(0.0);
		for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
			vec2 o = vec2(float(x), float(y));
			vec2 c = o + hash2(i + o) - f;
			float d = dot(c, c);
			if (d < best) { best = d; id = i + o; }
		}
		float angle = hash(id) * 6.28318;
		groove = vec2(cos(angle), sin(angle));
		seed = hash(id + 7.0);
	} else if (film == 3) {
		// Spun grooves: circles around the card's centre, a rainbow that sweeps round as the light moves.
		vec2 r = p - CARD * 0.5;
		groove = length(r) > 1e-3 ? normalize(vec2(-r.y, r.x)) : vec2(1.0, 0.0);
		vivid = 1.0;
	} else if (film == 4) {
		cellSize = 1.0 / (u_holoScale * 0.22);
		// Brilliant: a lattice of cut stones. Each hexagonal cell is six triangular facets around a flat table,
		// every facet grooved across its own radius, so a cell throws fire facet by facet as the card turns.
		vec2 q = p * u_holoScale * 0.22;
		vec2 r = vec2(1.0, 1.7320508);
		vec2 a = mod(q, r) - r * 0.5;
		vec2 b = mod(q - r * 0.5, r) - r * 0.5;
		vec2 local = dot(a, a) < dot(b, b) ? a : b;
		vec2 stone = floor((q - local) * 8.0 + 0.5);
		float facet = floor((atan(local.y, local.x) + 3.14159) / 1.0471976);
		float spin = hash(stone) * 6.28318;
		float middle = (facet + 0.5) * 1.0471976 - 3.14159 + spin * 0.15;
		bool table = length(local) < 0.17;
		float angle = table ? spin : middle + 1.5708;
		groove = vec2(cos(angle), sin(angle));
		seed = hash(stone + (table ? 31.0 : facet * 7.3));
	} else if (film == 5) {
		// Shimmer: hairline streaks, each laid at its own slight angle, so lines of light skate along the card.
		float row = floor(p.y * u_holoScale * 6.0 + noise(vec2(p.x * 1.5, p.y * 3.0)) * 2.0);
		float angle = (hash(vec2(row, 3.0)) - 0.5) * 0.5;
		groove = vec2(cos(angle), sin(angle));
		seed = hash(vec2(row, 11.0));
		vivid = 0.45;
	} else if (film == 6) {
		cellSize = 1.0 / (u_holoScale * 0.5);
		// Atomic: packed bubbles of every size, each a little spun rainbow around its own centre, afloat on a
		// continuous rainbow so the film never dulls to silver between them.
		vec2 q = p * u_holoScale * 0.5;
		vec2 i = floor(q);
		vec2 f = fract(q);
		float best = 8.0;
		vec2 id = vec2(0.0);
		vec2 offset = vec2(0.0);
		for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
			vec2 o = vec2(float(x), float(y));
			vec2 c = o + 0.15 + hash2(i + o) * 0.7 - f;
			float d = dot(c, c);
			if (d < best) { best = d; id = i + o; offset = c; }
		}
		float radius = 0.28 + pow(hash(id + 3.0), 0.7) * 0.4;
		float inside = 1.0 - smoothstep(radius - 0.04, radius, sqrt(best));
		vec2 around = length(offset) > 1e-3 ? normalize(vec2(offset.y, -offset.x)) : vec2(1.0, 0.0);
		groove = normalize(mix(vec2(0.8, 0.6), around, inside) + 1e-4);
		seed = mix(0.0, hash(id + 5.0), inside);
		vivid = 1.0;
	} else if (film == 7) {
		cellSize = 1.0 / (u_holoScale * 0.25);
		// Xfractor: square cells split corner to corner into four triangles that alternate their grooves.
		vec2 q = p * u_holoScale * 0.25;
		vec2 cell = floor(q);
		vec2 f = fract(q) - 0.5;
		float quarter = abs(f.x) > abs(f.y) ? (f.x > 0.0 ? 0.0 : 2.0) : (f.y > 0.0 ? 1.0 : 3.0);
		float angle = quarter * 1.5708 + 0.7854 + mod(cell.x + cell.y, 2.0) * 0.35;
		groove = vec2(cos(angle), sin(angle));
		seed = hash(cell + quarter * 13.0);
	} else if (film == 9) {
		cellSize = 0.25 / (u_holoScale * 0.16);
		// Geodesic: a dome's triangles, each split twice at its midpoints, every panel laid at one of three
		// angles with bright struts along the seams.
		vec2 q = p * u_holoScale * 0.16;
		vec2 skew = vec2(q.x + q.y * 0.57735, q.y * 1.1547);
		vec2 cell = floor(skew);
		vec2 f = fract(skew);
		float upper = step(1.0, f.x + f.y);
		vec3 bary = upper > 0.5 ? vec3(1.0 - f.x, 1.0 - f.y, f.x + f.y - 1.0) : vec3(f.x, f.y, 1.0 - f.x - f.y);
		float panel = cell.x * 7.0 + cell.y * 13.0 + upper * 3.0;
		float strut = min(bary.x, min(bary.y, bary.z));
		for (int k = 0; k < 2; k++) {
			// Midpoint subdivision: the centre triangle or one of the three corner triangles.
			vec3 doubled = bary * 2.0;
			float corner = doubled.x >= 1.0 ? 1.0 : doubled.y >= 1.0 ? 2.0 : doubled.z >= 1.0 ? 3.0 : 0.0;
			bary = corner == 1.0 ? vec3(doubled.x - 1.0, doubled.y, doubled.z)
				: corner == 2.0 ? vec3(doubled.x, doubled.y - 1.0, doubled.z)
				: corner == 3.0 ? vec3(doubled.x, doubled.y, doubled.z - 1.0)
				: vec3(1.0) - doubled;
			panel = panel * 4.0 + corner;
			strut = min(strut * 2.0, min(bary.x, min(bary.y, bary.z)));
		}
		float angle = floor(hash(vec2(panel, 1.0)) * 3.0) * 1.0472 + 0.3;
		groove = vec2(cos(angle), sin(angle));
		seed = hash(vec2(panel, 9.0));
		vivid = smoothstep(0.06, 0.02, strut);
	} else if (film == 10) {
		cellSize = 1.0 / (27.0 * u_holoScale * 0.05);
		// Carpet: a Sierpinski carpet. Each generation of square holes is cut at its own groove angle, so the
		// nested squares sweep through the rainbow out of step with one another.
		vec2 q = fract(p * u_holoScale * 0.05 + 0.5);
		float generation = 4.0;
		for (int k = 0; k < 4; k++) {
			q *= 3.0;
			vec2 digit = floor(q);
			q = fract(q);
			if (generation > 3.5 && digit.x == 1.0 && digit.y == 1.0) generation = float(k);
		}
		float angle = generation * 0.9 + 0.2;
		groove = vec2(cos(angle), sin(angle));
		seed = generation * 0.23;
		vivid = 1.0;
	} else if (film == 11) {
		cellSize = 0.2 / (u_holoScale * 0.6);
		// Circuit: blocks of parallel bus traces, each block running across or down, its lanes jogging over at
		// 45 degrees midway and ending in drilled pads, on a finely hatched silver mask. Rainbow runs along the copper.
		vec2 q = p * u_holoScale * 0.22;
		vec2 block = floor(q);
		vec2 bf = fract(q);
		bool down = hash(block + 17.0) < 0.5;
		float along = down ? bf.y : bf.x;
		float across = down ? bf.x : bf.y;
		float lanes = 4.0 + floor(hash(block + 23.0) * 3.0);
		float pitch = 1.0 / lanes;
		// Half the blocks jog one lane over between 0.42 and 0.42 + pitch.
		float jog = hash(block + 29.0) < 0.5 ? 1.0 : 0.0;
		float shifted = across - jog * clamp(along - 0.42, 0.0, pitch);
		float lane = floor(shifted * lanes);
		float inLane = fract(shifted * lanes) - 0.5;
		bool live = hash(block * 3.1 + lane) > 0.2 && lane >= 0.0 && lane < lanes - (jog > 0.5 ? 1.0 : 0.0);
		float ends = 0.12 + hash(block + lane * 5.0) * 0.08;
		float span = step(ends, along) * step(along, 1.0 - ends);
		float trace = live ? smoothstep(0.32, 0.22, abs(inLane)) * span : 0.0;
		vec2 endPoint = vec2(inLane * pitch, along - (along < 0.5 ? ends : 1.0 - ends));
		float r = length(endPoint) / pitch;
		float pad = live ? smoothstep(0.4, 0.32, r) * smoothstep(0.1, 0.16, r) : 0.0;
		vec2 run = down ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
		bool jogging = jog > 0.5 && along > 0.42 && along < 0.42 + pitch;
		vec2 dir = jogging ? normalize(run + (down ? vec2(1.0, 0.0) : vec2(0.0, 1.0))) : run;
		vec2 around = r > 1e-3 ? vec2(-endPoint.y, endPoint.x) / (r * pitch) : vec2(1.0, 0.0);
		if (down) around = around.yx;
		float metal = max(trace, pad);
		copper = metal;
		copperPad = pad;
		groove = normalize(mix(mix(vec2(0.6, 0.8), dir, trace), around, pad) + 1e-4);
		seed = mix(hash(block + 3.0) * 0.3, hash(block + lane + 5.0), metal);
		vivid = mix(0.12, 1.0, metal);
	} else if (film == 12) {
		cellSize = 0.6 / (u_holoScale * 0.17);
		// Dollar: a diamond tile. Every diamond is cut into four faint facets with bright seams between diamonds, and
		// carries an upright dollar sign grooved along its stroke so the rainbow runs round the curves.
		// Tall diamonds just clear the sign: half 0.27 wide and 0.42 high in sign units.
		vec2 q = p * u_holoScale * 0.17;
		vec2 g = q / vec2(0.27, 0.42);
		vec2 r = vec2(g.x + g.y, g.y - g.x) * 0.5;
		vec2 cell = floor(r);
		vec2 f = fract(r) - 0.5;
		// Back to sign units, upright; card y runs down, so c flips it up.
		vec2 c = vec2(f.x - f.y, -(f.x + f.y)) * vec2(0.27, 0.42);
		float seamDistance = 0.5 - max(abs(f.x), abs(f.y));
		float seam = smoothstep(0.04, 0.018, seamDistance);
		float facet = (f.x > 0.0 ? 1.0 : 0.0) + (f.y > 0.0 ? 2.0 : 0.0);
		float w = 0.045;
		vec2 top = c - vec2(0.0, 0.12);
		vec2 bottom = c - vec2(0.0, -0.12);
		float upper = abs(length(top) - 0.12);
		float lower = abs(length(bottom) - 0.12);
		// The top bowl opens at its lower right and the bottom bowl at its upper left, which makes the S.
		if (top.x > 0.0 && top.y < 0.0 && top.x > -top.y * 0.3) upper = 1.0;
		if (bottom.x < 0.0 && bottom.y > 0.0 && -bottom.x > bottom.y * 0.3) lower = 1.0;
		float bar = abs(c.y) < 0.31 ? abs(c.x) : 1.0;
		float stroke = min(min(upper, lower), bar * 1.4);
		float ink = smoothstep(w, w * 0.6, stroke);
		vec2 tangent = upper < lower ? vec2(-top.y, top.x) : vec2(-bottom.y, bottom.x);
		vec2 dir = bar * 1.4 < min(upper, lower) ? vec2(0.0, 1.0) : normalize(tangent + 1e-4);
		// One groove angle per diamond, close to its neighbours', so the ground sweeps in one colour and the signs stand out.
		float facetAngle = 0.9 + (hash(cell + 11.0) - 0.5) * 0.5 + facet * 0.06;
		vec2 ground = vec2(cos(facetAngle), sin(facetAngle));
		vec2 seamRun = normalize(abs(f.x) > abs(f.y) ? vec2(0.27, -0.42) : vec2(0.27, 0.42));
		groove = normalize(mix(mix(ground, seamRun, seam), dir, ink) + 1e-4);
		// Facets share their diamond's colour, offset a little each, so the tile reads as diamonds rather than confetti.
		seed = mix(hash(cell) * 0.15 + facet * 0.04, hash(cell + 5.0), max(ink, seam));
		vivid = mix(0.15, 1.0, max(ink, seam));
		copper = max(ink, seam * 0.35);
		copperPad = ink * 0.55;
	} else if (film == 13) {
		cellSize = 0.87 / (u_holoScale * 0.9);
		// HGH: the skeletal formula of human growth hormone, row after row of its backbone in sequence. Each residue
		// is three zigzag bonds, N to alpha carbon to carbonyl carbon; the carbonyl carries a C=O double bond, the
		// nitrogen a small ring for its atom, and every aromatic residue a benzene ring off its alpha carbon.
		// Rows sit closer than their side chains reach, so each pixel checks its neighbouring rows too and the
		// rings of one row nest between the side chains of the next: one tessellated sheet of formula.
		vec2 q = p * u_holoScale * 0.9;
		float rowHeight = 2.4;
		float home = floor(q.y / rowHeight);
		float dx = 0.86603;
		float bonds = 8.0;
		vec2 dir = vec2(1.0, 0.0);
		float row = home;
		float x = q.x;
		for (int rr = -1; rr <= 1; rr++) {
			float r_ = home + float(rr);
			vec2 local = vec2(q.x + r_ * 1.3, q.y - (r_ + 0.5) * rowHeight);
			float first = floor(local.x / dx);
			for (int k = -1; k <= 1; k++) {
				float atom = first + float(k);
				// Even atoms sit up the zigzag, odd ones down, and their side bonds point away from the chain.
				float side = mod(atom, 2.0) < 0.5 ? -1.0 : 1.0;
				vec2 here = vec2(atom * dx, side * 0.25);
				vec2 next = vec2((atom + 1.0) * dx, -side * 0.25);
				float before = bonds;
				float d = segment(local, here, next);
				if (d < bonds) { bonds = d; dir = normalize(next - here); }
				float global = atom + r_ * 29.0;
				float role = mod(global, 3.0);
				vec2 out_ = vec2(0.0, side);
				if (role > 1.5) {
					// Carbonyl: a double bond to oxygen.
					float dbl = min(segment(local, here + vec2(0.1, 0.0), here + vec2(0.1, 0.8 * side)), segment(local, here - vec2(0.1, 0.0), here + vec2(-0.1, 0.8 * side)));
					if (dbl < bonds) { bonds = dbl; dir = out_; }
				} else if (role > 0.5) {
					// Alpha carbon: a side chain, ringed where the residue is aromatic.
					vec2 tip = here + out_ * 0.7;
					float chain = segment(local, here, tip);
					if (chain < bonds) { bonds = chain; dir = out_; }
					if (aromatic(floor(global / 3.0))) {
						vec2 centre = tip + out_ * 0.5;
						vec2 o = local - centre;
						float ring = min(abs(hexagon(o.yx, 0.43)), abs(length(o) - 0.26));
						if (ring < bonds) { bonds = ring; dir = normalize(vec2(-o.y, o.x) + 1e-4); }
					}
				} else {
					// Nitrogen: a small ring marks the atom.
					vec2 o = local - here;
					float n = abs(length(o) - 0.13);
					if (n < bonds) { bonds = n; dir = normalize(vec2(-o.y, o.x) + 1e-4); }
				}
				if (bonds < before) { row = r_; x = local.x; }
			}
		}
		float ink = smoothstep(0.075, 0.045, bonds);
		groove = normalize(mix(vec2(0.6, 0.8), dir, ink) + 1e-4);
		seed = mix(hash(vec2(row, 3.0)) * 0.3, hash(vec2(floor(x / dx / 3.0), row)), ink);
		vivid = mix(0.12, 1.0, ink);
		copper = ink;
	} else if (film == 14) {
		cellSize = 6.0 / (u_holoScale * 7.0);
		// HGH sequence: the hormone's 191 residues run line after line as dot-matrix microtext, each line picking
		// up the sequence further along, every dot a tiny grooved disc that throws rainbow along the line.
		vec2 q = p * u_holoScale * 7.0;
		float line = floor(q.y / 8.0);
		float column = floor(q.x / 6.0);
		vec2 slot = vec2(mod(q.x, 6.0), mod(q.y, 8.0));
		int dx_ = int(slot.x);
		int dy_ = int(slot.y);
		bool lit = dx_ < 5 && dy_ < 6 && microDot(column + line * 37.0, dx_, dy_);
		float ink = lit ? smoothstep(0.55, 0.35, length(fract(q) - 0.5)) : 0.0;
		groove = normalize(mix(vec2(0.6, 0.8), vec2(1.0, 0.0), ink) + 1e-4);
		seed = mix(hash(vec2(line, 3.0)) * 0.3, hash(vec2(column, line)), ink);
		vivid = mix(0.12, 1.0, ink);
		copper = ink;
	} else if (film == 8) {
		// Mojo: a few whirlpools twist the grooves into spirals, so the rainbow swirls as the card turns.
		vec2 swirl = vec2(0.0);
		for (int k = 0; k < 4; k++) {
			vec2 centre = CARD * vec2(0.2 + 0.6 * hash(vec2(float(k), 1.0)), 0.15 + 0.7 * hash(vec2(float(k), 2.0)));
			vec2 r = p - centre;
			float d = length(r) + 1e-3;
			float twist = d * u_holoScale * 0.35 + float(k) * 1.7;
			vec2 tangent = vec2(-r.y, r.x) / d;
			vec2 radial = r / d;
			swirl += (tangent * cos(twist) + radial * sin(twist)) / (0.6 + d * d);
		}
		groove = normalize(swirl + 1e-4);
		vivid = 1.0;
	}
	// Gratings are far more angle-sensitive than a mirror, so a small tilt sweeps the colour a long way.
	vec2 tilt = halfway.xy * 3.0 + normal.xy * 0.5;
	float across = dot(tilt, vec2(-groove.y, groove.x));
	// A rainbow sweep the pieces share: it rolls across the card as it tilts, and each piece flashes as the sweep passes.
	float sweep = dot(tilt, vec2(0.8, 0.6)) * 1.6 + p.x * 0.09 + p.y * 0.06;
	float pass = 0.5 + 0.5 * sin(sweep * 6.28318);
	flash = pow(max(1.0 - abs(fract(across * 0.5 + seed) - 0.5) * 3.0, 0.0), 3.0) * (0.35 + 0.9 * pass);
	vec3 color = rainbow(sweep + across * 0.6 + seed * 0.2);
	// Patterned foil is mostly silver; a piece shows its colour as its grooves turn toward the light.
	vec3 faceted = seed < 0.0 ? vec3(0.82, 0.84, 0.88) : mix(vec3(0.82, 0.84, 0.88), color, 0.35 + 0.65 * max(flash, pass * 0.6));
	vec3 film_ = mix(faceted, color, vivid);
	float detail = smoothstep(4.0, 12.0, cellSize / footprint);
	// The circuit's mask and the dollar ground sit dim so the copper and the signs read; the circuit's drilled pads and the dollar signs shine gold.
	if (film == 11 || film == 12 || film == 13 || film == 14) film_ = mix(mix(film_ * 0.62, min(film_ * 1.15, 1.0), copper), vec3(1.0, 0.82, 0.48) * (0.8 + 0.4 * pass), copperPad * 0.7);
	// Too small to resolve, the pattern would alias into speckle; it settles into the plain refractor sweep instead.
	vec3 smooth_ = mix(vec3(0.82, 0.84, 0.88), rainbow(band * 0.7 + p.x * 0.06 + p.y * 0.04 + dot(normal.xy, vec2(1.6, 1.1))), 0.6);
	flash *= detail;
	return mix(smooth_, film_, detail);
}


void over(inout vec4 target, vec3 color, float alpha) {
	alpha = clamp(alpha, 0.0, 1.0);
	target = vec4(color * alpha + target.rgb * (1.0 - alpha), alpha + target.a * (1.0 - alpha));
}

void main() {
	// Rounded card corners, 1.8% of the width.
	vec2 p = v_card * CARD;
	footprint = max(length(fwidth(p)), 1e-5);
	vec2 inner = clamp(p, vec2(0.09), CARD - 0.09);
	if (length(p - inner) > 0.09) discard;

	vec4 here = surface(vec2(0.0));
	float metal = here.g;
	float gloss = here.b;
	// Signed around 0.5: holo above, silver foil below.
	float iridescence = max(here.a - 0.5, 0.0) * 2.0;
	float silver = max(0.5 - here.a, 0.0) * 2.0;
	float height = (here.r - 0.5) * 2.0 * ${RELIEF_RANGE.toFixed(1)};

	// Relief slopes from two sampling radii: the near pair keeps edges crisp, the far pair rounds them.
	float dx = (surface(vec2(1.25, 0.0)).r - surface(vec2(-1.25, 0.0)).r) * 0.6 + (surface(vec2(2.5, 0.0)).r - surface(vec2(-2.5, 0.0)).r) * 0.4;
	float dy = (surface(vec2(0.0, 1.25)).r - surface(vec2(0.0, -1.25)).r) * 0.6 + (surface(vec2(0.0, 2.5)).r - surface(vec2(0.0, -2.5)).r) * 0.4;
	vec3 normal = normalize(vec3(-dx * u_relief, -dy * u_relief, 1.0));
	// Uncoated stock shows its fiber; a coat fills it in.
	float fiber = (1.0 - gloss) * 0.18 * u_paper;
	normal = normalize(normal + vec3(noise(p * 46.0) - 0.5, noise(p * 46.0 + 17.0) - 0.5, 0.0) * fiber);

	vec3 lightPosition = vec3(v_light.xy * CARD, u_lightHeight);
	vec3 toLight = normalize(lightPosition - vec3(p, height * 0.05));
	// Tilting the card swings the viewer across its face, which is what makes foil shift on a real card.
	vec3 view = normalize(vec3(v_view.xy * u_shift, 1.0));
	float intensity = 0.55 + 0.45 * v_light.z;

	vec4 result = vec4(0.0);
	// The tier and the era's holo pattern share one slot: tier + 4 * pattern.
	float tier = mod(v_light.w + 0.01, 4.0) - 0.01;
	float pattern = u_holoPattern < -0.5 ? floor(v_light.w / 4.0 + 0.01) : u_holoPattern;
	// Each metal runs from its shadow colour through a saturated body to a near-white hot spot.
	bool gold = tier > 1.5 && tier < 2.5;
	vec3 deep = gold ? vec3(0.32, 0.19, 0.04) : tier > 2.5 ? vec3(0.34, 0.33, 0.4) : vec3(0.27, 0.29, 0.33);
	vec3 body = gold ? vec3(0.93, 0.68, 0.24) : tier > 2.5 ? vec3(0.86, 0.84, 0.94) : vec3(0.78, 0.81, 0.86);
	vec3 hot = gold ? vec3(1.0, 0.95, 0.74) : vec3(1.0);
	deep = mix(deep, vec3(0.27, 0.29, 0.33), silver);
	body = mix(body, vec3(0.78, 0.81, 0.86), silver);
	hot = mix(hot, vec3(1.0), silver);
	vec3 tint = body;

	// Foil mirrors a banded environment that slides as the light moves: dark bands make it read as metal, not paint.
	vec3 reflected = reflect(-view, normal);
	// Waves repeat the stripes across the card; the reflected term grows more slowly so fine surface noise stays noise.
	float band = 0.5 + 0.5 * sin((reflected.x * 5.0 + reflected.y * 3.0) * mix(1.0, u_waves, 0.25) + (p.x * 0.55 + p.y * 0.3) * u_waves - v_light.x * 6.0 - v_light.y * 2.0);
	float glint = pow(band, 6.0);
	// Brushed foil: streaks run across the card and shift the reflection along each one.
	float grain = noise(vec2(p.x * 3.0, p.y * 140.0)) * 0.7 + noise(vec2(p.x * 9.0, p.y * 420.0)) * 0.3;
	band = clamp(band + (grain - 0.5) * u_brush * (1.0 - iridescence) * 0.6, 0.0, 1.0);
	vec3 foil = mix(deep, body, smoothstep(0.08, 0.6, band));
	foil = mix(foil, hot, glint * (0.55 + 0.45 * intensity));
	float flash;
	vec3 holo = holoFoil(p + v_view.zw, normal, normalize(toLight + view), band, pattern, flash);
	holo = mix(holo, vec3(1.0), flash * 0.45) * (0.75 + 0.5 * flash);
	foil = mix(foil, holo, iridescence * 0.85);
	// What the foil does to the ink under its die.
	vec4 ink = printed();
	if (ink.a > 0.01) {
		vec3 base = ink.rgb / ink.a;
		if (u_foilMode > 1.5) {
			// Keeps the ink's lightness, so foiled lettering reads at the contrast it was printed with.
			float sheen = 0.75 + 0.5 * band;
			foil = mix(foil, clamp(foil / max(lightness(foil), 0.05) * lightness(base) * sheen, 0.0, 1.0), ink.a);
		} else if (u_foilMode > 0.5) {
			// Colour over foil: the metal takes the ink's hue and lifts its lightness toward the metal's, so
			// dark ink still glints as foil while light and dark print stay apart. Near-grey ink leaves the metal's hue.
			float inkLevel = lightness(base);
			float chroma = smoothstep(0.02, 0.12, length(base - vec3(inkLevel)));
			vec3 hue = mix(foil / max(lightness(foil), 0.04), base / max(inkLevel, 0.04), chroma);
			foil = mix(foil, clamp(hue * mix(inkLevel, lightness(foil), 0.3), 0.0, 1.0), ink.a);
		}
	}
	// Foil areas take the reflection as their colour; a chrome coat only catches highlights.
	over(result, foil, smoothstep(0.45, 0.9, metal) * u_foil);

	// Relief light and shade, relative to the flat stock so unrelieved print keeps its colour.
	float lambert = dot(normal, toLight) - toLight.z;
	over(result, vec3(0.0), max(-lambert, 0.0) * 0.8);
	over(result, mix(vec3(1.0), tint, metal), max(lambert, 0.0) * 0.5 * intensity);

	// Coat and foil highlights: tight and bright on mirror coats, broad and faint on matte stock.
	vec3 halfway = normalize(toLight + view);
	float shininess = mix(6.0, 140.0, gloss);
	// Foil catches the full highlight; plain coat a fraction of it, so the two separate under the light.
	float foiled = smoothstep(0.3, 0.9, metal);
	float reflectance = mix(u_coat, 1.0, foiled);
	float specular = pow(max(dot(normal, halfway), 0.0), shininess) * mix(0.04, 0.85, gloss) * intensity * u_shine * reflectance;
	// Metal reflects in its own colour, so coloured foil glints in its colour instead of washing to white.
	vec3 shine = mix(vec3(1.0), mix(clamp(foil * 1.6, 0.0, 1.0), holo, iridescence), metal * 0.85);
	over(result, shine, specular);

	// A spotlight lifts a soft glare over the whole card.
	float glare = exp(-dot(p - lightPosition.xy, p - lightPosition.xy) / 6.0) * v_light.z * u_glare * reflectance;
	over(result, vec3(1.0), glare);

	// Uncoated paper is not an even sheet: fibers clump into a faint warm mottle, strongest where the coat is thinnest.
	float unfoiled = 1.0 - smoothstep(0.3, 0.9, metal);
	float mottle = noise(p * 7.0) * 0.6 + noise(p * 23.0) * 0.3 + noise(vec2(p.x * 90.0, p.y * 30.0)) * 0.1;
	over(result, vec3(0.42, 0.36, 0.27), max(mottle - 0.35, 0.0) * 0.32 * pow(1.0 - gloss, 2.0) * u_paper * unfoiled);

	// Gem foil glints: a few spots in the holo catch a star of light and fade, each on its own rhythm.
	vec2 sparkCell = floor(p * 2.4);
	float pick = hash(sparkCell + 3.1);
	if (iridescence > 0.5 && metal > 0.5 && pick < 0.06) {
		vec2 centre = (sparkCell + 0.25 + 0.5 * hash2(sparkCell + 5.3)) / 2.4;
		vec2 d = abs(p - centre) * 2.4;
		float star = exp(-length(d) * 9.0) + 0.6 * (exp(-d.x * 40.0 - d.y * 7.0) + exp(-d.y * 40.0 - d.x * 7.0));
		float twinkle = pow(max(sin(u_time * (0.8 + pick * 10.0) + hash(sparkCell) * 6.28318), 0.0), 8.0);
		over(result, vec3(1.0), star * twinkle * iridescence);
	}

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
	/** The printed ink, packed at the same tile positions as the surface maps. */
	inkAtlas: WebGLTexture;
	uniforms: { resolution: WebGLUniformLocation | null; texel: WebGLUniformLocation | null; relief: WebGLUniformLocation | null; lightHeight: WebGLUniformLocation | null; glare: WebGLUniformLocation | null; shine: WebGLUniformLocation | null; foil: WebGLUniformLocation | null; coat: WebGLUniformLocation | null; holoPattern: WebGLUniformLocation | null; holoScale: WebGLUniformLocation | null; waves: WebGLUniformLocation | null; brush: WebGLUniformLocation | null; foilMode: WebGLUniformLocation | null; shift: WebGLUniformLocation | null; time: WebGLUniformLocation | null; paper: WebGLUniformLocation | null };
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
		attribute(4, 4, 14);
		gl.bindVertexArray(null);
		const atlas = this.#atlasTexture();
		const inkAtlas = this.#atlasTexture();
		gl.useProgram(program);
		gl.uniform1i(gl.getUniformLocation(program, 'u_map'), 0);
		gl.uniform1i(gl.getUniformLocation(program, 'u_ink'), 1);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		return {
			program,
			vao,
			instances,
			atlas,
			inkAtlas,
			uniforms: {
				resolution: gl.getUniformLocation(program, 'u_resolution'),
				texel: gl.getUniformLocation(program, 'u_texel'),
				relief: gl.getUniformLocation(program, 'u_relief'),
				lightHeight: gl.getUniformLocation(program, 'u_lightHeight'),
				glare: gl.getUniformLocation(program, 'u_glare'),
				shine: gl.getUniformLocation(program, 'u_shine'),
				foil: gl.getUniformLocation(program, 'u_foil'),
				coat: gl.getUniformLocation(program, 'u_coat'),
				holoPattern: gl.getUniformLocation(program, 'u_holoPattern'),
				holoScale: gl.getUniformLocation(program, 'u_holoScale'),
				waves: gl.getUniformLocation(program, 'u_waves'),
				brush: gl.getUniformLocation(program, 'u_brush'),
				foilMode: gl.getUniformLocation(program, 'u_foilMode'),
				shift: gl.getUniformLocation(program, 'u_shift'),
				time: gl.getUniformLocation(program, 'u_time'),
				paper: gl.getUniformLocation(program, 'u_paper')
			}
		};
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
			data[offset + 6] = tile.x / this.#atlasSize;
			data[offset + 7] = tile.y / this.#atlasSize;
			data[offset + 8] = tile.width / this.#atlasSize;
			data[offset + 9] = tile.height / this.#atlasSize;
			data[offset + 10] = card.lightX;
			data[offset + 11] = card.lightY;
			data[offset + 12] = card.spotlight;
			data[offset + 13] = TIER_CODE[card.tier] + 4 * (card.era ? HOLO_PATTERNS.indexOf(ERA_HOLO[card.era]) : 0);
			data[offset + 14] = card.viewX ?? 0;
			data[offset + 15] = card.viewY ?? 0;
			// The film's shift samples two sines of the card's seed, a pattern index the way a printed skin has one.
			const seed = (card.pattern ?? 0) * Math.PI * 2;
			data[offset + 16] = Math.sin(seed * 7.0) * FILM_SHIFT;
			data[offset + 17] = Math.sin(seed * 11.0 + 1.3) * FILM_SHIFT;
			count += 1;
		}
		const gl = this.#gl;
		gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (!count) return;
		gl.useProgram(resources.program);
		gl.uniform2f(resources.uniforms.resolution, this.#width, this.#height);
		gl.uniform1f(resources.uniforms.texel, 1 / this.#atlasSize);
		gl.uniform1f(resources.uniforms.relief, options.relief ?? DEFAULT_LIGHT.relief);
		gl.uniform1f(resources.uniforms.lightHeight, options.lightHeight ?? DEFAULT_LIGHT.lightHeight);
		gl.uniform1f(resources.uniforms.glare, options.glare ?? DEFAULT_LIGHT.glare);
		gl.uniform1f(resources.uniforms.shine, options.shine ?? DEFAULT_LIGHT.shine);
		gl.uniform1f(resources.uniforms.foil, options.foil ?? DEFAULT_LIGHT.foil);
		gl.uniform1f(resources.uniforms.coat, options.coat ?? DEFAULT_LIGHT.coat);
		gl.uniform1f(resources.uniforms.holoPattern, options.holoPattern ?? DEFAULT_LIGHT.holoPattern);
		gl.uniform1f(resources.uniforms.holoScale, options.holoScale ?? DEFAULT_LIGHT.holoScale);
		gl.uniform1f(resources.uniforms.waves, options.waves ?? DEFAULT_LIGHT.waves);
		gl.uniform1f(resources.uniforms.brush, options.brush ?? DEFAULT_LIGHT.brush);
		gl.uniform1f(resources.uniforms.foilMode, options.foilMode ?? DEFAULT_LIGHT.foilMode);
		gl.uniform1f(resources.uniforms.shift, options.shift ?? DEFAULT_LIGHT.shift);
		gl.uniform1f(resources.uniforms.time, performance.now() / 1000 % 3600);
		gl.uniform1f(resources.uniforms.paper, options.paper ?? DEFAULT_LIGHT.paper);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, resources.inkAtlas);
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
			gl.deleteTexture(resources.inkAtlas);
			gl.deleteBuffer(resources.instances);
			gl.deleteVertexArray(resources.vao);
			gl.deleteProgram(resources.program);
		}
		this.#resources = null;
		this.#maps.clear();
		this.#tiles.clear();
	}
}
