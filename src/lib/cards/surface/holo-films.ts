import type { CardEra } from '../era.ts';
import { dialLocals, filmDials, glslName, type FilmFinish, type Film, type Palette } from './films/film.ts';
import { SHARED_FILM_GLSL } from './films/shared.ts';
import refractor from './films/refractor.ts';
import prizm from './films/prizm.ts';
import crackedIce from './films/cracked-ice.ts';
import spun from './films/spun.ts';
import brilliant from './films/brilliant.ts';
import shimmer from './films/shimmer.ts';
import atomic from './films/atomic.ts';
import xfractor from './films/xfractor.ts';
import mojo from './films/mojo.ts';
import geodesic from './films/geodesic.ts';
import carpet from './films/carpet.ts';
import circuit from './films/circuit.ts';
import dollar from './films/dollar.ts';
import hgh from './films/hgh.ts';
import hghSequence from './films/hgh-sequence.ts';
import qrCode from './films/qr-code.ts';
import doubleHelix from './films/double-helix.ts';
import julia from './films/julia.ts';
import fibonacci from './films/fibonacci.ts';
import mobius from './films/mobius.ts';
import oilPuddle from './films/oil-puddle.ts';
import galaxy from './films/galaxy.ts';
import jackpot from './films/jackpot.ts';
import paisley from './films/paisley.ts';
import penrose from './films/penrose.ts';
import pinwheel from './films/pinwheel.ts';
import poincareDisk from './films/poincare-disk.ts';
import apollonian from './films/apollonian.ts';
import gosper from './films/gosper.ts';
import matrix from './films/matrix.ts';
import spiralMoire from './films/spiral-moire.ts';
import wallpaper from './films/wallpaper.ts';
import smoke from './films/smoke.ts';
import smooth from './finishes/smooth.ts';
import bump from './finishes/bump.ts';
import brushed from './finishes/brushed.ts';
import etched from './finishes/etched.ts';
import sparkle from './finishes/sparkle.ts';
import hammered from './finishes/hammered.ts';
import rainbow from './palettes/rainbow.ts';
import oilSlick from './palettes/oil-slick.ts';
import aurora from './palettes/aurora.ts';
import thermal from './palettes/thermal.ts';
import goldLeaf from './palettes/gold-leaf.ts';
import ice from './palettes/ice.ts';
import synthwave from './palettes/synthwave.ts';
import sunset from './palettes/sunset.ts';
import mint from './palettes/mint.ts';
import roseGold from './palettes/rose-gold.ts';
import vaporwave from './palettes/vaporwave.ts';
import monoSilver from './palettes/mono-silver.ts';
import custom from './palettes/custom.ts';

/** Every holo film, in the order the shader numbers them. */
export const FILMS = [refractor, prizm, crackedIce, spun, brilliant, shimmer, atomic, xfractor, mojo, geodesic, carpet, circuit, dollar, hgh, hghSequence, qrCode, doubleHelix, julia, fibonacci, mobius, oilPuddle, galaxy, jackpot, paisley, penrose, pinwheel, poincareDisk, apollonian, gosper, matrix, spiralMoire, wallpaper, smoke] as const satisfies readonly Film[];
export const HOLO_PATTERNS = FILMS.map(film => film.name) as unknown as readonly ['refractor', 'prizm', 'cracked-ice', 'spun', 'brilliant', 'shimmer', 'atomic', 'xfractor', 'mojo', 'geodesic', 'carpet', 'circuit', 'dollar', 'hgh', 'hgh-sequence', 'qr-code', 'double-helix', 'julia', 'fibonacci', 'mobius', 'oil-puddle', 'galaxy', 'jackpot', 'paisley', 'penrose', 'pinwheel', 'poincare-disk', 'apollonian', 'gosper', 'matrix', 'spiral-moire', 'wallpaper', 'smoke'];
export type HoloPattern = (typeof HOLO_PATTERNS)[number];

/** Films that move with time; the light engine keeps redrawing cards that show one. */
export const ANIMATED_FILMS: ReadonlySet<string> = new Set(FILMS.filter(film => film.animated).map(film => film.name));

/** The surfaces a film can be pressed with; each film names its own, and a scene can swap it. */
export const FILM_FINISHES = [smooth, bump, brushed, etched, sparkle, hammered] as const satisfies readonly FilmFinish[];
/** The colourways a film can print in; rainbow unless a film or the scene picks another. Existing indices stay stable. */
export const PALETTES = [rainbow, oilSlick, aurora, thermal, goldLeaf, ice, synthwave, sunset, mint, roseGold, vaporwave, monoSilver, custom] as const satisfies readonly Palette[];

