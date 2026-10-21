import { describe, expect, it } from 'vitest';
import { ERA_HOLO, FILM_FINISHES, FILMS, PALETTES } from './holo-films.ts';
import { PLATES } from './foil-plates.ts';
import { filmDials, TUNE_SLOTS, type Dial } from './films/film.ts';
import { plateDials } from './plates/plate.ts';
import { programKey } from './light-programs.ts';
import { programSpec } from './light-renderer.ts';
import { FILM_CODE, lightFragment, PALETTE_CODE, PLATE_CODE } from './light-shader.ts';

const modules: { kind: string; name: string; dials: Record<string, Dial> }[] = [
	...FILMS.map(film => ({ kind: 'film', name: film.name, dials: filmDials(film) })),
	...PLATES.map(plate => ({ kind: 'plate', name: plate.name, dials: plateDials(plate) })),
	...FILM_FINISHES.map(finish => ({ kind: 'finish', name: finish.name, dials: finish.params }))
];

describe('finish modules', () => {
	it.each(modules)('$kind $name fits the tuning slots with its shipped values in range', ({ dials }) => {
		// A dial past the last slot reads past the end of the uniform array and the shader fails to compile.
		expect(Object.keys(dials).length).toBeLessThanOrEqual(TUNE_SLOTS);
		for (const [key, dial] of Object.entries(dials)) {
			expect(dial.value, key).toBeGreaterThanOrEqual(dial.min);
			expect(dial.value, key).toBeLessThanOrEqual(dial.max);
		}
	});

	it('names every film, finish, colourway and plate once', () => {
		for (const list of [FILMS, FILM_FINISHES, PALETTES, PLATES]) {
			const names = list.map(module => module.name);
			expect(new Set(names).size).toBe(names.length);
		}
	});

	it('appends the new colourways without changing existing shader indices', () => {
		expect(PALETTES.map(palette => palette.name)).toEqual([
			'rainbow', 'oil-slick', 'aurora', 'thermal', 'gold-leaf', 'ice', 'synthwave',
			'sunset', 'mint', 'rose-gold', 'vaporwave', 'mono-silver', 'custom'
		]);
	});

	it('fades the jackpot through every era film, oldest first', () => {
		expect(FILMS.find(film => film.name === 'jackpot')?.blend).toEqual(Object.values(ERA_HOLO));
	});

	it('gives every film, plate and colourway its own range of the packed card code', () => {
		// A film number past its range spills into the plate's, and the card prints the wrong film over the wrong plate.
		expect(FILMS.length * FILM_CODE).toBeLessThanOrEqual(PLATE_CODE);
		expect(PLATES.length * PLATE_CODE).toBeLessThanOrEqual(PALETTE_CODE);
		// The code rides in a float attribute, exact only below 2^24.
		expect((PALETTES.length + 1) * PALETTE_CODE).toBeLessThan(2 ** 24);
	});

	it('points every film at a finish and colourway that exist', () => {
		for (const film of FILMS) {
			if (film.finish) expect(FILM_FINISHES.map(finish => finish.name)).toContain(film.finish);
			if (film.palette) expect(PALETTES.map(palette => palette.name)).toContain(film.palette);
		}
	});
});

describe('light programs', () => {
	const film = (name: string) => FILMS.findIndex(entry => entry.name === name);
	const plate = (name: string) => PLATES.findIndex(entry => entry.name === name);

	it('carry only a card\'s own film and plate, and draw that film once', () => {
		const spec = programSpec(film('carpet'), plate('sunburst'), {});
		expect([...spec.films].sort()).toEqual([0, film('carpet')].sort());
		expect([...spec.plates]).toEqual([plate('sunburst')]);
		const glsl = lightFragment(spec);
		expect(glsl).not.toContain('film_dollar');
		expect(glsl).not.toContain('plate_leaf_height');
		// One holoFilm call in topFoil, none for an under film or a crossfade.
		expect(glsl.match(/= holoFilm\(|return holoFilm\(/g)).toHaveLength(1);
	});

	it('keep a film\'s own under film and the scene\'s, or drop it when the scene prints none', () => {
		const circuit = programSpec(film('circuit'), 0, {});
		expect(circuit.films.has(film('spun'))).toBe(true);
		expect(circuit.under).toBe(true);
		const forced = programSpec(film('carpet'), 0, { underFilm: film('galaxy') });
		expect(forced.films.has(film('galaxy'))).toBe(true);
		expect(forced.under).toBe(true);
		expect(programSpec(film('circuit'), 0, { underFilm: -2 }).under).toBe(false);
	});

	it('carry every film the fading film fades through', () => {
		const spec = programSpec(film('jackpot'), 0, {});
		for (const name of FILMS.find(entry => entry.name === 'jackpot')!.blend!) expect(spec.films.has(film(name))).toBe(true);
		expect(lightFragment(spec)).toContain('blendPick');
	});

	it('carries every colourway for either scene or per-card remixes without widening plain cards', () => {
		const plain = programSpec(film('carpet'), 0, {});
		const sceneRemix = programSpec(film('carpet'), 0, { palette: 2 });
		const cardRemix = programSpec(film('carpet'), 0, {}, 2);
		expect(sceneRemix.remix).toBe(true);
		expect(cardRemix.remix).toBe(true);
		for (const palette of PALETTES) expect(lightFragment(cardRemix)).toContain(`palette_${palette.name.replaceAll('-', '_')}`);
		expect(programKey(cardRemix)).toBe(programKey(sceneRemix));
		expect(programKey(cardRemix)).not.toBe(programKey(plain));
		expect(lightFragment(cardRemix)).toContain('cardPalette >= 0 ? cardPalette');
	});

	it('updates custom gradient uniforms without compiling another program', () => {
		const custom = PALETTES.findIndex(palette => palette.name === 'custom');
		const first = programSpec(film('carpet'), 0, { palette: custom, customGradient: ['#204060', '#6080a0'] });
		const second = programSpec(film('carpet'), 0, { palette: custom, customGradient: ['#804020', '#c08060'] });
		expect(programKey(first)).toBe(programKey(second));
		expect(lightFragment(first)).toContain('uniform vec3 u_customGradient[5]');
	});

	it.each(Object.entries(ERA_HOLO))('the %s era program is a fraction of the full shader', era => {
		const spec = programSpec(film(ERA_HOLO[era as keyof typeof ERA_HOLO]), 0, {});
		expect(lightFragment(spec).length).toBeLessThan(lightFragment().length / 2);
	});
});
