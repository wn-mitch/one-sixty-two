import type { CardEra } from '../era.ts';
import { dialLocals, glslName } from './films/film.ts';
import { plateDials, type Plate } from './plates/plate.ts';
import brushed from './plates/brushed.ts';
import hammered from './plates/hammered.ts';
import guilloche from './plates/guilloche.ts';
import sunburst from './plates/sunburst.ts';
import diamondPlate from './plates/diamond-plate.ts';
import pinstripe from './plates/pinstripe.ts';
import spun from './plates/spun.ts';
import carbon from './plates/carbon.ts';
import knurl from './plates/knurl.ts';
import damascus from './plates/damascus.ts';
import stain from './plates/stain.ts';
import weld from './plates/weld.ts';
import perlage from './plates/perlage.ts';
import scales from './plates/scales.ts';
import crackle from './plates/crackle.ts';
import leaf from './plates/leaf.ts';
import paisley from './plates/paisley.ts';
import wallpaper from './plates/wallpaper.ts';

/**
 * Foil plates: patterns pressed into silver and gold foil. Each is a height field; its slope tilts the
 * metal's normal, so the pattern shows as light and shade that move as the card tilts rather than as colour.
 * `brushed` keeps the plain brushed grain. Damascus, carbon and stain also change the metal's tone (`plateShade`).
 */
/** Every plate, in the order the shader numbers them. */
export const PLATES = [brushed, hammered, guilloche, sunburst, diamondPlate, pinstripe, spun, carbon, knurl, damascus, stain, weld, perlage, scales, crackle, leaf, paisley, wallpaper] as const satisfies readonly Plate[];
export const FOIL_PLATES = PLATES.map(plate => plate.name) as unknown as readonly ['brushed', 'hammered', 'guilloche', 'sunburst', 'diamond-plate', 'pinstripe', 'spun', 'carbon', 'knurl', 'damascus', 'stain', 'weld', 'perlage', 'scales', 'crackle', 'leaf', 'paisley', 'wallpaper'];
export type FoilPlate = (typeof FOIL_PLATES)[number];

/** Each era's plate: hand-hammered 1950s stamping, 1960s brushed metal to go with its mojo holo, a 1970s sunburst, 1980s weld beads, 1990s crumpled leaf, 2000s Damascus steel, 2010s carbon fibre and 2020s crackle. */
export const ERA_FOIL: Readonly<Record<CardEra, FoilPlate>> = {
	'1950s': 'hammered', '1960s': 'brushed', '1970s': 'sunburst', '1980s': 'weld',
	'1990s': 'leaf', '2000s': 'damascus', '2010s': 'carbon', '2020s': 'crackle'
};

/**
 * How an era's finish is tuned: the plate's scale (above 1 is finer), tone strength and stain coverage from 0
 * to 1, and how vivid its holo film prints (1 as designed; higher saturates it and sinks a patterned film's ground).
 */
export interface PlateTuning { scale: number; tone: number; stain: number; vivid?: number }

const PLATE_TUNING: PlateTuning = { scale: 1, tone: 1, stain: 0.6 };
/**
 * Each era's plate tuning. Carbon's weave is cut fine so it reads on narrow foil; the sunburst, the weld beads and
 * Damascus's layers are cut broad, and the weld's heat tint and Damascus's dark layers run strong. The 2000s HGH
 * sequence film prints vivid, so its letters stand out of the ground.
 */
export const ERA_PLATE_TUNING: Readonly<Record<CardEra, PlateTuning>> = {
	'1950s': PLATE_TUNING, '1960s': PLATE_TUNING, '1970s': { ...PLATE_TUNING, scale: 0.65, vivid: 1.05 }, '1980s': { scale: 0.75, tone: 3, stain: 1 },
	'1990s': { scale: 1, tone: 2, stain: 1, vivid: 1.15 }, '2000s': { scale: 0.45, tone: 0.4, stain: 0.52, vivid: 2.6 },
	'2010s': { ...PLATE_TUNING, scale: 2 }, '2020s': PLATE_TUNING
};