/**
 * Each era's holo film: Atomic Age bubbles for the 1950s, a psychedelic mojo swirl for the 1960s, the Atlanta
 * Marriott Marquis lobby carpet for the 1970s, Xfractor grids for the 1980s, a circuit board for the 1990s, the
 * double-helix ladders for the 2000s, cracked ice for the 2010s, and dollar signs for the 2020s.
 */
export const ERA_HOLO: Readonly<Record<CardEra, HoloPattern>> = {
	'1950s': 'atomic', '1960s': 'mojo', '1970s': 'carpet', '1980s': 'xfractor',
	'1990s': 'circuit', '2000s': 'double-helix', '2010s': 'cracked-ice', '2020s': 'dollar'
};

/** Every film's number. */
const ALL_FILMS: ReadonlySet<number> = new Set(FILMS.map((_, index) => index));

/**
 * What a program's film code carries: the films it can draw, whether the scene may swap any finish and colourway
 * onto them (`remix`), and whether any card in it shows an under film. Leaving a part out keeps it from the shader.
 */
export interface FilmSpec {
	films: ReadonlySet<number>;
	remix: boolean;
	under: boolean;
}

const FULL_SPEC: FilmSpec = { films: ALL_FILMS, remix: true, under: true };

const OUTPUTS = 'inout vec2 groove, inout float seed, inout float vivid, inout float copper, inout float copperPad, inout float shade, inout float cellSize, inout float ground';

function filmFunction(film: Film, index: number): string {
	const dials = filmDials(film);
	const slide = 'slideWithTilt' in dials && !('slideWithTilt' in film.params);
	return `${film.helpers ?? ''}
void ${glslName('film', film.name)}(vec2 p, ${OUTPUTS.replace('inout float ground', 'inout float groundOut')}) {
${dialLocals('film', index, dials)}
	float filmScale = u_holoScale * scale;${film.ground === undefined ? '' : '\n\tgroundOut = ground;'}
${slide ? '\tp -= v_view.xy * u_shift * slideWithTilt;' : ''}
${film.glsl}
}`;
}

function finishFunction(finish: FilmFinish, index: number): string {
	return `void ${glslName('finish', finish.name)}(vec2 p, vec2 groove, inout vec3 normal, inout float sweep) {
${dialLocals('finish', index, finish.params)}
${finish.glsl}
}`;
}

function paletteFunction(palette: Palette): string {
	return `vec3 ${glslName('palette', palette.name)}(float t) {
	${palette.glsl.trim()}
}`;
}

/** Branches on `which` to each module's call, by its number in its registry; `only` limits it to the modules a program includes. */
function dispatch<T extends { name: string }>(modules: readonly T[], call: (module: T) => string, only?: ReadonlySet<number>): string {
	return modules.map((module, index) => [module, index] as const).filter(([, index]) => !only || only.has(index))
		.map(([module, index], position) => `${position ? 'else ' : ''}if (which == ${index}) ${call(module)}`).join('\n\t');
}

/** The one film that fades between others, and the films it fades through, by number. */
const BLEND = (() => {
	const blends = FILMS.filter(film => film.blend);
	if (blends.length !== 1) throw new Error('Exactly one film fades between others.');
	const film = blends[0]!;
	const films = film.blend!.map(name => FILMS.findIndex(other => other.name === name));
	if (films.some(index => index < 0)) throw new Error(`${film.name} fades through a film that does not exist.`);
	return { index: FILMS.indexOf(film as (typeof FILMS)[number]), films, dials: filmDials(film) };
})();

/** The fading film: picks its films over time and crossfades between two of them. */
const BLEND_GLSL = `const int BLEND_FILM = ${BLEND.index};
const int BLEND_FILMS[${BLEND.films.length}] = int[](${BLEND.films.join(', ')});
// How long the fading film holds each film and how long each crossfade takes, in seconds.
vec2 blendTiming() {
${dialLocals('film', BLEND.index, BLEND.dials)}
	return vec2(max(hold, 0.0), max(fade, 0.05));
}

// Which of its films the fading film shows on a given turn, shuffled so the next one is a surprise.
int blendPick(float turn) {
	return int(floor(fract(sin(turn * 12.9898 + 4.1414) * 43758.5453) * ${BLEND.films.length}.0)) % ${BLEND.films.length};
}

// A film by number. The fading film draws one of its films, or two mid-crossfade, and mixes their colour and flash.
vec3 topFoil(vec2 p, vec3 normal, vec3 halfway, float band, float pattern, out float flash, out float feature) {
	int film = int(pattern + 0.5);
	if (film != BLEND_FILM) return holoFilm(p, normal, halfway, band, film, flash, feature);
	vec2 timing = blendTiming();
	float period = timing.x + timing.y;
	float turn = u_time / period;
	int index = blendPick(floor(turn));
	int following = blendPick(floor(turn) + 1.0);
	// A shuffled order never shows the same film twice running.
	if (following == index) following = (index + 1) % ${BLEND.films.length};
	float t = smoothstep(timing.x / period, 1.0, fract(turn));
	vec3 color = holoFilm(p, normal, halfway, band, BLEND_FILMS[index], flash, feature);
	if (t <= 0.0) return color;
	float nextFlash;
	float nextFeature;
	vec3 next = holoFilm(p, normal, halfway, band, BLEND_FILMS[following], nextFlash, nextFeature);
	flash = mix(flash, nextFlash, t);
	feature = mix(feature, nextFeature, t);
	return mix(color, next, t);
}
`;

