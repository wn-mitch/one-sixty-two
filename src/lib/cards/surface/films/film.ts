/**
 * The module shape shared by holo films, film finishes, colourways and foil plates. Each module is GLSL plus
 * named dials; every dial prints as a constant unless the scene tunes that module, when it reads a uniform
 * slot instead, so one module can be tweaked live while every other card keeps its shipped look.
 */

/** One dial: its shipped value and the range a workshop slider offers. */
export interface Dial {
	value: number;
	min: number;
	max: number;
	step?: number;
	/** What the dial does, for the workshop. */
	note?: string;
}

/** How many dials one module can expose, including its scale and, for films, its ground. */
export const TUNE_SLOTS = 13;

/** Live values for one module: its index in its registry and a value per dial, in declaration order. */
export interface ModuleTune {
	index: number;
	values: readonly number[];
}

/** A GLSL float literal. */
export function glslFloat(value: number): string {
	const text = String(value);
	return /[.e]/.test(text) ? text : `${text}.0`;
}

/** A GLSL identifier from a module name. */
export function glslName(prefix: string, name: string): string {
	return `${prefix}_${name.replaceAll('-', '_')}`;
}

/**
 * Declares each dial as a local the module's GLSL reads by name: the constant, or the tuned slot when the
 * scene tunes this module. `kind` names the uniforms (`u_<kind>Tune` and `u_tune<Kind>`).
 */
export function dialLocals(kind: string, index: number, dials: Readonly<Record<string, Dial>>): string {
	const which = `u_tune${kind[0]!.toUpperCase()}${kind.slice(1)}`;
	return Object.entries(dials).map(([name, dial], slot) =>
		`\tfloat ${name} = ${which} == ${index} ? u_${kind}Tune[${slot}] : ${glslFloat(dial.value)};`).join('\n');
}

/** Each dial's shipped value, in slot order, for a workshop to start from. */
export function dialValues(dials: Readonly<Record<string, Dial>>): number[] {
	return Object.values(dials).map(dial => dial.value);
}

/**
 * A holo film's pattern: where its grooves run, how its pieces colour, and which parts are copper.
 * The GLSL body reads `p` (card units, shifted per card), `filmScale` and its dials, and sets `groove`, `seed`,
 * `vivid`, `copper`, `copperPad`, `shade` and `cellSize`. A film with a `ground` dims its uncoppered ground to it.
 * A film that draws a view-dependent image paints it into `own` (colour, then how much of the film it replaces)
 * and sets how brightly that image catches the light in `ownFlash`.
 */
export interface Film {
	name: string;
	/** Multiplies the scene's holo scale for this film; above 1 is finer. */
	scale?: number;
	/** How bright the ground between copper features prints; films without one have no copper stage. */
	ground?: number;
	/** The surface the film is pressed with, by finish name; smooth by default. */
	finish?: string;
	/** The colourway it prints in, by name; rainbow by default. */
	palette?: string;
	/** A film printed under this one, by name, showing through its ground; none by default. */
	under?: string;
	/**
	 * Films this one fades between in turn instead of drawing a pattern of its own; its `hold` and `fade` dials
	 * time the cycle in seconds.
	 */
	blend?: readonly string[];
	/** Moves with time as well as with the light, so a card showing it keeps redrawing while it is on screen. */
	animated?: boolean;
	/** A visual study for the workshop: drawn in the lab and Storybook but never offered in the shop. */
	experimental?: boolean;
	params: Record<string, Dial>;
	/** GLSL helper functions the body calls, emitted once before it. */
	helpers?: string;
	glsl: string;
}

export function defineFilm(film: Film): Film {
	return film;
}

/** Every dial: scale, optional ground, module settings, then tilt travel for patterned films without their own. */
export function filmDials(film: Film): Record<string, Dial> {
	return {
		scale: { value: film.scale ?? 1, min: 0.2, max: 4, step: 0.01, note: 'Pattern size; above 1 is finer.' },
		...(film.ground === undefined ? {} : { ground: { value: film.ground, min: 0, max: 1.5, step: 0.01, note: 'Brightness of the ground between features.' } }),
		...film.params,
		...(film.glsl && !film.blend && !('slideWithTilt' in film.params) ? {
			slideWithTilt: { value: 0, min: 0, max: 4, step: 0.05, note: 'Slide the pattern with tilt on both axes. 0 fixes it; a held pose holds its position.' }
		} : {})
	};
}

/**
 * A finish: the micro-surface a film is pressed with, from smooth to brushed grain, etched lines or glitter.
 * The GLSL body reads `p`, `groove` and its dials and may change `normal` (tilting the facet the light sees)
 * and `sweep` (moving where the rainbow falls).
 */
export interface FilmFinish {
	name: string;
	params: Record<string, Dial>;
	glsl: string;
}

export function defineFinish(finish: FilmFinish): FilmFinish {
	return finish;
}

/** A colourway: the colours a film's grooves split light into, as a GLSL body returning a colour for `t`. */
export interface Palette {
	name: string;
	glsl: string;
}

export function definePalette(palette: Palette): Palette {
	return palette;
}