function plateFunctions(plate: Plate, index: number): string {
	const locals = dialLocals('plate', index, plateDials(plate));
	const fn = (type: string, part: string, body: string) => `${type} ${glslName('plate', plate.name)}_${part}(vec2 p) {\n${locals}\n\tp *= scale;\n${body}\n}`;
	return [
		plate.helpers ?? '',
		fn('float', 'height', plate.height ?? '\treturn 0.0;'),
		fn('vec2', 'shade', plate.shade ?? '\treturn vec2(0.0);'),
		fn('vec3', 'tint', plate.tint ?? '\treturn vec3(1.0);'),
		`vec2 ${glslName('plate', plate.name)}_dials() {\n${locals}\n\treturn vec2(scale, depth);\n}`
	].join('\n');
}

/** Branches on `plate` to each included plate's call, by its number in PLATES. */
function dispatch(plates: ReadonlySet<number>, call: (name: string, plate: Plate) => string): string {
	return PLATES.map((plate, index) => [plate, index] as const).filter(([, index]) => plates.has(index))
		.map(([plate, index], position) => `${position ? 'else ' : ''}if (plate == ${index}) ${call(glslName('plate', plate.name), plate)}`).join('\n\t');
}

/**
 * GLSL for the plates, in card units (the card is 5 by 7). Needs `hash`, `hash2`, `noise`, the `footprint` global,
 * the `plateScale`, `plateTone` and `plateStain` globals (the card's own tuning times the scene's) and the plate
 * tuning uniforms, and defines `plateShade`, `plateTint` and `foilSlope`, which returns the plate's slope scaled to
 * its feature size and faded out once the feature shrinks to a few pixels, where it would only alias.
 */
export function foilPlateGlsl(plates: ReadonlySet<number> = new Set(PLATES.map((_, index) => index))): string {
	return `
/** A temper colour by how hot the steel ran, 0 to 1: straw, bronze, purple, then blue. */
vec3 temperTint(float heat) {
	float t = heat * 3.0;
	vec3 straw = vec3(0.95, 0.74, 0.34);
	vec3 bronze = vec3(0.68, 0.38, 0.18);
	vec3 purple = vec3(0.45, 0.24, 0.6);
	vec3 blue = vec3(0.22, 0.42, 0.88);
	vec3 tint = t < 1.0 ? mix(straw, bronze, t) : t < 2.0 ? mix(bronze, purple, t - 1.0) : mix(purple, blue, t - 2.0);
	// Oxide is a muted film, not paint: keep a little of its hue over a smoky brown-grey.
	float level = dot(tint, vec3(0.3, 0.55, 0.15));
	return mix(vec3(level) * vec3(1.05, 0.98, 0.9), tint, 0.4);
}
${PLATES.map((plate, index) => plates.has(index) ? plateFunctions(plate, index) : '').join('\n')}

/** How a plate changes the metal: x darkens it (Damascus's dark layers, carbon's black tows), y tints it. Scaled by plateTone. */
vec2 plateShade(vec2 p, int plate) {
	p *= plateScale;
	${dispatch(plates, name => `return ${name}_shade(p) * plateTone;`)}
	return vec2(0.0);
}

/** The colour a plate's tint runs toward: a stain spot's temper colour, or the temper bands beside a weld. */
vec3 plateTint(vec2 p, int plate) {
	p *= plateScale;
	${dispatch(plates, name => `return ${name}_tint(p);`)}
	return vec3(1.0);
}

float plateHeight(vec2 p, int plate) {
	${dispatch(plates, name => `return ${name}_height(p);`)}
	return 0.0;
}

/** The plate's feature size and its dials' scale and depth. */
vec3 plateShape(int plate) {
	${dispatch(plates, (name, plate) => `return vec3(${plate.feature}, ${name}_dials());`)}
	return vec3(0.2, 1.0, 0.35);
}

vec2 foilSlope(vec2 p, int plate) {
	p *= plateScale;
	vec3 shape = plateShape(plate);
	// The plate's own scale is applied inside it, so its features shrink by that too.
	float feature = shape.x / shape.y;
	float e = feature * 0.08;
	float h = plateHeight(p, plate);
	vec2 slope = vec2(plateHeight(p + vec2(e, 0.0), plate) - h, plateHeight(p + vec2(0.0, e), plate) - h) / e * feature * shape.z;
	return slope * smoothstep(2.5, 6.0, feature / (footprint * plateScale));
}
`;
}

/** The GLSL for every plate, for checks and tools that need the whole set. */
export const FOIL_PLATE_GLSL = foilPlateGlsl();