/** Without the fading film a card's film is drawn once. */
const NO_BLEND_GLSL = `
vec3 topFoil(vec2 p, vec3 normal, vec3 halfway, float band, float pattern, out float flash, out float feature) {
	return holoFilm(p, normal, halfway, band, int(pattern + 0.5), flash, feature);
}
`;

const filmFinish = (film: Film) => FILM_FINISHES.findIndex(finish => finish.name === (film.finish ?? 'smooth'));
const filmPalette = (film: Film) => PALETTES.findIndex(palette => palette.name === (film.palette ?? 'rainbow'));

/**
 * GLSL for the holo films, in card units (the card is 5 by 7). Needs `CARD`, `hash`, `hash2`, `noise`, the
 * `footprint` and `holoVivid` globals, the `u_holoScale`, `u_time`, `u_circuit`, `u_finish`, `u_palette`,
 * per-card `cardPalette`, CSS-pixel quad size `v_cardSize`, tuning uniforms and the `v_view` varying, and defines `holoFoil`.
 */
export function holoFilmGlsl(spec: FilmSpec = FULL_SPEC): string {
	const { films, remix, under } = spec;
	const included = FILMS.filter((_, index) => films.has(index));
	// A remixing scene can put any finish and colourway on any film; otherwise only the included films' own.
	const finishes = remix ? undefined : new Set(included.map(filmFinish));
	const palettes = remix ? undefined : new Set([0, ...included.map(filmPalette)]);
	const blend = films.has(BLEND.index);
	return `
${SHARED_FILM_GLSL}
${FILMS.map((film, index) => films.has(index) ? filmFunction(film, index) : '').join('\n')}
${FILM_FINISHES.map((finish, index) => !finishes || finishes.has(index) ? finishFunction(finish, index) : '').join('\n')}
${PALETTES.map((palette, index) => !palettes || palettes.has(index) ? paletteFunction(palette) : '').join('\n')}

void filmPattern(int which, vec2 p, ${OUTPUTS}) {
	${dispatch(FILMS, film => `${glslName('film', film.name)}(p, groove, seed, vivid, copper, copperPad, shade, cellSize, ground);`, films)}
}
void filmFinish(int which, vec2 p, vec2 groove, inout vec3 normal, inout float sweep) {
	${dispatch(FILM_FINISHES, finish => `${glslName('finish', finish.name)}(p, groove, normal, sweep);`, finishes)}
}
vec3 paint(int which, float t) {
	${dispatch(PALETTES, palette => `return ${glslName('palette', palette.name)}(t);`, palettes)}
	return palette_rainbow(t);
}
// Each film's own finish and colourway, by film number; the scene can override both.
const int FILM_FINISH[${FILMS.length}] = int[](${FILMS.map(filmFinish).join(', ')});
const int FILM_PALETTE[${FILMS.length}] = int[](${FILMS.map(filmPalette).join(', ')});
// Each film's own under film, by number, or -1 for none.
const int FILM_UNDER[${FILMS.length}] = int[](${FILMS.map(film => FILMS.findIndex(other => other.name === film.under)).join(', ')});

// Holo foil gets its colour from fine grooves that split light by wavelength, so the hue follows how
// the light-to-eye direction crosses the grooves. Patterned foils run the grooves a different way in
// each facet or shard, so neighbouring pieces flash different colours. The flash output is how squarely a
// piece's grooves face the light.
vec3 holoFilm(vec2 p, vec3 normal, vec3 halfway, float band, int film, out float flash, out float feature) {
	flash = 0.0;
	// How much of this spot is the film's own feature rather than its ground; a film without a copper stage is all feature.
	feature = 1.0;
	vec2 groove = vec2(1.0, 0.0);
	float seed = 0.0;
	// Films whose grooves run continuously show their full colour; faceted films are mostly silver between flashes.
	float vivid = 0.0;
	float copper = 0.0;
	float copperPad = 0.0;
	float shade = 1.0;
	// The film's repeat, in card units; a patterned film fades to a smooth sweep once it shrinks to a few pixels.
	float cellSize = 100.0;
	// Below zero, the film has no copper stage: its ground prints at full strength.
	float ground = -1.0;
	filmPattern(film, p, groove, seed, vivid, copper, copperPad, shade, cellSize, ground);
	float sweepShift = 0.0;
	filmFinish(u_finish >= 0 ? u_finish : FILM_FINISH[film], p, groove, normal, sweepShift);
	int palette = cardPalette >= 0 ? cardPalette : u_palette >= 0 ? u_palette : FILM_PALETTE[film];
	vec3 sweepColor = paint(palette, band * 0.7 + p.x * 0.06 + p.y * 0.04 + dot(normal.xy, vec2(1.6, 1.1)) + sweepShift);
	if (film == 0) return sweepColor;
	// Gratings are far more angle-sensitive than a mirror, so a small tilt sweeps the colour a long way.
	vec2 tilt = halfway.xy * 3.0 + normal.xy * 0.5;
	float across = dot(tilt, vec2(-groove.y, groove.x));
	// A rainbow sweep the pieces share: it rolls across the card as it tilts, and each piece flashes as the sweep passes.
	float sweep = dot(tilt, vec2(0.8, 0.6)) * 1.6 + p.x * 0.09 + p.y * 0.06 + sweepShift;
	float pass = 0.5 + 0.5 * sin(sweep * 6.28318);
	flash = pow(max(1.0 - abs(fract(across * 0.5 + seed) - 0.5) * 3.0, 0.0), 3.0) * (0.35 + 0.9 * pass);
	vec3 color = paint(palette, sweep + across * 0.6 + seed * 0.2);
	// Patterned foil is mostly silver; a piece shows its colour as its grooves turn toward the light.
	vec3 faceted = seed < 0.0 ? vec3(0.82, 0.84, 0.88) : mix(vec3(0.82, 0.84, 0.88), color, 0.35 + 0.65 * max(flash, pass * 0.6));
	vec3 film_ = mix(faceted, color, vivid) * shade;
	float detail = smoothstep(1.5, 4.0, cellSize / footprint);
	if (ground >= 0.0) {
		feature = mix(1.0, max(copper, copperPad), detail);
		// A vivid film sinks its ground further, so the traces, signs and letters stand out of it; copper features shine, and pads shine gold.
		float mask = ground / (1.0 + max(holoVivid - 1.0, 0.0) * 0.9);
		film_ = mix(mix(film_ * mask, min(film_ * 1.15, 1.0), copper), vec3(1.0, 0.82, 0.48) * (0.8 + 0.4 * pass), copperPad * 0.7);
	}
	// Too small to resolve, the pattern would alias into speckle; it settles into the plain refractor sweep instead.
	vec3 smooth_ = mix(vec3(0.82, 0.84, 0.88), sweepColor, 0.6);
	flash *= detail;
	return mix(smooth_, film_, detail);
}

${blend ? BLEND_GLSL : NO_BLEND_GLSL}
// The card's film, with the scene's under film showing through its ground.
vec3 holoFoil(vec2 p, vec3 normal, vec3 halfway, float band, float pattern, out float flash) {
	float feature;
	vec3 color = topFoil(p, normal, halfway, band, pattern, flash, feature);
	// The scene's under film, else the film's own; -2 prints none.
	int underFilm = u_underFilm >= 0 || u_underFilm == -2 ? u_underFilm : FILM_UNDER[int(pattern + 0.5)];
	if (${under ? 'underFilm < 0 || pattern < 0.5' : 'true'}) return color;
	float underFlash;
	float underFeature;
	// The under film is offset so its repeat never lines up with the top film's.
	vec3 under = topFoil(p + vec2(0.37, 0.61), normal, halfway, band, float(underFilm), underFlash, underFeature);
	float show = (1.0 - feature) * clamp(u_underMix, 0.0, 1.0);
	flash = mix(flash, underFlash, show);
	return mix(color, under, show);
}
`;
}

/** The GLSL for every film, for checks and tools that need the whole set. */
export const HOLO_FILM_GLSL = holoFilmGlsl();

/**
 * The films a program needs to draw `film`: the film itself, refractor (vinyl stickers print through it), the
 * under film it names or the scene sets, and, for the fading film, every film it fades through.
 */
export function filmsFor(film: number, sceneUnder = -1): Set<number> {
	const films = new Set([0, film]);
	const under = underOf(film, sceneUnder);
	if (under >= 0) films.add(under);
	if (films.has(BLEND.index)) for (const index of BLEND.films) films.add(index);
	return films;
}

/** The film printed under `film`: the scene's (-2 prints none), else the film's own, or -1 for none. */
export function underOf(film: number, sceneUnder = -1): number {
	if (sceneUnder >= 0 || sceneUnder === -2) return sceneUnder === -2 ? -1 : sceneUnder;
	return FILMS.findIndex(other => other.name === FILMS[film]?.under);
}
